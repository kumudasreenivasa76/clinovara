import React, { useEffect, useState } from 'react';
import { IconPlayerPlay, IconArmchair, IconCheck, IconMessageQuestion, IconAlertTriangle, IconClockPause, IconRepeat, IconDental, IconCalendarEvent, IconUsers, IconChartBar, IconHelpCircle, IconSearch, IconPlus, IconTrash, IconSend, IconArrowRight, IconArrowLeft, IconStethoscope, IconPhone, IconFileExport, IconFolderCheck } from '@tabler/icons-react';
import { get, post, patch, downloadFile } from '../lib/api.js';
import { fmtTime, fmtDate, fmtWhen, fullName, fmtMoney, minutesSince, ago, fmtPhone } from '../lib/format.js';
import { Card, Body, Pill, Avatar, Empty, usePoll, useAction, Stat, Seg, Modal, Field, useToast } from '../components/ui.jsx';

const TABS = [
  { id: 'today', label: 'Today', icon: IconStethoscope },
  { id: 'patients', label: 'My patients', icon: IconUsers },
  { id: 'week', label: 'My week', icon: IconCalendarEvent },
  { id: 'plans', label: 'Treatment plans', icon: IconDental },
  { id: 'numbers', label: 'My numbers', icon: IconChartBar },
  { id: 'help', label: 'How this works', icon: IconHelpCircle },
];
const STAGE_WORDS = { expected: 'Not arrived yet', arrived: 'Arrived, checking in', checking_in: 'Checking in at kiosk', needs_attention: 'Front desk is finishing their forms', ready: 'Waiting for you', called: 'Called — walking in', brought_back: 'In your chair', done: 'Finished', no_show: 'Did not come' };

/** The dentist's home: one place for today, patients, week, plans, numbers, written in plain words. */
export default function DoctorDashboard({ me }) {
  const [providerId, setProviderId] = useState(me.providerId || (() => { try { return localStorage.getItem('clinovara.provider') || ''; } catch { return ''; } })());
  const [tab, setTab] = useState(() => { const q = new URLSearchParams((window.location.hash.split('?')[1] || '')).get('tab'); return TABS.some((x) => x.id === q) ? q : 'today'; });
  const [days, setDays] = useState(30);
  const { data, reload } = usePoll(() => get(`/api/doctor/dashboard?days=${days}${providerId ? `&providerId=${providerId}` : ''}`), [providerId, days], 6000);
  const [run] = useAction();
  const toast = useToast();
  const qs = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const [chart, setChart] = useState(qs.get('chart') || null);
  const [finishing, setFinishing] = useState(null);
  useEffect(() => { const v = qs.get('finish'); if (v && data?.today) { const row = data.today.board.find((r) => r.visit?.id === v); if (row && !finishing) setFinishing(row); } }, [data?.today?.board?.length]); // eslint-disable-line
  const feeds = usePoll(() => get('/api/calendar/feeds'), [], 0);
  const act = (fn, msg) => run(async () => { await fn(); reload(); }, msg);
  if (!data) return <div className="skeleton" />;
  if (!data.provider) return (
    <>
      <div className="page-head"><div><h1>Welcome, doctor</h1><p>Your login is not linked to a dentist yet. Pick yourself below, or ask the clinic owner to link your account under Settings → Team.</p></div></div>
      <Card><Body><select className="input" style={{ maxWidth: 360 }} value="" onChange={(e) => { setProviderId(e.target.value); try { localStorage.setItem('clinovara.provider', e.target.value); } catch { /* ignore */ } }}><option value="">Choose your name…</option>{data.providers.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.specialty || p.role}</option>)}</select></Body></Card>
    </>
  );
  const p = data.provider; const t = data.today; const now = Date.now();
  const inChair = t.board.find((r) => r.visit && r.stage === 'brought_back');
  const called = t.board.find((r) => r.visit && r.stage === 'called');
  const next = t.board.filter((r) => r.visit && ['ready', 'arrived', 'checking_in', 'needs_attention'].includes(r.stage)).sort((a, b) => (a.stage === 'ready' ? 0 : 1) - (b.stage === 'ready' ? 0 : 1) || a.visit.arrivedAt.localeCompare(b.visit.arrivedAt))[0];
  const focus = inChair || called || next || null;
  const myFeed = feeds.data?.feeds?.find((f) => f.providerId === p.id);
  const needs = data.plans.questions.length + data.escalations.length;

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">{p.specialty || p.role}{p.qualifications ? ` · ${p.qualifications}` : ''}</div><div className="doc-name">Good {greeting()}, {p.name.replace(/^Dr\.\s*/, 'Dr. ')}</div><p>{t.total === 0 ? 'No patients on your list today.' : `${t.total} patient${t.total === 1 ? '' : 's'} today · ${t.done} finished · ${t.waiting} waiting${needs ? ` · ${needs} thing${needs === 1 ? ' needs' : 's need'} your reply` : ''}`}</p></div>
        <div className="row">{!me.providerId && <select className="input" style={{ width: 200 }} value={providerId} onChange={(e) => { setProviderId(e.target.value); try { localStorage.setItem('clinovara.provider', e.target.value); } catch { /* ignore */ } }}>{data.providers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}</div>
      </div>
      <Seg value={tab} onChange={setTab} options={TABS.map((x) => ({ value: x.id, label: <span className="row gap-4"><x.icon size={14} />{x.label}{x.id === 'today' && t.waiting ? <span className="badge">{t.waiting}</span> : null}{x.id === 'plans' && needs ? <span className="badge">{needs}</span> : null}</span> }))} />
      <div className="mt-16" />

      {tab === 'today' && (<>
        {focus ? (
          <div className="doc-hero card">
            <div className="grow">
              <div className="eyebrow">{inChair ? 'In your chair now' : called ? 'Called, walking in' : 'Next patient'}</div>
              <div className="row gap-6 wrap" style={{ marginTop: 4 }}><span className="token-chip" style={{ fontSize: 16, padding: '4px 10px' }}>{focus.visit.token}</span><span className="doc-name" style={{ fontSize: 26 }}>{fullName(focus.patient)}</span><span className="muted">{focus.patient?.dob ? `${ageOf(focus.patient.dob)} yrs` : ''}{focus.patient?.gender ? ` · ${focus.patient.gender}` : ''}</span></div>
              <div className="small muted" style={{ marginTop: 2 }}>{focus.visitType?.name} · booked {fmtTime(focus.appointment.start)} · {focus.location?.name}{focus.appointment.notes ? ` · ${focus.appointment.notes}` : ''}{focus.stage !== 'brought_back' ? ` · waiting ${minutesSince(focus.visit.arrivedAt, now)} min` : ''}</div>
              {focus.chiefComplaint && <div className="small" style={{ marginTop: 8 }}><b>Patient says:</b> “{focus.chiefComplaint}”</div>}
              <div className="tag-list" style={{ marginTop: 8 }}>{focus.alerts.map((a, i) => <span key={i} className={`pill ${a.level === 'high' ? 'bad' : a.level === 'medium' ? 'warn' : 'outline'}`}>{a.level === 'high' && <IconAlertTriangle size={11} />}{a.text}</span>)}{focus.alerts.length === 0 && <span className="pill good">No medical alerts on the form</span>}{focus.missing?.length > 0 && <span className="pill warn">Form missing: {focus.missing.join(', ').toLowerCase()}</span>}</div>
            </div>
            <div className="col gap-6" style={{ minWidth: 220 }}>
              {['ready', 'arrived', 'checking_in', 'needs_attention'].includes(focus.stage) && <button className="btn primary lg" onClick={() => act(() => patch(`/api/arrivals/visits/${focus.visit.id}`, { status: 'called' }), `Called ${focus.visit.token} — it shows on the waiting-room display`)}><IconPlayerPlay size={18} />Call {focus.patient.firstName} in</button>}
              {focus.stage === 'called' && <button className="btn primary lg" onClick={() => act(() => patch(`/api/arrivals/visits/${focus.visit.id}`, { status: 'brought_back' }), 'Marked in chair')}><IconArmchair size={18} />Seated in chair</button>}
              {focus.stage === 'brought_back' && <button className="btn primary lg" onClick={() => setFinishing(focus)}><IconCheck size={18} />Finish visit</button>}
              <button className="btn" onClick={() => setChart(focus.patient.id)}>Open chart</button>
              {focus.stage !== 'brought_back' && next && focus !== next && <div className="tiny muted">Next after this: {fullName(next.patient)}</div>}
            </div>
          </div>
        ) : <Card className="mb-16"><Body className="row between wrap"><div><b>Nobody is waiting for you right now.</b><div className="small muted">When a patient checks in at the kiosk or the front desk, they appear here with their form and alerts.</div></div><a className="btn ghost" href="#/schedule">See my schedule</a></Body></Card>}

        <div className="grid side mt-16">
          <Card title="Your list for today">
            <div className="list">
              {t.board.map((r) => (
                <div className={`list-item ${r === focus ? 'active' : ''}`} key={r.appointment.id} style={{ cursor: 'pointer' }} onClick={() => setChart(r.patient.id)}>
                  <div className="mono strong" style={{ width: 52 }}>{r.visit?.token || fmtTime(r.appointment.start)}</div>
                  <Avatar patient={r.patient} />
                  <div className="grow"><div className="row gap-6"><span className="strong">{fullName(r.patient)}</span>{r.alerts.some((a) => a.level === 'high') && <Pill tone="bad"><IconAlertTriangle size={11} />alert</Pill>}</div><div className="tiny muted">{r.visitType?.name} · {fmtTime(r.appointment.start)} · {STAGE_WORDS[r.stage] || r.stage}{r.notes?.procedureDone ? ` · done: ${r.notes.procedureDone}` : ''}</div></div>
                  <div className="row gap-6" onClick={(e) => e.stopPropagation()}>
                    {r.visit && ['ready', 'arrived', 'checking_in', 'needs_attention'].includes(r.stage) && <button className="btn sm" onClick={() => act(() => patch(`/api/arrivals/visits/${r.visit.id}`, { status: 'called' }), `Called ${r.visit.token}`)}>Call in</button>}
                    {r.stage === 'called' && <button className="btn sm primary" onClick={() => act(() => patch(`/api/arrivals/visits/${r.visit.id}`, { status: 'brought_back' }), 'In chair')}>Seated</button>}
                    {r.stage === 'brought_back' && <button className="btn sm primary" onClick={() => setFinishing(r)}>Finish visit</button>}
                    {r.stage === 'done' && <Pill tone="good"><IconCheck size={11} />Done</Pill>}
                  </div>
                </div>
              ))}
              {t.board.length === 0 && <Empty>No patients today.</Empty>}
            </div>
          </Card>
          <div className="col gap-16">
            <Card title="Needs your reply">
              <div className="list">
                {data.plans.questions.map((q) => <a className="list-item clickable" key={q.id} href="#/treatment"><IconMessageQuestion size={16} className="muted" /><div className="grow"><div className="small strong">{fullName(q.patient)} asked</div><div className="tiny muted">“{q.question}” · {ago(q.at)}</div></div></a>)}
                {data.escalations.map((e) => <a className="list-item clickable" key={e.id} href="#/inbox"><IconAlertTriangle size={16} style={{ color: 'var(--bad)' }} /><div className="grow"><div className="small strong">{e.contactName} on WhatsApp</div><div className="tiny muted">{e.lastMessage ? `“${e.lastMessage.slice(0, 80)}”` : e.reason} · {ago(e.at)}</div></div></a>)}
                {needs === 0 && <div className="empty small">Nothing waiting on you. The AI and front desk handle the rest.</div>}
              </div>
            </Card>
            <Card title="Coming up next"><div className="list">{data.upcoming.slice(0, 5).map((a) => <div className="list-item" key={a.id}><div className="mono small" style={{ width: 118 }}>{fmtWhen(a.start)}</div><div className="grow small"><b>{fullName(a.patient)}</b><div className="tiny muted">{a.visitType?.name}{a.notes ? ` · ${a.notes}` : ''}</div></div><AddToCalendar appointmentId={a.id} /></div>)}{data.upcoming.length === 0 && <div className="empty small">Nothing booked ahead.</div>}</div></Card>
          </div>
        </div>
      </>)}

      {tab === 'patients' && <MyPatients providerId={p.id} onOpen={setChart} />}

      {tab === 'week' && (<>
        <div className="row between mb-16 wrap"><div className="small muted">Your next seven days. Chair time counts booked minutes. Ask for leave or block time here; the front desk sees it on the schedule and the waitlist gets any freed slots.</div><LeaveButton providerId={p.id} onDone={reload} /></div>
        <div className="week">{data.week.map((d) => <div key={d.day} className={d.day === new Date().toISOString().slice(0, 10) ? 'today' : ''}>
          <div className="d">{fmtDate(d.day).split(',')[0]}<b>{d.day.slice(8)}</b></div>
          <div className="n">{d.count}<span className="tiny muted"> visit{d.count === 1 ? '' : 's'}</span></div>
          <div className="meta">{d.minutes ? <><span className="t">{Math.round(d.minutes / 60 * 10) / 10} h</span> chair time</> : d.blocks.length ? null : 'Free'}{d.first && <><br /><span className="t">from {fmtTime(d.first)}</span></>}</div>
          {d.blocks.map((b, i) => <div className="blk" key={i}>{b}</div>)}
        </div>)}</div>
        <Card className="mt-16" title={<span className="row gap-6"><IconCalendarEvent size={16} />Sync to your phone or computer calendar</span>}>
          <Body className="col gap-6">
            {myFeed?.url ? (<>
              <div className="small muted">One link, always up to date: it adds every visit on your schedule and any leave you block, and updates itself, no re-adding.</div>
              <div className="row wrap gap-6"><button className="btn" onClick={() => { navigator.clipboard?.writeText(myFeed.url); toast('Copied. In Google Calendar: Other calendars → + → From URL. In Outlook: Add calendar → Subscribe from web. On iPhone: Settings → Calendar → Accounts → Add subscribed calendar.'); }}><IconCalendarEvent size={16} />Copy my calendar link</button><a className="btn ghost" href={myFeed.webcal}><IconCalendarEvent size={16} />Open in my calendar app</a></div>
            </>) : (
              <div className="callout small">Whole-schedule syncing isn't turned on for this clinic yet — ask the clinic owner to enable it under Settings → Integrations → Calendar feeds. Meanwhile, tap the calendar icon next to any visit below to add just that one to your phone or computer.</div>
            )}
          </Body>
        </Card>
        <div className="grid two mt-16">
          <Card title="Booked ahead"><div className="list">{data.upcoming.map((a) => <div className="list-item" key={a.id}><div className="mono small" style={{ width: 118 }}>{fmtWhen(a.start)}</div><div className="grow"><div className="small strong">{fullName(a.patient)}</div><div className="tiny muted">{a.visitType?.name} · {a.location?.name}{a.notes ? ` · ${a.notes}` : ''}</div></div><Pill status={a.packet || 'created'}>{a.packet === 'complete' ? 'Form done' : a.packet === 'partial' ? 'Form partly done' : 'Form not filled'}</Pill><AddToCalendar appointmentId={a.id} /></div>)}{data.upcoming.length === 0 && <Empty>Nothing booked ahead.</Empty>}</div></Card>
          <Card title="Leave and blocked time"><div className="list">{data.blocks.map((b) => <div className="list-item" key={b.id}><IconClockPause size={16} className="muted" /><div className="grow small">{b.reason || 'Blocked'}<div className="tiny muted">{fmtWhen(b.start)} – {fmtTime(b.end)}</div></div></div>)}{data.blocks.length === 0 && <div className="empty small">No leave or blocks coming up.</div>}</div></Card>
        </div>
      </>)}

      {tab === 'plans' && (<>
        <div className="small muted mb-16">Treatment you recommended. Patients who left without booking are the ones to follow up; the front desk can send the approved nudge, or you can answer a question.</div>
        <div className="grid two">
          <Card title={`Not booked yet (${data.plans.open.length})`}><div className="list">{data.plans.open.map((tp) => <div className="list-item clickable" key={tp.id} onClick={() => setChart(tp.patientId)}><Avatar patient={tp.patient} /><div className="grow"><div className="small strong">{fullName(tp.patient)}</div><div className="tiny muted">{tp.openItems.map((i) => i.procedure).join(', ')} · recommended {fmtDate(tp.createdAt)}</div></div><span className="small">{fmtMoney(tp.value)}</span></div>)}{data.plans.open.length === 0 && <div className="empty small">Every plan has a next visit booked.</div>}</div></Card>
          <Card title={`Questions from patients (${data.plans.questions.length})`}><div className="list">{data.plans.questions.map((q) => <a className="list-item clickable" key={q.id} href="#/treatment"><div className="grow"><div className="small strong">{fullName(q.patient)}</div><div className="tiny muted">“{q.question}” · {ago(q.at)}</div></div><span className="btn sm">Answer</span></a>)}{data.plans.questions.length === 0 && <div className="empty small">No open questions.</div>}</div></Card>
        </div>
        {data.recallsDue.length > 0 && <Card className="mt-16" title={<span className="row gap-6"><IconRepeat size={16} />Your patients overdue for their 6-month check</span>}><Body className="tag-list">{data.recallsDue.map((r) => <button key={r.id} className="pill outline" onClick={() => setChart(r.id)}>{r.name} · due {fmtDate(r.dueOn)}</button>)}</Body></Card>}
      </>)}

      {tab === 'numbers' && <Numbers data={data} days={days} setDays={setDays} />}

      {tab === 'help' && <HelpGuide />}

      {chart && <ChartDrawer patientId={chart} onClose={() => setChart(null)} onFinish={(row) => { setChart(null); setFinishing(row); }} board={t.board} />}
      {finishing && <FinishVisit row={finishing} data={data} onClose={() => setFinishing(null)} onDone={() => { setFinishing(null); reload(); }} />}
    </>
  );
}

function greeting() { const h = new Date().getHours(); return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'; }
function ageOf(dob) { return Math.floor((Date.now() - new Date(dob)) / (365.25 * 86400000)); }

function MyPatients({ providerId, onOpen }) {
  const [q, setQ] = useState('');
  const { data } = usePoll(() => get(`/api/doctor/patients?providerId=${providerId}&q=${encodeURIComponent(q)}`), [providerId, q], 0);
  return (
    <Card>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }} className="row"><IconSearch size={16} className="faint" /><input className="input" style={{ padding: '6px 10px' }} placeholder="Search your patients by name or mobile" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <table className="table">
        <thead><tr><th>Patient</th><th>Last seen</th><th>Next visit</th><th>Treatment not yet done</th><th>Alerts</th><th /></tr></thead>
        <tbody>{(data || []).map((p) => <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => onOpen(p.id)}><td><div className="small strong">{p.name}</div><div className="tiny muted">{p.dob ? `${ageOf(p.dob)} yrs · ` : ''}{fmtPhone(p.phone)} · {p.visits} visit{p.visits === 1 ? '' : 's'} with you</div></td><td className="small">{p.lastVisit ? `${fmtDate(p.lastVisit)} · ${p.lastVisitType}` : '—'}</td><td className="small">{p.nextVisit ? fmtWhen(p.nextVisit) : <span className="muted">not booked</span>}</td><td className="small">{p.openPlan || <span className="faint">—</span>}</td><td>{p.alerts ? <Pill tone="bad"><IconAlertTriangle size={11} />{p.alerts}</Pill> : <span className="faint">—</span>}</td><td className="right"><span className="btn sm ghost">Chart</span></td></tr>)}{data && data.length === 0 && <tr><td colSpan={6}><Empty>No patients yet.</Empty></td></tr>}</tbody>
      </table>
    </Card>
  );
}

function Numbers({ data, days, setDays }) {
  const s = data.stats;
  const rows = [['Visits you completed', s.completed, 'Finished visits in this period.'], ['Patients who did not come', `${s.noShows} (${s.noShowRate}%)`, 'They were messaged to rebook and are on the front desk callback list.'], ['Cancelled', s.cancelled, 'Cancelled slots were offered to the waitlist.'], ['Collected for your visits', fmtMoney(s.collected), 'Recorded at the front desk: UPI, cash, card or cashless.'], ['Patients seen', `${s.patients} · ${s.newPatients} new`, 'Everyone with a visit on your list.'], ['Average visit length', `${s.avgMinutes} min`, 'Booked length. Settings suggests better lengths from real chair time.']];
  return (
    <>
      <div className="row between mb-16"><div className="small muted">How your practice is going. Nothing here is shared with patients.</div><Seg value={days} onChange={setDays} options={[{ value: 7, label: 'Last 7 days' }, { value: 30, label: 'Last 30 days' }, { value: 90, label: 'Last 90 days' }]} /></div>
      <div className="grid three">{rows.map(([l, v, h]) => <Card key={l}><Body><div className="tiny muted">{l}</div><div className="mono" style={{ fontSize: 24, margin: '4px 0' }}>{v}</div><div className="tiny faint">{h}</div></Body></Card>)}</div>
      <Card className="mt-16" title="What you did, by visit type"><Body className="row wrap gap-6">{Object.entries(s.procedures).map(([k, v]) => <Pill key={k} tone="outline">{k} · {v}</Pill>)}{Object.keys(s.procedures).length === 0 && <span className="tiny faint">No completed visits in this period.</span>}</Body></Card>
    </>
  );
}

function LeaveButton({ providerId, onDone }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ day: new Date().toISOString().slice(0, 10), from: '13:00', to: '14:00', allDay: false, reason: '' });
  const [run, busy] = useAction();
  const mk = (t) => { const d = new Date(f.day + 'T00:00:00'); const [h, m] = t.split(':').map(Number); d.setHours(h, m, 0, 0); return d.toISOString(); };
  return (<>
    <button className="btn" onClick={() => setOpen(true)}><IconClockPause size={16} />Leave / block time</button>
    {open && <Modal title="Leave or blocked time" onClose={() => setOpen(false)} footer={<><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn primary" disabled={busy} onClick={() => run(async () => { const r = await post('/api/blocks', { providerId, start: f.allDay ? mk('00:00') : mk(f.from), end: f.allDay ? mk('23:59') : mk(f.to), reason: f.reason }); setOpen(false); onDone(); return r; }, 'Saved. The front desk will move any clashing appointments.')}>Save</button></>}>
      <div className="small muted">Patients cannot be booked into this time. If appointments already sit inside it, the front desk is told to move them.</div>
      <div className="grid two"><Field label="Date"><input className="input" type="date" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} /></Field><Field label="Reason"><input className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Leave, conference, lab work, lunch…" /></Field></div>
      <label className="check small"><input type="checkbox" checked={f.allDay} onChange={(e) => setF({ ...f, allDay: e.target.checked })} />Whole day</label>
      {!f.allDay && <div className="row"><input className="input" type="time" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /><span className="muted">to</span><input className="input" type="time" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></div>}
    </Modal>}
  </>);
}

function HelpGuide() {
  const steps = [
    ['Patients check in at the kiosk or the front desk', 'They get a token (A01, A02…). The waiting-room TV shows tokens, never full names. Their pre-visit form comes to you as alerts.'],
    ['Tap "Call in" when you are ready', 'The token appears as "Now calling" on the display. Tap "Seated" once they are in your chair.'],
    ['Open the chart if you need history', 'Medical history, medicines, allergies, previous visits, what was planned and what was paid, all in one place.'],
    ['Tap "Finish visit" at the end', 'One screen: what you did, any treatment you recommend, when to see them next, and the aftercare message. It books the next visit, records the plan, sends the instructions on WhatsApp, and tells the front desk to collect payment.'],
    ['The AI and the front desk handle the rest', 'Reminders, recalls, rebooking after a missed visit, and marketing (which an owner approves). Clinical questions from patients come to you under "Needs your reply".'],
    ['Your week and your numbers are yours', 'Block leave or lunch here; subscribe your phone calendar; see visits, no-shows and collections for any period.'],
  ];
  return (
    <div className="grid two">
      <Card title="A visit, step by step"><div className="list">{steps.map(([h, t], i) => <div className="list-item start" key={h}><span className="badge" style={{ marginTop: 2 }}>{i + 1}</span><div><div className="small strong">{h}</div><div className="small muted">{t}</div></div></div>)}</div></Card>
      <div className="col gap-16">
        <Card title="Words you will see"><div className="list">{Object.entries(STAGE_WORDS).map(([k, v]) => <div className="list-item" key={k} style={{ padding: '6px 18px' }}><Pill status={k} /><span className="small muted">{v}</span></div>)}</div></Card>
        <Card title="Who to ask"><Body className="small col gap-6"><div><b>Front desk</b> books, collects payment, finishes incomplete forms, and works the callback list.</div><div><b>Owner / admin</b> changes visit types, fees, hours, approves marketing, and links logins to dentists.</div><div><b>You</b> call patients in, finish visits, answer clinical questions, and manage your leave.</div></Body></Card>
      </div>
    </div>
  );
}

function ChartDrawer({ patientId, onClose, onFinish, board }) {
  const [c, setC] = useState(null);
  const [tab, setTab] = useState('overview');
  const [run, busy] = useAction();
  const load = () => get(`/api/doctor/chart/${patientId}`).then(setC).catch(() => {});
  useEffect(() => { load(); }, [patientId]); // eslint-disable-line
  if (!c) return null;
  const p = c.patient; const row = board.find((r) => r.patient?.id === patientId);
  const f = c.forms;
  const EHR_LABEL = { sent: 'Sent', queued: 'Queued (no EHR connected)', sending: 'Sending…', failed: 'Failed' };
  return (
    <Modal title={`${fullName(p)} · chart`} onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>Close</button>{row?.stage === 'brought_back' && <button className="btn primary" onClick={() => onFinish(row)}><IconCheck size={16} />Finish visit</button>}</>}>
      <div className="row wrap gap-6"><Pill tone="outline">{p.dob ? `${ageOf(p.dob)} yrs` : 'age unknown'}{p.gender ? ` · ${p.gender}` : ''}</Pill><Pill tone="outline"><IconPhone size={11} />{fmtPhone(p.phone)}</Pill>{p.abhaNumber && <Pill tone="accent">ABHA</Pill>}{p.insurance?.carrier && <Pill tone="info">{p.insurance.carrier}</Pill>}{c.alerts.map((a, i) => <Pill key={i} tone={a.level === 'high' ? 'bad' : a.level === 'medium' ? 'warn' : 'outline'}>{a.level === 'high' && <IconAlertTriangle size={11} />}{a.text}</Pill>)}</div>
      <Seg value={tab} onChange={setTab} options={[{ value: 'overview', label: 'Health & concerns' }, { value: 'visits', label: `Past visits (${c.visits.length})` }, { value: 'plans', label: `Treatment (${c.plans.length})` }, { value: 'messages', label: 'Messages' }, { value: 'ehr', label: `EHR (${c.ehrOutbox?.length || 0})` }]} />
      {tab === 'overview' && (f ? <div className="grid two">
        <Card soft><Body className="col gap-6 small"><div className="eyebrow">What the patient wrote</div><div><b>Concern:</b> {f.dentalConcerns.concerns || '—'}</div><div><b>Last cleaning:</b> {f.dentalConcerns.lastCleaning || '—'}</div><div><b>Anxious:</b> {f.dentalConcerns.anxiety || '—'} · <b>Gums bleed:</b> {f.dentalConcerns.bleedingGums || '—'}</div><div className="tiny faint">Form updated {ago(f.updatedAt)}</div></Body></Card>
        <Card soft><Body className="col gap-6 small"><div className="eyebrow">Medical</div><div><b>Conditions:</b> {(f.medicalHistory.conditions || []).join(', ') || 'None reported'}</div><div><b>Surgeries:</b> {f.medicalHistory.surgeries || '—'}</div><div><b>Medicines:</b> {f.medications.list || '—'}{f.medications.bloodThinners === 'yes' ? ' · on blood thinners' : ''}</div><div><b>Allergies:</b> {f.allergies.list || '—'}{f.allergies.latex === 'yes' ? ' · latex' : ''}</div><div><b>Tobacco:</b> {f.medicalHistory.smoker || '—'} · <b>Pregnant/nursing:</b> {f.medicalHistory.pregnant || '—'}</div>{f.medicalHistory.notes && <div><b>Notes:</b> {f.medicalHistory.notes}</div>}</Body></Card>
      </div> : <div className="callout small">This patient has not filled the pre-visit form. Ask the front desk to help them at the kiosk.</div>)}
      {tab === 'visits' && <div className="list card soft">{c.visits.map((v) => <div className="list-item start" key={v.id}><div className="mono small" style={{ width: 110 }}>{fmtDate(v.arrivedAt)}</div><div className="grow small"><b>{v.visitType}</b> · {v.provider}{v.doctorNotes ? <div className="muted" style={{ marginTop: 4 }}>{v.doctorNotes.procedureDone && <div><b>Done:</b> {v.doctorNotes.procedureDone}</div>}{v.doctorNotes.findings && <div><b>Findings:</b> {v.doctorNotes.findings}</div>}{v.doctorNotes.advice && <div><b>Advice:</b> {v.doctorNotes.advice}</div>}{v.doctorNotes.medicines && <div><b>Medicines:</b> {v.doctorNotes.medicines}</div>}{v.doctorNotes.closing && <div style={{ color: 'var(--good)' }}><b>Case closed:</b> {v.doctorNotes.closing.outcome}{v.doctorNotes.closing.notes ? ` — ${v.doctorNotes.closing.notes}` : ''}</div>}</div> : <div className="tiny faint">No notes recorded</div>}</div><Pill status={v.status} /></div>)}{c.visits.length === 0 && <Empty>No visits yet.</Empty>}</div>}
      {tab === 'plans' && <div className="col">{c.plans.map((tp) => <Card soft key={tp.id}><Body className="col gap-4 small"><div className="row between"><b>By {tp.provider} · {fmtDate(tp.createdAt)}</b><div className="row gap-6">{tp.status === 'closed' ? <Pill tone="good">Closed{tp.closingOutcome ? ` · ${tp.closingOutcome}` : ''}</Pill> : tp.nextVisitScheduled ? <Pill tone="good">Next visit booked</Pill> : <Pill tone="warn">Not booked</Pill>}</div></div>{tp.items.map((i) => <div key={i.id} className="row gap-6"><Pill status={i.status} />{i.procedure}{i.tooth ? ` (#${i.tooth})` : ''}{i.estCost ? <span className="muted">{fmtMoney(i.estCost)}</span> : null}</div>)}{tp.nextSteps && <div className="muted">Next: {tp.nextSteps}</div>}{tp.patientQuestions.map((q) => <div key={q.id} className="tiny" style={{ color: q.answer ? 'var(--muted)' : 'var(--warn)' }}>Q: {q.question}{q.answer ? ` — A: ${q.answer}` : ' (unanswered)'}</div>)}</Body></Card>)}{c.plans.length === 0 && <Empty>No treatment plans.</Empty>}</div>}
      {tab === 'messages' && <div className="list card soft">{c.communications.map((m) => <div className="list-item start" key={m.id}><div className="grow small"><div className="row gap-6"><Pill tone="outline">{m.type.replace('_', ' ')}</Pill><span className="tiny faint">{ago(m.sentAt)}</span></div><div className="muted" style={{ marginTop: 4 }}>{m.body}</div></div></div>)}{c.communications.length === 0 && <Empty>No messages yet.</Empty>}</div>}
      {tab === 'ehr' && <div className="col">
        <div className="row between"><div className="small muted">Records this doctor's visits and closed cases have sent to the clinic's EHR (FHIR). Queued ones deliver once an EHR is connected under Settings → Integrations.</div><button className="btn sm" disabled={busy} onClick={() => run(async () => { await post(`/api/doctor/patients/${patientId}/send-to-ehr`, {}); load(); }, 'Sent to EHR')}><IconFileExport size={14} />Send latest now</button></div>
        <div className="list card soft mt-8">{(c.ehrOutbox || []).map((e) => <div className="list-item" key={e.id}><div className="grow small"><div>{e.reason || 'Export'} · {e.resources?.join(', ')}</div><div className="tiny faint">{ago(e.at)}{e.target ? '' : ' · no EHR connected yet'}</div></div><Pill tone={e.status === 'sent' ? 'good' : e.status === 'failed' ? 'bad' : 'outline'}>{EHR_LABEL[e.status] || e.status}</Pill></div>)}{(!c.ehrOutbox || c.ehrOutbox.length === 0) && <Empty>Nothing sent yet.</Empty>}</div>
      </div>}
    </Modal>
  );
}

/** Finish visit: four short steps in plain words. Every part is optional except "Done". */
function FinishVisit({ row, data, onClose, onDone }) {
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ chiefComplaint: row.chiefComplaint || '', findings: '', procedureDone: row.appointment.notes || '', advice: '', medicines: '', plan: [], nextSteps: '', nextVisit: { mode: 'none', visitTypeId: 'vt_followup', inDays: 14, notes: '' }, aftercare: { id: '', body: '' }, closeTheCase: false, closeCase: { outcome: 'resolved', notes: '' }, sendToEhr: true });
  const [ac, setAc] = useState(null);
  const [run, busy] = useAction();
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const procedures = data.procedures || [];
  const feePolicy = data.feePolicy || { mode: 'fixed', allowCustom: true, noteOnChange: true };
  useEffect(() => { get(`/api/doctor/aftercare?q=${encodeURIComponent(f.procedureDone)}&patientId=${row.patient.id}&providerId=${row.appointment.providerId}`).then((r) => { setAc(r); setF((x) => x.aftercare.body ? x : { ...x, aftercare: { id: r.suggested, body: r.options.find((o) => o.id === r.suggested)?.body || '' } }); }).catch(() => {}); }, [f.procedureDone]); // eslint-disable-line
  const set = (k, v) => setF({ ...f, [k]: v });
  const steps = ['What you did', 'Treatment to recommend', 'Next visit', 'Aftercare message', 'Close the case'];
  const submit = () => run(async () => {
    setError('');
    const plan = f.plan.filter((x) => x.procedure || x.procedureId).map((x) => ({ ...x, estCost: x.estCost === '' ? undefined : x.estCost }));
    try {
      const r = await post(`/api/doctor/visits/${row.visit.id}/finish`, { ...f, plan, closeCase: f.closeTheCase ? f.closeCase : undefined });
      setResult(r);
    } catch (e) { setError(e.message || 'Could not finish the visit'); throw e; }
  }, 'Visit finished');
  if (result) return (
    <Modal title="Visit finished" onClose={onDone} footer={<button className="btn primary" onClick={onDone}>Back to my list</button>}>
      <div className="col gap-6 small">
        <div className="row gap-6"><IconCheck size={16} style={{ color: 'var(--good)' }} />Notes saved to {fullName(row.patient)}'s chart.</div>
        {result.planId && <div className="row gap-6"><IconCheck size={16} style={{ color: 'var(--good)' }} />Treatment plan recorded. The front desk can follow up if they do not book.</div>}
        {result.nextAppointment && <div className="row gap-6"><IconCheck size={16} style={{ color: 'var(--good)' }} />Next visit booked for {fmtWhen(result.nextAppointment.start)}. The patient gets a WhatsApp confirmation and a form link.</div>}
        {result.deskAsked && <div className="row gap-6"><IconCheck size={16} style={{ color: 'var(--good)' }} />The front desk has been asked to book the next visit with the patient.</div>}
        {result.aftercareSent && <div className="row gap-6"><IconCheck size={16} style={{ color: 'var(--good)' }} />Aftercare instructions sent on WhatsApp.</div>}
        {result.caseClosed && <div className="row gap-6"><IconFolderCheck size={16} style={{ color: 'var(--good)' }} />Case closed.</div>}
        {result.ehr && <div className="row gap-6"><IconFileExport size={16} style={{ color: result.ehr.status === 'failed' ? 'var(--bad)' : 'var(--good)' }} />{result.ehr.status === 'sent' ? 'Sent to your EHR.' : result.ehr.status === 'queued' ? 'Queued for your EHR — connect one under Settings → Integrations to deliver it.' : result.ehr.status === 'failed' ? 'The EHR did not accept it; it can be resent from Settings → Integrations.' : 'Sending to your EHR…'}</div>}
        <div className="row gap-6"><IconCheck size={16} style={{ color: 'var(--good)' }} />Marked done. {row.appointment.fee ? `The front desk will collect ${fmtMoney(row.appointment.fee)}.` : ''} A thank-you draft goes to the owner's approval queue.</div>
      </div>
    </Modal>
  );
  return (
    <Modal title={`Finish visit · ${fullName(row.patient)}`} onClose={onClose} wide footer={<><button className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}><IconArrowLeft size={16} />Back</button>{step < 4 ? <button className="btn primary" onClick={() => setStep(step + 1)}>Next <IconArrowRight size={16} /></button> : <button className="btn primary" disabled={busy} onClick={submit}><IconCheck size={16} />Finish{f.closeTheCase ? ' and close case' : ' and mark done'}</button>}</>}>
      <div className="row gap-6 wrap">{steps.map((s, i) => <span key={s} className={`pill ${i === step ? 'accent' : i < step ? 'good' : 'outline'}`}>{i + 1}. {s}</span>)}</div>
      {error && <div className="callout small bad mt-8"><IconAlertTriangle size={14} /> {error}</div>}
      {step === 0 && <div className="col">
        <div className="small muted">Short notes are enough. They go into the chart and the front desk never edits them.</div>
        <Field label="What the patient came for"><input className="input" value={f.chiefComplaint} onChange={(e) => set('chiefComplaint', e.target.value)} placeholder="From their form, if filled" /></Field>
        <Field label="What you found"><input className="input" value={f.findings} onChange={(e) => set('findings', e.target.value)} placeholder="e.g. Deep caries 36, irreversible pulpitis" /></Field>
        <Field label="What you did today" hint="Name the procedure and tooth; this picks the right aftercare message"><input className="input" value={f.procedureDone} onChange={(e) => set('procedureDone', e.target.value)} placeholder="e.g. RCT #36 sitting 1" /></Field>
        <div className="grid two"><Field label="Advice given"><input className="input" value={f.advice} onChange={(e) => set('advice', e.target.value)} placeholder="Soft diet, warm saline rinses" /></Field><Field label="Medicines prescribed (for the record)"><input className="input" value={f.medicines} onChange={(e) => set('medicines', e.target.value)} placeholder="e.g. Amoxicillin 500 mg TDS × 5 days" /></Field></div>
      </div>}
      {step === 1 && <div className="col">
        <div className="small muted">Pick from the clinic's procedure list. Skip if there is nothing to recommend today.{feePolicy.mode === 'fixed' ? ' Fees are set by the clinic.' : feePolicy.mode === 'range' ? ' You can adjust the fee within the clinic’s range, with a short note.' : ' You can adjust the fee, with a short note.'}</div>
        {f.plan.map((it, i) => <PlanItemRow key={i} item={it} procedures={procedures} feePolicy={feePolicy} onChange={(patchObj) => set('plan', f.plan.map((x, j) => j === i ? { ...x, ...patchObj } : x))} onRemove={() => set('plan', f.plan.filter((_, j) => j !== i))} />)}
        <div className="row wrap gap-6"><button className="btn sm" onClick={() => set('plan', [...f.plan, { procedureId: '', procedure: '', tooth: '', priority: 'recommended', estCost: '', note: '' }])}><IconPlus size={14} />Add a recommendation</button></div>
        <Field label="Next steps in your words (optional)"><input className="input" value={f.nextSteps} onChange={(e) => set('nextSteps', e.target.value)} placeholder="e.g. Crown after RCT completes; check insurance first" /></Field>
      </div>}
      {step === 2 && <div className="col">
        <div className="small muted">When should they come back? "Book now" finds the first free slot with you and confirms it on WhatsApp. "Front desk books" adds it to their list.</div>
        <div className="row wrap gap-6">{[['none', 'No next visit'], ['book', 'Book now'], ['desk', 'Front desk books with patient']].map(([v, l]) => <button key={v} className={`btn ${f.nextVisit.mode === v ? 'primary' : ''}`} onClick={() => set('nextVisit', { ...f.nextVisit, mode: v })}>{l}</button>)}</div>
        {f.nextVisit.mode !== 'none' && <div className="grid three">
          <Field label="Visit type"><select className="input" value={f.nextVisit.visitTypeId} onChange={(e) => set('nextVisit', { ...f.nextVisit, visitTypeId: e.target.value })}>{data.visitTypes.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
          <Field label="In about"><select className="input" value={f.nextVisit.inDays} onChange={(e) => set('nextVisit', { ...f.nextVisit, inDays: Number(e.target.value) })}>{[[3, '3 days'], [7, '1 week'], [14, '2 weeks'], [21, '3 weeks'], [30, '1 month'], [90, '3 months'], [180, '6 months']].map(([d, l]) => <option key={d} value={d}>{l}</option>)}</select></Field>
          <Field label="For"><input className="input" value={f.nextVisit.notes} onChange={(e) => set('nextVisit', { ...f.nextVisit, notes: e.target.value })} placeholder="e.g. RCT #36 sitting 2" /></Field>
        </div>}
      </div>}
      {step === 3 && <div className="col">
        <div className="small muted">Sent to the patient on WhatsApp in their language ({ac?.lang === 'hi' ? 'Hindi' : ac?.lang === 'kn' ? 'Kannada' : 'English'}) as soon as you finish. Pick a template or edit the text; clear it to send nothing.</div>
        <div className="row wrap gap-6">{(ac?.options || []).map((o) => <button key={o.id} className={`btn sm ${f.aftercare.id === o.id ? 'primary' : ''}`} onClick={() => set('aftercare', { id: o.id, body: o.body })}>{o.name}</button>)}</div>
        <textarea className="input" style={{ minHeight: 150 }} value={f.aftercare.body} onChange={(e) => set('aftercare', { ...f.aftercare, body: e.target.value })} />
      </div>}
      {step === 4 && <div className="col">
        <div className="small muted">Close this only when the treatment for this concern is finished, nothing left to book. Notes go into the chart and, when connected, to your EHR.</div>
        <label className="check small"><input type="checkbox" checked={f.closeTheCase} onChange={(e) => set('closeTheCase', e.target.checked)} />Close the case</label>
        {f.closeTheCase && <div className="grid two">
          <Field label="Outcome"><select className="input" value={f.closeCase.outcome} onChange={(e) => set('closeCase', { ...f.closeCase, outcome: e.target.value })}><option value="resolved">Resolved</option><option value="referred">Referred elsewhere</option><option value="patient_declined">Patient declined further treatment</option><option value="other">Other</option></select></Field>
          <Field label="Closing notes"><input className="input" value={f.closeCase.notes} onChange={(e) => set('closeCase', { ...f.closeCase, notes: e.target.value })} placeholder="e.g. Healed well, no further treatment needed" /></Field>
        </div>}
        <label className="check small"><input type="checkbox" checked={f.sendToEhr} onChange={(e) => set('sendToEhr', e.target.checked)} />Send this visit's record to the clinic's EHR</label>
        <div className="callout small"><b>What happens when you tap Finish:</b> notes saved · {f.plan.filter((x) => x.procedure || x.procedureId).length ? `${f.plan.filter((x) => x.procedure || x.procedureId).length} recommendation(s) recorded · ` : ''}{f.nextVisit.mode === 'book' ? 'next visit booked · ' : f.nextVisit.mode === 'desk' ? 'front desk asked to book · ' : ''}{f.aftercare.body.trim() ? 'aftercare sent · ' : ''}{f.closeTheCase ? 'case closed · ' : ''}{f.sendToEhr ? 'sent to EHR · ' : ''}visit marked done{row.appointment.fee ? ` · front desk collects ${fmtMoney(row.appointment.fee)}` : ''}.</div>
      </div>}
    </Modal>
  );
}

/** One treatment-plan line: pick a procedure from the clinic's catalogue (or type one in, if allowed), respecting the fee policy. */
function PlanItemRow({ item, procedures, feePolicy, onChange, onRemove }) {
  const cat = procedures.find((p) => p.id === item.procedureId) || null;
  const custom = !item.procedureId;
  const fixed = feePolicy.mode === 'fixed';
  const defaultFee = cat ? cat.fee : '';
  const feeChanged = cat && item.estCost !== '' && Number(item.estCost) !== cat.fee;
  const needsNote = feeChanged && feePolicy.noteOnChange !== false && !item.note;
  return (
    <div className="col" style={{ padding: '8px 0', borderBottom: '1px dashed var(--border)' }}>
      <div className="row wrap">
        <select className="input grow" style={{ minWidth: 220 }} value={item.procedureId || '__custom'} onChange={(e) => { const v = e.target.value; if (v === '__custom') onChange({ procedureId: '', procedure: item.procedure || '', estCost: item.estCost }); else { const p = procedures.find((x) => x.id === v); onChange({ procedureId: v, procedure: p.name, estCost: p.fee }); } }}>
          {procedures.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.category}</option>)}
          {feePolicy.allowCustom !== false && <option value="__custom">Other (type it in)…</option>}
        </select>
        <input className="input" style={{ width: 80 }} placeholder="Tooth" value={item.tooth} onChange={(e) => onChange({ tooth: e.target.value })} />
        <select className="input" style={{ width: 130 }} value={item.priority} onChange={(e) => onChange({ priority: e.target.value })}><option value="high">Needed soon</option><option value="recommended">Recommended</option><option value="elective">Optional</option></select>
        <button className="btn sm ghost icon" onClick={onRemove}><IconTrash size={14} /></button>
      </div>
      {custom && <input className="input mt-8" placeholder="Procedure name" value={item.procedure} onChange={(e) => onChange({ procedure: e.target.value })} />}
      <div className="row wrap mt-8">
        <div className="row gap-4"><span className="tiny muted">₹</span><input className="input" type="number" style={{ width: 100 }} disabled={fixed && !custom} value={item.estCost} placeholder={defaultFee !== '' ? String(defaultFee) : 'Fee'} onChange={(e) => onChange({ estCost: e.target.value })} /></div>
        {cat && cat.minFee != null && cat.maxFee != null && feePolicy.mode !== 'fixed' && <span className="tiny muted">Clinic range: ₹{cat.minFee}–₹{cat.maxFee} (usually ₹{cat.fee})</span>}
        {fixed && !custom && <span className="tiny muted">Fee is fixed by the clinic.</span>}
        {(feePolicy.mode !== 'fixed' || custom) && <input className="input grow" style={{ minWidth: 160 }} placeholder="Note (needed if the fee changes)" value={item.note || ''} onChange={(e) => onChange({ note: e.target.value })} />}
      </div>
      {needsNote && <div className="tiny" style={{ color: 'var(--warn)' }}>Add a note explaining the fee change, or the clinic's system will reject it.</div>}
    </div>
  );
}

/** A small "add to calendar" button for one appointment: Google, Outlook or a downloadable .ics, no clinic-wide setup needed. */
function AddToCalendar({ appointmentId }) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState(null);
  useEffect(() => {
    if (!open || links) return;
    get(`/api/calendar/links/${appointmentId}`).then(setLinks).catch(() => setLinks({ error: true }));
  }, [open, links, appointmentId]);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);
  return (
    <div className="cal-add" onClick={(e) => e.stopPropagation()}>
      <button className="btn sm ghost icon" title="Add to calendar" onClick={() => setOpen((x) => !x)}><IconCalendarEvent size={14} /></button>
      {open && (
        <div className="cal-add-menu">
          {!links && <div className="tiny muted" style={{ padding: '6px 8px' }}>Loading…</div>}
          {links?.error && <div className="tiny muted" style={{ padding: '6px 8px' }}>Couldn't load calendar links.</div>}
          {links && !links.error && <>
            <a href={links.google} target="_blank" rel="noreferrer">Add to Google Calendar</a>
            <a href={links.outlook} target="_blank" rel="noreferrer">Add to Outlook</a>
            <button onClick={() => downloadFile(`/api/calendar/appointment/${appointmentId}.ics`)}>Download .ics file</button>
          </>}
        </div>
      )}
    </div>
  );
}
