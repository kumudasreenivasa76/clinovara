import React, { useState } from 'react';
import { IconPlus, IconSend, IconCalendarPlus, IconMessageQuestion, IconPhoneCall, IconTrash, IconCheck, IconFolderCheck } from '@tabler/icons-react';
import { get, post, patch, del } from '../lib/api.js';
import { fmtWhen, fmtDate, fullName, ago, fmtMoney, fmtPhone } from '../lib/format.js';
import { Card, Body, Pill, Avatar, Empty, usePoll, useAction, Modal, Field, Seg, Stat } from '../components/ui.jsx';
import { PatientPicker, SlotPicker } from './Schedule.jsx';

export default function Treatment() {
  const { data, reload } = usePoll(() => get('/api/treatment-plans'), [], 8000);
  const settings = usePoll(() => get('/api/settings'), []);
  const [filter, setFilter] = useState('unscheduled');
  const [open, setOpen] = useState(null);
  const [creating, setCreating] = useState(false);
  const list = (data || []).filter((p) => filter === 'all' || (filter === 'unscheduled' ? !p.nextVisitScheduled && p.openItems.length && p.status !== 'closed' : filter === 'questions' ? p.openQuestions > 0 : filter === 'closed' ? p.status === 'closed' : p.nextVisitScheduled));
  const plan = (data || []).find((p) => p.id === open);
  const unscheduledValue = (data || []).filter((p) => !p.nextVisitScheduled && p.openItems.length).reduce((s, p) => s + p.openItems.reduce((x, i) => x + (i.estCost || 0), 0), 0);

  return (
    <>
      <div className="page-head">
        <div><h1>Treatment plan coordination</h1><p>Dentist-approved recommendations, the patient's questions, next steps, and whether the next visit is on the books.</p></div>
        <div className="row"><Seg value={filter} onChange={setFilter} options={[{ value: 'unscheduled', label: 'Left without booking' }, { value: 'questions', label: 'Open questions' }, { value: 'scheduled', label: 'Scheduled' }, { value: 'closed', label: 'Closed cases' }, { value: 'all', label: 'All' }]} /><button className="btn primary" onClick={() => setCreating(true)}><IconPlus size={16} />Record plan</button></div>
      </div>
      <div className="grid four mb-16">
        <Stat value={(data || []).filter((p) => !p.nextVisitScheduled && p.openItems.length).length} label="Unscheduled treatment" hint={unscheduledValue ? `${fmtMoney(unscheduledValue)} estimated` : ''} tone={(data || []).some((p) => !p.nextVisitScheduled && p.openItems.length) ? 'warn' : ''} />
        <Stat value={(data || []).reduce((s, p) => s + p.openQuestions, 0)} label="Unanswered patient questions" tone={(data || []).some((p) => p.openQuestions) ? 'bad' : ''} />
        <Stat value={(data || []).filter((p) => p.nextVisitScheduled).length} label="Next visit scheduled" tone="good" />
        <Stat value={(data || []).length} label="Plans on file" />
      </div>
      <Card>
        <table className="table">
          <thead><tr><th>Patient</th><th>Recommended by</th><th>Items</th><th>Next visit</th><th>Follow-up</th><th>Questions</th><th /></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => setOpen(p.id)}>
                <td><div className="row"><Avatar patient={p.patient} /><div><div className="small strong">{fullName(p.patient)}</div><div className="tiny muted">{fmtDate(p.createdAt)}</div></div></div></td>
                <td className="small">{p.provider?.name}</td>
                <td><div className="col gap-4">{p.items.map((i) => <div key={i.id} className="row gap-6 small"><Pill status={i.status} />{i.procedure}{i.estCost ? <span className="tiny muted">{fmtMoney(i.estCost)}</span> : null}</div>)}</div></td>
                <td>{p.status === 'closed' ? <Pill tone="good"><IconFolderCheck size={11} />Closed{p.closingOutcome ? ` · ${p.closingOutcome}` : ''}</Pill> : p.nextAppointment ? <Pill tone="good">{fmtWhen(p.nextAppointment.start)}</Pill> : p.openItems.length ? <Pill tone="warn">Not booked</Pill> : <Pill>Nothing open</Pill>}</td>
                <td className="tiny muted">{p.followUps.length ? `${p.followUps.length} · last ${ago(p.followUps[p.followUps.length - 1].at)}` : 'None yet'}</td>
                <td>{p.openQuestions ? <Pill tone="bad"><IconMessageQuestion size={12} />{p.openQuestions} open</Pill> : p.patientQuestions.length ? <Pill tone="good">Answered</Pill> : <span className="tiny faint">—</span>}</td>
                <td className="right"><button className="btn sm ghost">Open</button></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={7}><Empty>Nothing here.</Empty></td></tr>}
          </tbody>
        </table>
      </Card>
      {plan && settings.data && <PlanModal plan={plan} settings={settings.data} onClose={() => setOpen(null)} onChange={reload} />}
      {creating && settings.data && <CreatePlan settings={settings.data} onClose={() => setCreating(false)} onDone={() => { setCreating(false); reload(); }} />}
    </>
  );
}

function PlanModal({ plan, settings, onClose, onChange }) {
  const [run, busy] = useAction();
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState({});
  const [note, setNote] = useState('');
  const [item, setItem] = useState({ procedure: '', tooth: '', priority: 'recommended', estCost: '' });
  const [scheduling, setScheduling] = useState(false);
  const [slot, setSlot] = useState(null);
  const [visitTypeId, setVisitTypeId] = useState('vt_procedure');
  const [nextSteps, setNextSteps] = useState(plan.nextSteps);
  const [closing, setClosing] = useState(false);
  const [outcome, setOutcome] = useState('resolved');
  const [closeNotes, setCloseNotes] = useState('');
  const [sendToEhr, setSendToEhr] = useState(true);
  const act = (fn, msg) => run(async () => { await fn(); onChange(); }, msg);
  return (
    <Modal title={`${fullName(plan.patient)} · treatment plan`} onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>Close</button>{plan.status !== 'closed' && <button className="btn" onClick={() => setClosing(!closing)}><IconFolderCheck size={16} />Close case</button>}</>}>
      <div className="row wrap gap-6"><Pill tone="outline">Approved by {plan.approvedBy} · {fmtDate(plan.approvedAt)}</Pill>{plan.status === 'closed' ? <Pill tone="good"><IconFolderCheck size={11} />Closed{plan.closingOutcome ? ` · ${plan.closingOutcome}` : ''}</Pill> : plan.nextAppointment ? <Pill tone="good">Next visit {fmtWhen(plan.nextAppointment.start)}</Pill> : <Pill tone="warn">Next visit not booked</Pill>}<Pill tone="outline">{fmtPhone(plan.patient?.phone)}</Pill></div>
      {plan.status === 'closed' && plan.closingNotes && <div className="callout small good">Closing notes: {plan.closingNotes}</div>}
      {closing && plan.status !== 'closed' && (
        <Card soft title="Close this case">
          <Body className="col">
            <div className="small muted">Use this once the recommended treatment is finished or the patient will not be pursuing it further. Sends a summary to the EHR when connected.</div>
            <div className="grid two">
              <Field label="Outcome"><select className="input" value={outcome} onChange={(e) => setOutcome(e.target.value)}><option value="resolved">Resolved</option><option value="referred">Referred elsewhere</option><option value="patient_declined">Patient declined further treatment</option><option value="other">Other</option></select></Field>
              <Field label="Notes"><input className="input" value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} placeholder="e.g. Healed well, no further treatment needed" /></Field>
            </div>
            <label className="check small"><input type="checkbox" checked={sendToEhr} onChange={(e) => setSendToEhr(e.target.checked)} />Send this case to the clinic's EHR</label>
            <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={() => act(async () => { await post(`/api/treatment-plans/${plan.id}/close`, { outcome, notes: closeNotes, sendToEhr }); setClosing(false); }, 'Case closed')}><IconFolderCheck size={16} />Confirm close</button>
          </Body>
        </Card>
      )}

      <Card soft title="Recommendations">
        <table className="table">
          <thead><tr><th>Procedure</th><th>Tooth</th><th>Priority</th><th>Status</th><th>Est.</th><th /></tr></thead>
          <tbody>
            {plan.items.map((i) => (
              <tr key={i.id}>
                <td className="small strong">{i.procedure}{i.note && <div className="tiny muted" style={{ fontWeight: 400 }}>{i.note}</div>}</td>
                <td className="mono" title="FDI tooth number">{i.tooth || '—'}</td>
                <td><Pill status={i.priority}>{i.priority}</Pill></td>
                <td><select className="input" style={{ padding: '3px 8px', width: 130 }} value={i.status} onChange={(e) => act(() => patch(`/api/treatment-plans/${plan.id}/items/${i.id}`, { status: e.target.value }))}>{['recommended', 'accepted', 'declined', 'scheduled', 'completed'].map((s) => <option key={s} value={s}>{s}</option>)}</select></td>
                <td className="small">{fmtMoney(i.estCost)}</td>
                <td><button className="btn sm ghost icon" onClick={() => act(() => del(`/api/treatment-plans/${plan.id}/items/${i.id}`), 'Removed')}><IconTrash size={14} /></button></td>
              </tr>
            ))}
            <tr><td><input className="input" placeholder="Add procedure" value={item.procedure} onChange={(e) => setItem({ ...item, procedure: e.target.value })} /></td><td><input className="input" style={{ width: 60 }} placeholder="FDI" value={item.tooth} onChange={(e) => setItem({ ...item, tooth: e.target.value })} /></td><td><select className="input" value={item.priority} onChange={(e) => setItem({ ...item, priority: e.target.value })}><option value="high">high</option><option value="recommended">recommended</option><option value="elective">elective</option></select></td><td /><td><input className="input" style={{ width: 90 }} placeholder="₹" value={item.estCost} onChange={(e) => setItem({ ...item, estCost: e.target.value })} /></td><td><button className="btn sm" disabled={!item.procedure} onClick={() => act(async () => { await post(`/api/treatment-plans/${plan.id}/items`, item); setItem({ procedure: '', tooth: '', priority: 'recommended', estCost: '' }); }, 'Added')}><IconPlus size={14} /></button></td></tr>
          </tbody>
        </table>
      </Card>

      <div className="grid two">
        <Card soft title="Patient questions">
          <Body className="col">
            {plan.patientQuestions.map((qq) => (
              <div key={qq.id} className="col gap-4">
                <div className="small strong">“{qq.question}”<span className="tiny faint"> · {ago(qq.at)}</span></div>
                {qq.answer ? <div className="small muted">{qq.answer} <span className="tiny faint">— {qq.answeredBy}</span></div> : <div className="row"><input className="input" placeholder="Answer…" value={answer[qq.id] || ''} onChange={(e) => setAnswer({ ...answer, [qq.id]: e.target.value })} /><button className="btn sm" disabled={!answer[qq.id]} onClick={() => act(() => patch(`/api/treatment-plans/${plan.id}/questions/${qq.id}`, { answer: answer[qq.id] }), 'Answer recorded')}>Save</button></div>}
              </div>
            ))}
            {plan.patientQuestions.length === 0 && <div className="tiny muted">No questions recorded.</div>}
            <div className="row"><input className="input" placeholder="Record a question the patient asked" value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn sm" disabled={!q} onClick={() => act(async () => { await post(`/api/treatment-plans/${plan.id}/questions`, { question: q }); setQ(''); }, 'Question added')}>Add</button></div>
          </Body>
        </Card>
        <Card soft title="Next steps & follow-ups">
          <Body className="col">
            <textarea className="input" value={nextSteps} onChange={(e) => setNextSteps(e.target.value)} onBlur={() => nextSteps !== plan.nextSteps && act(() => patch(`/api/treatment-plans/${plan.id}`, { nextSteps }), 'Next steps saved')} placeholder="Next steps" />
            <div className="col gap-4">{plan.followUps.map((f, i) => <div key={i} className="small"><span className="muted">{fmtDate(f.at)} · {f.by}:</span> {f.note}</div>)}</div>
            <div className="row"><input className="input" placeholder="Log a call or note" value={note} onChange={(e) => setNote(e.target.value)} /><button className="btn sm" disabled={!note} onClick={() => act(async () => { await post(`/api/treatment-plans/${plan.id}/follow-ups`, { note }); setNote(''); }, 'Follow-up logged')}><IconPhoneCall size={14} /></button></div>
          </Body>
        </Card>
      </div>

      {!plan.nextVisitScheduled && plan.openItems.length > 0 && (
        <div className="row wrap gap-6">
          <button className="btn primary" onClick={() => setScheduling(!scheduling)}><IconCalendarPlus size={16} />Book next visit</button>
          <button className="btn" disabled={busy} onClick={() => act(() => post(`/api/treatment-plans/${plan.id}/nudge`), 'Follow-up message sent')}><IconSend size={16} />Send follow-up message</button>
        </div>
      )}
      {scheduling && (
        <Card soft><Body className="col">
          <Field label="Visit type"><select className="input" value={visitTypeId} onChange={(e) => { setVisitTypeId(e.target.value); setSlot(null); }}>{settings.visitTypes.map((v) => <option key={v.id} value={v.id}>{v.name} · {v.durationMin} min</option>)}</select></Field>
          <SlotPicker visitTypeId={visitTypeId} providerId={settings.providers.find((p) => p.id === plan.providerId)?.role === 'Dentist' ? plan.providerId : ''} value={slot} onPick={setSlot} />
          <div><button className="btn primary" disabled={!slot || busy} onClick={() => act(async () => { await post(`/api/treatment-plans/${plan.id}/schedule`, { visitTypeId, start: slot.start, providerId: slot.providerId, locationId: slot.locationId, markScheduled: true }); setScheduling(false); }, 'Next visit booked')}><IconCheck size={16} />Book {slot ? fmtWhen(slot.start) : ''}</button></div>
        </Body></Card>
      )}
    </Modal>
  );
}

function CreatePlan({ settings, onClose, onDone }) {
  const [patient, setPatient] = useState(null);
  const [providerId, setProviderId] = useState(settings.providers.find((p) => p.role === 'Dentist')?.id || '');
  const [items, setItems] = useState([{ procedure: '', tooth: '', priority: 'recommended', estCost: '' }]);
  const [nextSteps, setNextSteps] = useState('');
  const [run, busy] = useAction();
  return (
    <Modal title="Record a treatment plan" onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !patient || !items.some((i) => i.procedure)} onClick={() => run(async () => { await post('/api/treatment-plans', { patientId: patient.id, providerId, items: items.filter((i) => i.procedure), nextSteps }); onDone(); }, 'Plan recorded')}>Save plan</button></>}>
      <Field label="Patient"><PatientPicker value={patient} onChange={setPatient} autoFocus /></Field>
      <Field label="Approving dentist"><select className="input" value={providerId} onChange={(e) => setProviderId(e.target.value)}>{settings.providers.filter((p) => p.role === 'Dentist').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <Field label="Recommendations">
        <div className="col gap-6">{items.map((it, idx) => (
          <div className="row" key={idx}><input className="input grow" placeholder="Procedure" value={it.procedure} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, procedure: e.target.value } : x))} /><input className="input" style={{ width: 70 }} placeholder="Tooth" value={it.tooth} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, tooth: e.target.value } : x))} /><select className="input" style={{ width: 140 }} value={it.priority} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, priority: e.target.value } : x))}><option value="high">High</option><option value="recommended">Recommended</option><option value="elective">Elective</option></select><input className="input" style={{ width: 100 }} placeholder="Est. ₹" value={it.estCost} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, estCost: e.target.value } : x))} /></div>
        ))}<button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setItems([...items, { procedure: '', tooth: '', priority: 'recommended', estCost: '' }])}><IconPlus size={14} />Add another</button></div>
      </Field>
      <Field label="Next steps"><textarea className="input" value={nextSteps} onChange={(e) => setNextSteps(e.target.value)} /></Field>
    </Modal>
  );
}
