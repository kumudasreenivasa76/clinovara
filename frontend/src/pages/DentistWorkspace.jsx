import React, { useEffect, useState } from 'react';
import { IconBellRinging, IconCheck, IconClock, IconPlayerPlay, IconSend, IconPlus, IconArrowRight, IconAlertTriangle, IconNote, IconChevronLeft } from '@tabler/icons-react';
import { get, post } from '../lib/api.js';
import { fmtTime, fmtWhen, ago } from '../lib/format.js';
import { Card, Body, Empty, usePoll, useAction, Modal, Field, Seg } from '../components/ui.jsx';
import { longDate } from '../components/dash.jsx';

/** The same status words reception sees, with one colour each. */
const STATUS = {
  upcoming: ['Upcoming', 'st-pending'], checked_in: ['Arrived', 'st-checkedin'], waiting: ['Waiting', 'st-waiting'], called: ['Called', 'st-confirmed'],
  in_progress: ['In progress', 'st-inchair'], completed: ['Completed', 'st-completed'], cancelled: ['Cancelled', 'st-cancelled'], no_show: ['No show', 'st-noshow'],
};
const INTAKE = { not_sent: 'st-noshow', not_submitted: 'st-pending', pending_review: 'st-waiting', clarification: 'st-cancelled', reviewed: 'st-completed' };
const Badge = ({ value }) => { const [l, c] = STATUS[value] || [value, '']; return <span className={`fdx-badge ${c}`}>{l}</span>; };
const IntakeBadge = ({ intake }) => <span className={`fdx-badge ${INTAKE[intake.state] || ''}`}>{intake.label}</span>;
const q = (providerId) => (providerId ? `?providerId=${providerId}` : '');
const go = (tab) => { window.location.hash = `#/doctor?tab=${tab}`; };
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

/** My dashboard: the day at a glance and what needs the dentist. */
export function DentistHome({ providerId }) {
  const { data } = usePoll(() => get(`/api/dentist/dashboard${q(providerId)}`), [providerId], 10000);
  if (!data) return <div className="skeleton" />;
  const k = data.kpis; const a = data.attention;
  const attention = [
    [a.intakePending, a.intakePending === 1 ? 'intake submission awaiting your review' : 'intake submissions awaiting your review', 'intake'],
    [a.waiting, a.waiting === 1 ? 'patient waiting' : 'patients waiting', 'queue'],
    [a.handoffsNew, a.handoffsNew === 1 ? 'new note from reception' : 'new notes from reception', 'queue'],
    [a.tasksAnswered, a.tasksAnswered === 1 ? 'task finished by reception' : 'tasks finished by reception', 'tasks'],
    [a.clarifications, a.clarifications === 1 ? 'clarification waiting on reception' : 'clarifications waiting on reception', 'intake'],
  ].filter(([n]) => n > 0);
  return (
    <>
      <div className="dw-hello"><h1>{greeting()}, {data.provider.name}</h1><p>{longDate()} · {data.clinic}</p></div>
      <div className="dw-kpis">
        {[['Appointments', k.appointments, 'home'], ['Arrived', k.arrived, 'queue'], ['Waiting', k.waiting, 'queue'], ['In progress', k.inProgress, 'queue'], ['Completed', k.completed, 'home'], ['Upcoming', k.upcoming, 'home']].map(([label, value, tab]) => (
          <button key={label} className="fdx-kpi" onClick={() => go(tab)}><span className="l">{label}</span><b>{value}</b></button>))}
      </div>
      <div className="fdx-main dw-main">
        <Card title="Today’s schedule" actions={<a className="btn sm ghost" href="#/doctor?tab=appts">View full schedule</a>}>
          {data.schedule.length === 0 ? <Body><Empty>No appointments today.</Empty></Body> : (
            <table className="table fdx-table"><thead><tr><th>Time</th><th>Patient</th><th>Visit</th><th>Intake</th><th>Status</th></tr></thead>
              <tbody>{data.schedule.map((s) => (
                <tr key={s.id} className={s.status === 'cancelled' ? 'dim' : ''}>
                  <td className="mono nowrap">{fmtTime(s.start)}</td>
                  <td><span className="strong">{s.patientName}</span>{s.token && <span className="fdx-token">{s.token}</span>}{s.newPatient && <span className="fdx-badge st-confirmed" style={{ marginLeft: 8 }}>New patient</span>}</td>
                  <td>{s.service}</td>
                  <td>{s.packetId ? <a href={`#/doctor?tab=intake&packet=${s.packetId}`}><IntakeBadge intake={s.intake} /></a> : <IntakeBadge intake={s.intake} />}</td>
                  <td><Badge value={s.status} />{s.waitedMin != null && <div className="tiny muted nowrap">waited {s.waitedMin} min</div>}</td>
                </tr>))}</tbody></table>)}
        </Card>
        <div className="col gap-16">
          <Card title="Needs your attention"><Body className="col gap-8">
            {attention.length === 0 && <div className="small muted">Nothing is waiting on you.</div>}
            {attention.map(([n, text, tab]) => <button key={text} className="dw-attn" onClick={() => go(tab)}><b>{n}</b><span>{text}</span><IconArrowRight size={15} /></button>)}
          </Body></Card>
          <Card title="Free time today"><Body className="col gap-8">
            {data.gaps.length === 0 && <div className="small muted">No free stretch of 20 minutes or more left today.</div>}
            {data.gaps.map((g) => <div key={g.start} className="row between small"><span className="mono">{fmtTime(g.start)} to {fmtTime(g.end)}</span><span className="muted">{g.minutes} min free</span></div>)}
          </Body></Card>
        </div>
      </div>
    </>
  );
}

/** Today's arrivals and the live queue: call, start and close each visit, and read reception's note. */
export function DentistQueue({ providerId }) {
  const { data, reload } = usePoll(() => get(`/api/dentist/queue${q(providerId)}`), [providerId], 6000);
  const [run, busy] = useAction();
  const [closing, setClosing] = useState(null);
  const [late, setLate] = useState(false);
  const act = (fn, msg) => run(async () => { await fn(); await reload?.(); }, msg);
  if (!data) return <div className="skeleton" />;
  const body = providerId ? { providerId } : {};
  const next = data.queue.find((x) => ['waiting', 'checked_in'].includes(x.status));
  const NEXT = { checked_in: ['call', 'Call patient', IconBellRinging], waiting: ['call', 'Call patient', IconBellRinging], called: ['start', 'Start visit', IconPlayerPlay] };
  return (
    <>
      <div className="row between wrap mb-16">
        <div><h2>Today’s arrivals</h2><p className="small muted">{data.queue.length} checked in · {data.expected.length} still expected · {data.done.length} finished. Changes here show on reception’s screen at once.</p></div>
        <div className="row gap-6"><button className="btn" disabled={busy} onClick={() => setLate(true)}><IconClock size={15} />I am running late</button><button className="btn primary" disabled={busy || !next} onClick={() => act(() => post(`/api/dentist/appointments/${next.id}/call`, body), `${next.patientName} called`)}><IconBellRinging size={15} />Call next patient</button></div>
      </div>
      {data.queue.length === 0 && <Card><Body><Empty>Nobody has checked in yet. Patients appear here the moment reception or the kiosk checks them in.</Empty></Body></Card>}
      <div className="dw-queue">
        {data.queue.map((x) => { const nx = NEXT[x.status]; return (
          <div key={x.id} className={`dw-card ${x.status}`}>
            <div className="top"><span className="fdx-token lg">{x.token || 'No token'}</span><div className="grow"><div className="strong">{x.patientName}{x.newPatient && <span className="fdx-badge st-confirmed" style={{ marginLeft: 8 }}>New patient</span>}</div><div className="tiny muted">{x.service} · appointment {fmtTime(x.start)}{x.position ? ` · number ${x.position} in the queue` : ''}</div></div><Badge value={x.status} /></div>
            <div className="facts">
              <div><span>Checked in</span><b>{x.checkedInAt ? fmtTime(x.checkedInAt) : 'Not yet'}</b></div>
              <div><span>Waited</span><b className={x.waitedMin >= 20 ? 'fdx-long' : ''}>{x.waitedMin != null ? `${x.waitedMin} min` : 'In the chair'}</b></div>
              <div><span>Intake form</span><b>{x.packetId ? <a href={`#/doctor?tab=intake&packet=${x.packetId}`}>{x.intake.label}</a> : x.intake.label}</b></div>
              <div><span>Reception checks</span><b>{x.deskVerified ? 'Complete' : `Missing: ${x.missing.join(', ')}`}</b></div>
            </div>
            {x.handoff && <div className={`dw-note ${x.handoff.acknowledgedAt ? 'seen' : ''}`}><IconNote size={15} /><div className="grow"><div className="small">“{x.handoff.note}”</div><div className="tiny muted">From {x.handoff.by}, {ago(x.handoff.at)}{x.handoff.acknowledgedAt ? ' · you have seen this' : ''}</div></div>{!x.handoff.acknowledgedAt && <button className="btn sm" disabled={busy} onClick={() => act(() => post(`/api/dentist/appointments/${x.id}/handoff/acknowledge`, body), 'Reception knows you have seen it')}>Got it</button>}</div>}
            <div className="acts">
              {nx && <button className="btn primary sm" disabled={busy} onClick={() => act(() => post(`/api/dentist/appointments/${x.id}/${nx[0]}`, body), nx[0] === 'call' ? `${x.patientName} called` : 'Visit started')}>{React.createElement(nx[2], { size: 14 })}{nx[1]}</button>}
              {x.status === 'in_progress' && <button className="btn primary sm" disabled={busy} onClick={() => setClosing(x)}><IconCheck size={14} />Complete visit</button>}
              <a className="btn sm ghost" href={`#/doctor?tab=tasks&patient=${x.patientId}&appointment=${x.id}`}>Ask reception</a>
            </div>
          </div>); })}
      </div>
      {data.expected.length > 0 && <Card title={`Still expected (${data.expected.length})`} className="mt-16"><table className="table"><tbody>{data.expected.map((x) => <tr key={x.id}><td className="mono nowrap" style={{ width: 90 }}>{fmtTime(x.start)}</td><td className="strong">{x.patientName}</td><td>{x.service}</td><td><IntakeBadge intake={x.intake} /></td><td>{x.lateMin >= 10 ? <span className="fdx-late inline">{x.lateMin} min late</span> : <Badge value="upcoming" />}</td></tr>)}</tbody></table></Card>}
      {closing && <CompleteVisit row={closing} providerId={providerId} onClose={() => setClosing(null)} onDone={() => { setClosing(null); reload?.(); }} />}
      {late && <LateModal providerId={providerId} onClose={() => setLate(false)} />}
    </>
  );
}

function CompleteVisit({ row, providerId, onClose, onDone }) {
  const [run, busy] = useAction();
  const [bookNext, setBookNext] = useState(false); const [followUp, setFollowUp] = useState(false); const [instruction, setInstruction] = useState('');
  const save = () => run(async () => { await post(`/api/dentist/appointments/${row.id}/complete`, { bookNext, followUp, instruction, ...(providerId ? { providerId } : {}) }); onDone(); }, bookNext || followUp || instruction ? 'Visit completed. Reception has your instructions.' : 'Visit completed');
  return (
    <Modal title="Complete visit" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>Mark visit completed</button></>}>
      <div className="col gap-12">
        <div className="small"><b>{row.patientName}</b> · {row.service} · {fmtTime(row.start)}</div>
        <div className="field-label">What should reception do next?</div>
        <label className="check"><input type="checkbox" checked={bookNext} onChange={(e) => setBookNext(e.target.checked)} />Book the next appointment</label>
        <label className="check"><input type="checkbox" checked={followUp} onChange={(e) => setFollowUp(e.target.checked)} />Call the patient back later</label>
        <Field label="Instruction for reception" hint="Administrative only, for example how soon and how long. Do not write clinical notes here."><textarea className="input" rows={3} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="e.g. Next visit in two weeks, 30 minutes." /></Field>
      </div>
    </Modal>
  );
}

function LateModal({ providerId, onClose }) {
  const [run, busy] = useAction(); const [minutes, setMinutes] = useState(15); const [note, setNote] = useState('');
  return (
    <Modal title="Tell reception you are running late" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={() => run(async () => { await post('/api/dentist/delay', { minutes, note, ...(providerId ? { providerId } : {}) }); onClose(); }, 'Reception has been told')}>Tell reception</button></>}>
      <div className="col gap-12">
        <div><div className="field-label">About how long?</div><div className="mt-8"><Seg value={minutes} onChange={setMinutes} options={[10, 15, 30, 45, 60].map((m) => ({ value: m, label: `${m} min` }))} /></div></div>
        <Field label="Note" hint="Optional"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Current visit is taking longer than planned" /></Field>
      </div>
    </Modal>
  );
}

/** Pre-visit forms for this dentist's patients: read what was submitted, record a review, or ask reception to clarify. */
export function DentistIntake({ providerId }) {
  const { data, reload } = usePoll(() => get(`/api/dentist/intake${q(providerId)}`), [providerId], 10000);
  const [open, setOpen] = useState(() => new URLSearchParams(window.location.hash.split('?')[1] || '').get('packet'));
  useEffect(() => { const f = () => { const p = new URLSearchParams(window.location.hash.split('?')[1] || '').get('packet'); if (p) setOpen(p); }; window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  const [filter, setFilter] = useState('today');
  if (open) return <IntakeDetail packetId={open} providerId={providerId} onBack={() => { setOpen(null); reload?.(); }} />;
  if (!data) return <div className="skeleton" />;
  const c = data.counts;
  const list = data.items.filter((x) => (filter === 'today' ? x.today : filter === 'pending' ? x.intake.state === 'pending_review' : true));
  return (
    <>
      <div className="row between wrap mb-16"><div><h2>Patient intake reviews</h2><p className="small muted">What patients sent before their visit, for your appointments in the next seven days. Answers are patient reported and have not been verified.</p></div>
        <Seg value={filter} onChange={setFilter} options={[{ value: 'today', label: 'Today' }, { value: 'pending', label: 'Pending review' }, { value: 'all', label: 'Next 7 days' }]} /></div>
      <div className="dw-kpis three"><div className="fdx-kpi"><span className="l">Submitted</span><b>{c.submitted}</b></div><div className="fdx-kpi"><span className="l">Pending review</span><b>{c.pending}</b></div><div className="fdx-kpi"><span className="l">Clarification needed</span><b>{c.clarification}</b></div></div>
      <Card>
        {list.length === 0 ? <Body><Empty>Nothing to review here.</Empty></Body> : (
          <table className="table"><thead><tr><th>Appointment</th><th>Patient</th><th>Visit</th><th>Received by</th><th>Answered</th><th>Status</th><th /></tr></thead>
            <tbody>{list.map((x) => (
              <tr key={x.appointmentId}>
                <td className="nowrap small">{x.today ? fmtTime(x.start) : fmtWhen(x.start)}</td><td className="strong">{x.patientName}</td><td>{x.service}</td>
                <td className="muted">{x.intake.channel || 'Not sent'}</td><td className="mono small">{x.intake.done} of {x.intake.total}</td>
                <td><IntakeBadge intake={x.intake} />{x.intake.updatedSinceReview && <div className="tiny muted">New answers since your review</div>}</td>
                <td className="right">{x.packetId && x.intake.done > 0 ? <button className="btn sm" onClick={() => setOpen(x.packetId)}>Open submission</button> : <span className="tiny muted">Nothing submitted</span>}</td>
              </tr>))}</tbody></table>)}
      </Card>
    </>
  );
}

function IntakeDetail({ packetId, providerId, onBack }) {
  const [d, setD] = useState(null); const [err, setErr] = useState('');
  const [tab, setTab] = useState('info'); const [asking, setAsking] = useState(false); const [note, setNote] = useState('');
  const [run, busy] = useAction();
  const load = () => get(`/api/dentist/intake/${packetId}${q(providerId)}`).then(setD).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [packetId]); // eslint-disable-line
  if (err) return <Card><Body><div className="callout bad small">{err}</div><button className="btn mt-8" onClick={onBack}>Back</button></Body></Card>;
  if (!d) return <div className="skeleton" />;
  const body = providerId ? { providerId } : {};
  const Answers = ({ sections }) => sections.map((s) => (
    <div key={s.key || s.id} className="dw-sec"><div className="row between"><h4>{s.label || s.name}</h4><span className="tiny muted">{s.complete ? `Answered by ${s.by === 'patient' ? 'the patient' : s.by || 'the patient'}${s.at ? `, ${ago(s.at)}` : ''}` : s.carriedForward ? 'Carried forward from an earlier visit, not confirmed' : 'Not answered'}</span></div>
      {s.answers.length ? <dl>{s.answers.map((a) => <div key={a.label}><dt>{a.label}</dt><dd>{a.value}</dd></div>)}</dl> : <div className="small muted">No answers.</div>}</div>));
  const tabs = [['info', 'Patient information'], ['questions', 'Appointment questionnaire'], ['health', 'Patient reported health'], ['docs', `Documents (${d.documents.length})`], ['consent', 'Consent and signature'], ['history', 'Submission history']];
  return (
    <>
      <button className="btn sm ghost mb-16" onClick={onBack}><IconChevronLeft size={14} />All submissions</button>
      <Card>
        <div className="dw-head"><div><h2>{d.patient.name}</h2><div className="small muted">{d.service} · appointment {fmtWhen(d.start)}</div></div><IntakeBadge intake={d.intake} /></div>
        <div className="dw-tabs" role="tablist">{tabs.map(([id, l]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{l}</button>)}</div>
        <Body className="col gap-12">
          {tab === 'info' && <dl className="dw-info"><div><dt>Name</dt><dd>{d.patient.name}</dd></div><div><dt>Phone</dt><dd>{d.patient.phone || 'Not given'}</dd></div><div><dt>Age</dt><dd>{d.patient.age ?? 'Not given'}</dd></div><div><dt>Language</dt><dd>{({ en: 'English', hi: 'Hindi', kn: 'Kannada', ta: 'Tamil', te: 'Telugu' })[d.patient.language] || d.patient.language}</dd></div><div><dt>Email</dt><dd>{d.patient.email || 'Not given'}</dd></div></dl>}
          {tab === 'questions' && <><Answers sections={d.questionnaire} /><Answers sections={d.administrative} /><Answers sections={d.clinicForms.map((c) => ({ ...c, label: c.name }))} /></>}
          {tab === 'health' && <><div className="callout small">Patient reported. These answers are what the patient wrote and have not been clinically verified.</div><Answers sections={d.health} /></>}
          {tab === 'docs' && (d.documents.length ? <div className="list">{d.documents.map((x) => <div key={x.id} className="list-item"><span className="grow small">{x.name}</span><span className="tiny muted">{x.at ? ago(x.at) : ''}</span></div>)}</div> : <div className="small muted">No documents were uploaded.</div>)}
          {tab === 'consent' && <dl className="dw-info"><div><dt>Declaration</dt><dd>{d.consent.recorded ? 'Recorded' : 'Not recorded'}</dd></div><div><dt>Signature evidence</dt><dd>{d.consent.signature}</dd></div><div><dt>Signed</dt><dd>{d.consent.at ? fmtWhen(d.consent.at) : 'Not yet'}</dd></div></dl>}
          {tab === 'history' && (d.history.length ? <div className="col gap-8">{d.history.map((h, i) => <div key={i} className="row between small"><span>{h.text}</span><span className="muted tiny nowrap">{h.at ? fmtWhen(h.at) : ''}</span></div>)}</div> : <div className="small muted">No activity yet.</div>)}
        </Body>
        <div className="dw-review">
          <div className="small muted grow">{d.intake.review ? `${d.intake.review.status === 'reviewed' ? 'Reviewed' : 'Clarification requested'} by ${d.intake.review.by}, ${ago(d.intake.review.at)}${d.intake.updatedSinceReview ? '. New answers have arrived since.' : ''}` : 'You cannot change what the patient submitted. Record your review, or ask reception to check something with the patient.'}</div>
          {asking ? <div className="row gap-6 grow"><input className="input" autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="What should reception check with the patient?" /><button className="btn primary" disabled={busy || note.trim().length < 3} onClick={() => run(async () => { await post(`/api/dentist/intake/${packetId}/clarification`, { note, ...body }); setAsking(false); setNote(''); await load(); }, 'Reception has a task to clarify this')}>Send</button><button className="btn ghost" onClick={() => setAsking(false)}>Cancel</button></div> : <>
            <button className="btn" disabled={busy} onClick={() => setAsking(true)}>Request clarification from reception</button>
            <button className="btn primary" disabled={busy || (d.intake.state === 'reviewed')} onClick={() => run(async () => { await post(`/api/dentist/intake/${packetId}/review`, body); await load(); }, 'Marked as reviewed')}><IconCheck size={15} />{d.intake.state === 'reviewed' ? 'Reviewed' : 'Mark as reviewed'}</button></>}
        </div>
      </Card>
    </>
  );
}

/** Follow-up tasks the dentist gives reception, with their status as reception works them. */
export function DentistTasks({ providerId }) {
  const { data, reload } = usePoll(() => get(`/api/dentist/followups${q(providerId)}`), [providerId], 10000);
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const [form, setForm] = useState(() => (params.get('patient') ? { type: 'book_next', patientId: params.get('patient'), appointmentId: params.get('appointment') || '', description: '', priority: 'normal', due: '' } : null));
  const [run, busy] = useAction();
  if (!data) return <div className="skeleton" />;
  const create = () => run(async () => { await post('/api/dentist/followups', { ...form, ...(providerId ? { providerId } : {}) }); setForm(null); await reload?.(); }, 'Sent to reception');
  const quick = ['book_next', 'callback', 'reschedule', 'reminder', 'fee_query', 'missing_docs'];
  const TONE = { pending: 'st-waiting', in_progress: 'st-confirmed', done: 'st-completed' }; const WORD = { pending: 'Pending', in_progress: 'In progress', done: 'Done' };
  return (
    <>
      <div className="row between wrap mb-16"><div><h2>Follow up tasks for reception</h2><p className="small muted">{data.counts.pending} pending · {data.counts.inProgress} in progress · {data.counts.done} done. Reception sees these on the front desk dashboard.</p></div>
        <button className="btn primary" onClick={() => setForm({ type: 'book_next', patientId: '', appointmentId: '', description: '', priority: 'normal', due: '' })}><IconPlus size={15} />New task</button></div>
      <div className="row gap-6 wrap mb-16">{quick.map((t) => <button key={t} className="btn sm" onClick={() => setForm({ type: t, patientId: '', appointmentId: '', description: '', priority: 'normal', due: '' })}>{data.types[t]}</button>)}</div>
      <Card>
        {data.tasks.length === 0 ? <Body><Empty>No tasks yet. Use one of the buttons above to ask reception for something.</Empty></Body> : (
          <table className="table"><thead><tr><th>Task</th><th>Patient</th><th>Due</th><th>Priority</th><th>Status</th></tr></thead>
            <tbody>{data.tasks.map((t) => (
              <tr key={t.id}>
                <td><div className="small strong">{t.title}</div>{t.description && <div className="tiny muted">{t.description}</div>}{t.resolution && <div className="tiny" style={{ color: '#067647' }}>Reception: {t.resolution}</div>}</td>
                <td>{t.patientName || <span className="muted tiny">No patient</span>}</td>
                <td className={`small nowrap ${t.overdue ? 'fdx-long' : ''}`}>{t.due}{t.overdue ? ' · overdue' : ''}</td>
                <td>{t.priority === 'high' ? <span className="fdx-badge st-cancelled">High</span> : <span className="muted small">Normal</span>}</td>
                <td><span className={`fdx-badge ${TONE[t.status]}`}>{WORD[t.status]}</span><div className="tiny muted">{t.status === 'done' ? `by ${t.doneBy}, ${ago(t.doneAt)}` : `asked ${ago(t.createdAt)}`}</div></td>
              </tr>))}</tbody></table>)}
      </Card>
      {form && (
        <Modal title="Ask reception" onClose={() => setForm(null)} footer={<><button className="btn ghost" onClick={() => setForm(null)}>Cancel</button><button className="btn primary" disabled={busy} onClick={create}><IconSend size={15} />Send to reception</button></>}>
          <div className="col gap-12">
            <Field label="What should reception do?"><select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{Object.entries(data.types).filter(([k]) => !['clarification', 'delay', 'checkout'].includes(k)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Patient" hint="Today’s patients are listed. Leave blank for a general request."><select className="input" value={form.patientId} onChange={(e) => { const p = data.patients.find((x) => x.id === e.target.value); setForm({ ...form, patientId: e.target.value, appointmentId: p?.appointmentId || '' }); }}><option value="">No patient</option>{data.patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}{form.patientId && !data.patients.some((p) => p.id === form.patientId) && <option value={form.patientId}>Selected patient</option>}</select></Field>
            <Field label="Details"><textarea className="input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Administrative details only." /></Field>
            <div className="grid two"><Field label="Due date"><input className="input" type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} /></Field><div><div className="field-label">Priority</div><div className="mt-8"><Seg value={form.priority} onChange={(v) => setForm({ ...form, priority: v })} options={[{ value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }]} /></div></div></div>
          </div>
        </Modal>)}
    </>
  );
}

export const DentistAttention = IconAlertTriangle;
