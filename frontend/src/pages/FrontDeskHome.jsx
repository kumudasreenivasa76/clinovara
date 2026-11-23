import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  IconUserPlus, IconCalendarPlus, IconDoorEnter, IconCash, IconSearch, IconCalendarEvent, IconUserCheck, IconHourglassHigh, IconCircleCheck,
  IconUserX, IconCurrencyRupee, IconReceipt2, IconUsers, IconArmchair, IconStethoscope, IconPhoneCall, IconBellRinging, IconX, IconChevronRight,
} from '@tabler/icons-react';
import { get, post, patch, put } from '../lib/api.js';
import { fmtMoney, fmtTime, ago } from '../lib/format.js';
import { Card, Body, usePoll, useAction, Modal } from '../components/ui.jsx';
import { PageHeader, longDate } from '../components/dash.jsx';

/** One status word and colour per appointment, the same everywhere on the front desk. */
const STATUS = {
  pending: ['To confirm', 'st-pending'], confirmed: ['Confirmed', 'st-confirmed'], checked_in: ['Checked in', 'st-checkedin'], waiting: ['Waiting', 'st-waiting'],
  in_chair: ['In chair', 'st-inchair'], completed: ['Completed', 'st-completed'], cancelled: ['Cancelled', 'st-cancelled'], no_show: ['No show', 'st-noshow'],
};
const PAY = { paid: ['Paid', 'pay-paid'], insurance: ['Insurance', 'pay-ins'], unpaid: ['Unpaid', 'pay-unpaid'] };
const QUEUE_NEXT = { arrived: ['ready', 'Mark waiting'], checking_in: ['ready', 'Mark waiting'], needs_attention: ['ready', 'Mark waiting'], ready: ['called', 'Call'], called: ['brought_back', 'In chair'] };
const DENTIST_STATE = { with_patient: ['With a patient', 'ds-busy'], free: ['Free', 'ds-free'], away: ['Away', 'ds-away'], off: ['Not in today', 'ds-off'] };
const Badge = ({ map, value }) => { const [label, cls] = map[value] || [value, '']; return <span className={`fdx-badge ${cls}`}>{label}</span>; };

/** Front desk dashboard: the whole clinic's day on one screen, with the four things reception does most one click away. */
export default function FrontDeskHome({ branch, locations }) {
  const [run, busy] = useAction();
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState(null); // 'checkin' | 'pay' | { pay: row }
  const q = branch ? `?locationId=${branch}` : '';
  const { data, reload } = usePoll(() => get(`/api/frontdesk/summary${q}`), [branch], 15000);
  const act = (fn, done) => run(async () => { await fn(); await reload?.(); }, done);
  if (!data) return <div className="skeleton" />;

  const { kpis: k, schedule, queue, dentists, chairs, pendingConfirmations: pc, payments, followUps, missed, walkIns, activity } = data;
  const tasks = data.tasks || { open: 0, items: [] };
  const task = (id, status, msg) => { const note = status === 'done' ? window.prompt('Anything the dentist should know? (optional)') : ''; if (note === null) return; act(() => patch(`/api/frontdesk/tasks/${id}`, { status, note: note || undefined }), msg); };
  const handoff = (s) => { const note = window.prompt(`Note for the dentist about ${s.patientName} (administrative only):`, s.handoff?.note || ''); if (!note || !note.trim()) return; act(() => put(`/api/frontdesk/handoff/${s.id}`, { note }), 'The dentist can see your note'); };
  const branchName = locations.find((l) => l.id === branch)?.name || 'All branches';
  const showBranch = !branch && locations.length > 1;

  const confirm = (id) => act(() => post(`/api/appointments/${id}/confirm`), 'Appointment confirmed');
  const checkIn = (id) => act(() => post(`/api/arrivals/${id}/arrive`), 'Checked in. Token issued.');
  const noShow = (id) => act(() => post(`/api/arrivals/${id}/no-show`), 'Marked as no show');
  const visit = (visitId, status, msg) => act(() => patch(`/api/arrivals/visits/${visitId}`, { status }), msg);
  const callNext = () => act(async () => { const r = await post('/api/arrivals/call-next', { locationId: branch || undefined }); if (!r.called) throw new Error('Nobody is waiting to be called.'); }, 'Next patient called');

  const FILTERS = {
    all: () => true, checkedIn: (s) => s.visitId, waiting: (s) => ['checked_in', 'waiting'].includes(s.status), completed: (s) => s.status === 'completed',
    noShows: (s) => s.status === 'no_show', unpaid: (s) => s.payment === 'unpaid' && ['completed', 'in_chair'].includes(s.status), paid: (s) => s.payment === 'paid',
  };
  const rows = schedule.filter(FILTERS[filter] || FILTERS.all);
  const tiles = [
    ['all', "Today's appointments", k.appointments, 'Total scheduled', IconCalendarEvent],
    ['checkedIn', 'Checked in', k.checkedIn, 'Patients arrived', IconUserCheck],
    ['waiting', 'Waiting', k.waiting, queue[0] ? `Longest ${queue.reduce((m, x) => Math.max(m, x.waitingMin || 0), 0)} min` : 'Nobody in the queue', IconHourglassHigh],
    ['completed', 'Completed', k.completed, 'Visits marked complete', IconCircleCheck],
    ['noShows', 'No shows', k.noShows, 'Did not arrive', IconUserX],
    ['paid', "Today's collections", fmtMoney(k.collected), `${payments.count} ${payments.count === 1 ? 'payment' : 'payments'}`, IconCurrencyRupee],
    ['unpaid', 'Outstanding', fmtMoney(k.outstanding), `${payments.unpaidCount} unpaid ${payments.unpaidCount === 1 ? 'visit' : 'visits'}`, IconReceipt2],
    ['patients', 'New patients', k.newPatients, 'Registered today', IconUsers],
  ];
  const rowAction = (s) => {
    if (s.status === 'pending') return <><button className="btn sm" disabled={busy} onClick={() => confirm(s.id)}>Confirm</button><button className="btn sm primary" disabled={busy} onClick={() => checkIn(s.id)}>Check in</button></>;
    if (s.status === 'confirmed') return <button className="btn sm primary" disabled={busy} onClick={() => checkIn(s.id)}>Check in</button>;
    if (s.payment === 'unpaid' && ['completed', 'in_chair', 'waiting', 'checked_in'].includes(s.status) && s.fee > 0) return <button className="btn sm" disabled={busy} onClick={() => setModal({ pay: s })}>Collect {fmtMoney(s.fee)}</button>;
    return null;
  };

  return (
    <>
      <PageHeader title="Front desk" sub={<>{longDate()} · {branchName} · <span className={`fdx-open ${data.open ? 'on' : ''}`}>{data.open ? 'Open now' : `Closed${data.opensLabel ? `, opens ${data.opensLabel}` : ''}`}</span></>}
        actions={<PatientSearch />} />

      <div className="fdx-quick">
        <a className="fdx-qa" href="#/patients?new=1"><IconUserPlus size={18} />New patient</a>
        <a className="fdx-qa" href="#/schedule?new=1"><IconCalendarPlus size={18} />Appointment</a>
        <button className="fdx-qa" onClick={() => setModal('checkin')}><IconDoorEnter size={18} />Check in</button>
        <button className="fdx-qa" onClick={() => setModal('pay')}><IconCash size={18} />Collect payment</button>
      </div>

      <div className="fdx-kpis">
        {tiles.map(([key, label, value, hint, Icon]) => (key === 'patients'
          ? <a key={key} className="fdx-kpi" href="#/patients"><span className="l"><Icon size={15} />{label}</span><b>{value}</b><span className="h">{hint}</span></a>
          : <button key={key} className={`fdx-kpi ${filter === key && key !== 'all' ? 'on' : ''}`} onClick={() => { setFilter(filter === key ? 'all' : key); document.getElementById('fdx-schedule')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }}><span className="l"><Icon size={15} />{label}</span><b>{value}</b><span className="h">{hint}</span></button>))}
      </div>

      <div className="fdx-main">
        <Card title={<span id="fdx-schedule">Today’s schedule <span className="muted">({rows.length}{filter !== 'all' ? ` of ${schedule.length}` : ''})</span></span>}
          actions={<>{filter !== 'all' && <button className="btn sm ghost" onClick={() => setFilter('all')}><IconX size={14} />Clear filter</button>}<a className="btn sm ghost" href="#/schedule">Open calendar</a></>}>
          {rows.length === 0 ? <Body><div className="small muted">{schedule.length ? 'No appointments match this filter.' : 'No appointments today.'}</div></Body> : (
            <div className="fdx-scroll"><table className="table fdx-table">
              <thead><tr><th>Time</th><th>Patient</th><th>Dentist</th><th>Service</th><th>Status</th><th>Payment</th><th /></tr></thead>
              <tbody>{rows.map((s) => (
                <tr key={s.id} className={s.status === 'cancelled' ? 'dim' : ''}>
                  <td className="mono nowrap">{fmtTime(s.start)}{s.lateMin >= 15 && <div className="fdx-late">{s.lateMin} min late</div>}</td>
                  <td><div className="nowrap"><a href={`#/patients/${s.patientId}`} className="strong">{s.patientName}</a>{s.token && <span className="fdx-token">{s.token}</span>}</div><div className="tiny muted">{s.phone}</div></td>
                  <td><div className="nowrap">{s.provider}</div>{showBranch && <div className="tiny muted">{s.branch}</div>}</td>
                  <td>{s.service}<div className="tiny muted">via {s.source}</div></td>
                  <td><Badge map={STATUS} value={s.status} />{s.waitingMin != null && <div className="tiny muted nowrap">waiting {s.waitingMin} min</div>}</td>
                  <td>{s.status === 'cancelled' || s.status === 'no_show' ? <span className="muted tiny">None</span> : <Badge map={PAY} value={s.payment} />}</td>
                  <td className="fdx-acts">{rowAction(s)}</td>
                </tr>))}</tbody>
            </table></div>)}
        </Card>

        <div className="col gap-16">
          <Card title={`Live queue (${queue.length})`} actions={<><a className="btn sm ghost" href="#/dashboard">Full board</a><button className="btn sm primary" disabled={busy || !queue.length} onClick={callNext}><IconBellRinging size={14} />Call next</button></>}>
            {queue.length === 0 ? <Body><div className="small muted">Nobody is waiting. Check a patient in and their token appears here.</div></Body> : (
              <table className="table fdx-queue"><thead><tr><th>Token</th><th>Patient</th><th>Dentist</th><th>Waiting</th><th /></tr></thead>
                <tbody>{queue.map((x) => { const nx = QUEUE_NEXT[x.visitStatus]; return (
                  <tr key={x.visitId} className={x.visitStatus === 'called' ? 'called' : ''}>
                    <td><span className="fdx-token lg">{x.token || 'No token'}</span></td>
                    <td><span className="strong">{x.patientName}</span><div className="tiny muted">{x.visitStatus === 'called' ? 'Called' : x.visitStatus === 'ready' ? 'Ready' : x.visitStatus === 'needs_attention' ? 'Needs attention at desk' : 'Checking in'}</div></td>
                    <td>{x.provider}</td>
                    <td className={`mono ${x.waitingMin >= 20 ? 'fdx-long' : ''}`}>{x.waitingMin} min</td>
                    <td className="fdx-acts"><button className="btn sm ghost" disabled={busy} onClick={() => handoff(x)} title="Leave an administrative note for the dentist">{x.handoff ? 'Edit note' : 'Note for dentist'}</button>{nx && <button className="btn sm" disabled={busy} onClick={() => visit(x.visitId, nx[0], nx[0] === 'called' ? `${x.token || 'Patient'} called` : 'Queue updated')}>{nx[1]}</button>}</td>
                  </tr>); })}</tbody></table>)}
            {schedule.some((s) => s.status === 'in_chair') && <div className="fdx-inchair">{schedule.filter((s) => s.status === 'in_chair').map((s) => <div key={s.id} className="row between small"><span><span className="fdx-token">{s.token}</span> {s.patientName} <span className="muted">· {s.provider}</span></span><button className="btn sm" disabled={busy} onClick={() => visit(s.visitId, 'done', 'Visit marked complete')}>Mark departed</button></div>)}</div>}
          </Card>

          <Card title="Dentists now" actions={<span className="small muted"><IconArmchair size={14} style={{ verticalAlign: -2 }} /> {chairs.inUse} of {chairs.total} chairs in use</span>}><Body className="col gap-10">
            <div className="fdx-chairbar" title={`${chairs.percent}% of chairs in use`}><i style={{ width: `${chairs.percent}%` }} /></div>
            {dentists.map((d) => (
              <div key={d.id} className="fdx-dentist">
                <span className={`dot ${DENTIST_STATE[d.state][1]}`} />
                <div className="grow"><div className="small strong">{d.name}</div><div className="tiny muted">{d.state === 'with_patient' && d.now ? `${d.now.token ? `${d.now.token} · ` : ''}${d.now.patientName}` : d.state === 'away' ? (d.awayReason || 'Blocked time') : d.next ? `Next ${fmtTime(d.next.start)} · ${d.next.patientName}` : 'No more patients today'}</div></div>
                <div className="tiny muted right"><span className={`fdx-badge ${DENTIST_STATE[d.state][1]}`}>{DENTIST_STATE[d.state][0]}</span><div>{d.done}/{d.booked} seen</div></div>
              </div>))}
            {dentists.length === 0 && <div className="small muted">No dentists set up yet. Add them in Settings.</div>}
          </Body></Card>
        </div>
      </div>

      <Card title={`Tasks from dentists (${tasks.open} open)`} className="mb-16">
        {tasks.items.length === 0 ? <Body><div className="small muted">No requests from dentists. When a dentist asks for a booking, a callback or a clarification, it appears here.</div></Body> : (
          <table className="table"><thead><tr><th>Task</th><th>Patient</th><th>From</th><th>Due</th><th>Status</th><th /></tr></thead>
            <tbody>{tasks.items.map((t) => (
              <tr key={t.id} className={t.status === 'done' ? 'dim' : ''}>
                <td><div className="small strong">{t.title}{t.priority === 'high' && <span className="fdx-badge st-cancelled" style={{ marginLeft: 8 }}>High</span>}</div>{t.description && <div className="tiny muted">{t.description}</div>}</td>
                <td>{t.patientId ? <a href={`#/patients/${t.patientId}`}>{t.patientName}</a> : <span className="muted tiny">No patient</span>}{t.patientPhone && <div className="tiny muted">{t.patientPhone}</div>}</td>
                <td className="small">{t.providerName || t.createdBy}</td>
                <td className={`small nowrap ${t.overdue ? 'fdx-long' : ''}`}>{t.due}{t.overdue ? ' · overdue' : ''}</td>
                <td><span className={`fdx-badge ${t.status === 'done' ? 'st-completed' : t.status === 'in_progress' ? 'st-confirmed' : 'st-waiting'}`}>{t.status === 'done' ? 'Done' : t.status === 'in_progress' ? 'In progress' : 'Pending'}</span></td>
                <td className="fdx-acts">{t.status === 'pending' && <button className="btn sm" disabled={busy} onClick={() => task(t.id, 'in_progress', 'Task started')}>Start</button>}{t.status !== 'done' && <button className="btn sm primary" disabled={busy} onClick={() => task(t.id, 'done', 'Task done. The dentist can see it.')}>Done</button>}{t.type === 'book_next' && t.status !== 'done' && t.patientId && <a className="btn sm ghost" href={`#/schedule?patient=${t.patientId}`}>Book</a>}</td>
              </tr>))}</tbody></table>)}
      </Card>

      <div className="fdx-widgets">
        <Card title={`Pending confirmations (${pc.today + pc.tomorrow})`}><Body className="col gap-8">
          {pc.items.length === 0 && <div className="small muted">Every appointment for today and tomorrow is confirmed.</div>}
          {pc.items.map((a) => <div key={a.id} className="row between small"><span><span className="mono">{a.day === 'tomorrow' ? 'Tomorrow ' : ''}{fmtTime(a.start)}</span> {a.patientName}</span><button className="btn sm" disabled={busy} onClick={() => confirm(a.id)}>Confirm</button></div>)}
        </Body></Card>

        <Card title={`Missed appointment alerts (${missed.late.length + missed.noShows.length})`}><Body className="col gap-8">
          {missed.late.length + missed.noShows.length === 0 && <div className="small muted">Nobody is late and there are no no shows today.</div>}
          {missed.late.map((s) => <div key={s.id} className="row between small"><span><b>{s.patientName}</b> <span className="fdx-late inline">{s.lateMin} min late</span><div className="tiny muted">{fmtTime(s.start)} · {s.provider} · {s.phone}</div></span><span className="row gap-6"><button className="btn sm" disabled={busy} onClick={() => checkIn(s.id)}>Arrived</button><button className="btn sm ghost" disabled={busy} onClick={() => { if (window.confirm(`Mark ${s.patientName} as a no show? A rebooking message will be queued.`)) noShow(s.id); }}>No show</button></span></div>)}
          {missed.noShows.map((s) => <div key={s.id} className="row between small"><span>{s.patientName} <span className="muted">· {fmtTime(s.start)}</span></span><a className="btn sm ghost" href="#/callbacks">Rebook</a></div>)}
        </Body></Card>

        <Card title="Payments today" actions={<button className="btn sm ghost" onClick={() => setModal('pay')}>Collect</button>}><Body className="col gap-8">
          <div className="fdx-money"><b>{fmtMoney(payments.collected)}</b><span className="muted small">collected · {fmtMoney(payments.outstanding)} outstanding</span></div>
          {payments.byMode.map((m) => <div key={m.mode} className="row between small"><span className="muted">{m.mode} <span className="tiny">({m.count})</span></span><b className="mono">{fmtMoney(m.amount)}</b></div>)}
          {payments.byMode.length === 0 && <div className="small muted">No payments recorded yet today.</div>}
        </Body></Card>

        <Card title={`Follow ups due (${followUps.recallsDue + followUps.callbacks})`} actions={<a className="btn sm ghost" href="#/callbacks">Callbacks</a>}><Body className="col gap-8">
          {followUps.needsStaff > 0 && <a className="callout small" href="#/inbox">{followUps.needsStaff} patient {followUps.needsStaff === 1 ? 'message needs' : 'messages need'} a person</a>}
          {followUps.items.length === 0 && <div className="small muted">No callbacks or overdue recalls.</div>}
          {followUps.items.map((f) => <a key={`${f.kind}-${f.id}`} href={f.to} className="row between small" style={{ color: 'inherit' }}><span>{f.kind === 'callback' ? <IconPhoneCall size={14} style={{ verticalAlign: -2 }} /> : <IconStethoscope size={14} style={{ verticalAlign: -2 }} />} {f.title}</span><span className="muted tiny">{f.note}</span></a>)}
        </Body></Card>

        <Card title={`Booked today for today (${walkIns.length})`}><Body className="col gap-8">
          {walkIns.length === 0 && <div className="small muted">No walk ins or same day bookings yet.</div>}
          {walkIns.slice(0, 6).map((s) => <div key={s.id} className="row between small"><span><span className="mono">{fmtTime(s.start)}</span> {s.patientName}</span><span className="muted tiny">{s.source}</span></div>)}
        </Body></Card>

        <Card title="Recent activity"><Body className="col gap-8">
          {activity.length === 0 && <div className="small muted">Nothing has happened yet today.</div>}
          {activity.slice(0, 7).map((x) => <div key={x.id} className="fdx-act small"><span>{String(x.text).replace(/\s+[\u2014\u2013-]\s+/g, ', ')}</span><span className="muted tiny nowrap">{ago(x.at)}</span></div>)}
        </Body></Card>
      </div>

      {modal === 'checkin' && <CheckInModal schedule={schedule} busy={busy} onCheckIn={checkIn} onClose={() => setModal(null)} />}
      {(modal === 'pay' || modal?.pay) && <PaymentModal schedule={schedule} unpaid={payments.unpaid} modes={data.paymentModes} preset={modal?.pay || null} busy={busy} onClose={() => setModal(null)}
        onPay={(id, body) => act(() => post(`/api/arrivals/${id}/payment`, body), 'Payment recorded. Receipt number issued.').then(() => setModal(null))} />}
    </>
  );
}

/** Find any patient on file by name, mobile number or email, from anywhere on the dashboard. */
function PatientSearch() {
  const [q, setQ] = useState(''); const [hits, setHits] = useState(null); const box = useRef(null);
  useEffect(() => {
    if (q.trim().length < 2) { setHits(null); return undefined; }
    const t = setTimeout(() => get(`/api/patients?q=${encodeURIComponent(q.trim())}`).then((r) => setHits(r.slice(0, 7))).catch(() => setHits([])), 220);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => { const f = (e) => { if (!box.current?.contains(e.target)) setHits(null); }; document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f); }, []);
  return (
    <div className="fdx-search" ref={box}>
      <IconSearch size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search patients by name, mobile or email" aria-label="Search patients" />
      {hits && <div className="fdx-hits">
        {hits.length === 0 && <div className="small muted pad">No patient matches “{q}”. <a href="#/patients?new=1">Register a new patient</a></div>}
        {hits.map((p) => <a key={p.id} href={`#/patients/${p.id}`} onClick={() => { setHits(null); setQ(''); }}><span><b>{p.firstName} {p.lastName}</b><span className="tiny muted"> · {p.phone}</span></span><IconChevronRight size={15} /></a>)}
      </div>}
    </div>
  );
}

function CheckInModal({ schedule, busy, onCheckIn, onClose }) {
  const [q, setQ] = useState('');
  const due = useMemo(() => schedule.filter((s) => ['pending', 'confirmed'].includes(s.status)).filter((s) => !q.trim() || `${s.patientName} ${s.phone}`.toLowerCase().includes(q.trim().toLowerCase())), [schedule, q]);
  return (
    <Modal title="Check in a patient" onClose={onClose}>
      <div className="col gap-12">
        <input className="input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name or mobile number" />
        {due.length === 0 && <div className="small muted">{q ? 'No one expected today matches that. ' : 'Everyone expected today has already arrived. '}<a href="#/schedule?new=1">Book a walk-in</a></div>}
        {due.map((s) => <div key={s.id} className="row between"><span><b>{s.patientName}</b><div className="tiny muted">{fmtTime(s.start)} · {s.service} · {s.provider}{s.branch ? ` · ${s.branch}` : ''}</div></span><button className="btn primary sm" disabled={busy} onClick={() => onCheckIn(s.id)}>Check in</button></div>)}
      </div>
    </Modal>
  );
}

function PaymentModal({ schedule, unpaid, modes, preset, busy, onPay, onClose }) {
  const today = schedule.filter((s) => s.payment === 'unpaid' && s.fee > 0 && !['cancelled', 'no_show'].includes(s.status)).map((s) => ({ id: s.id, patientName: s.patientName, service: s.service, amount: s.fee, when: fmtTime(s.start) }));
  const earlier = unpaid.filter((u) => !today.some((t) => t.id === u.id)).map((u) => ({ id: u.id, patientName: u.patientName, service: u.service, amount: u.amount, when: new Date(u.start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) }));
  const options = [...today, ...earlier];
  const [id, setId] = useState(preset?.id || options[0]?.id || '');
  const pick = options.find((o) => o.id === id);
  const [amount, setAmount] = useState(preset?.fee ?? options[0]?.amount ?? '');
  const [mode, setMode] = useState(modes[0] || 'UPI'); const [reference, setReference] = useState('');
  useEffect(() => { if (pick) setAmount(pick.amount); }, [id]); // eslint-disable-line
  const valid = id && Number(amount) > 0 && mode;
  return (
    <Modal title="Collect payment" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !valid} onClick={() => onPay(id, { amount: Number(amount), mode, reference })}>Record {Number(amount) > 0 ? fmtMoney(Number(amount)) : 'payment'}</button></>}>
      {options.length === 0 ? <div className="small muted">Nothing to collect. Every visit on file is paid.</div> : (
        <div className="col gap-12">
          <label className="field"><span className="field-label">Visit</span><select className="input" value={id} onChange={(e) => setId(e.target.value)}>
            {today.length > 0 && <optgroup label="Today">{today.map((o) => <option key={o.id} value={o.id}>{o.when} · {o.patientName} · {o.service} · {fmtMoney(o.amount)}</option>)}</optgroup>}
            {earlier.length > 0 && <optgroup label="Earlier visits still unpaid">{earlier.map((o) => <option key={o.id} value={o.id}>{o.when} · {o.patientName} · {o.service} · {fmtMoney(o.amount)}</option>)}</optgroup>}
          </select></label>
          <div className="grid two">
            <label className="field"><span className="field-label">Amount (₹)</span><input className="input" type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
            <label className="field"><span className="field-label">Reference <span className="muted">(UPI / card ref, optional)</span></span><input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. UPI 4312…" /></label>
          </div>
          <div><span className="field-label">Method</span><div className="fdx-modes">{modes.map((m) => <button key={m} type="button" className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{m}</button>)}</div></div>
          <div className="tiny muted">A numbered receipt is created when you record this. You can print or WhatsApp it from Arrivals &amp; queue.</div>
        </div>)}
    </Modal>
  );
}
