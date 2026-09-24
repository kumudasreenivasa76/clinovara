import React, { useState } from 'react';
import { IconArmchair, IconCheck, IconPlayerPlay, IconClipboardText, IconDental, IconAlertTriangle, IconPill, IconHeartbeat } from '@tabler/icons-react';
import { get, post, patch } from '../lib/api.js';
import { fmtTime, fullName, minutesSince, fmtMoney, fmtDate } from '../lib/format.js';
import { Card, Body, Pill, Avatar, Empty, usePoll, useAction, Stat, Modal, Seg } from '../components/ui.jsx';

/** The dentist's worklist for today: who is waiting, what they filled in, what was planned, and one-tap call / done. */
export default function MyDay({ branch, locations }) {
  const settings = usePoll(() => get('/api/settings'), []);
  const [providerId, setProviderId] = useState(() => { try { return localStorage.getItem('clinovara.provider') || ''; } catch { return ''; } });
  const { data, reload } = usePoll(() => get(`/api/arrivals${branch ? `?locationId=${branch}` : ''}`), [branch], 5000);
  const plans = usePoll(() => get('/api/treatment-plans'), [], 15000);
  const [run] = useAction();
  const [open, setOpen] = useState(null);
  const providers = (settings.data?.providers || []).filter((p) => !branch || !p.locationIds?.length || p.locationIds.includes(branch));
  const pid = providerId || providers[0]?.id || '';
  const rows = (data?.board || []).filter((r) => r.appointment.providerId === pid);
  const now = Date.now();
  const act = (fn, msg) => run(async () => { await fn(); reload(); }, msg);
  const waiting = rows.filter((r) => r.visit && ['ready', 'arrived', 'checking_in', 'needs_attention'].includes(r.stage));
  const current = rows.find((r) => r.visit && ['called', 'brought_back'].includes(r.stage));
  const doneCount = rows.filter((r) => r.stage === 'done').length;
  const collected = rows.filter((r) => r.appointment.paymentStatus === 'paid').reduce((s, r) => s + (r.appointment.paidAmount || 0), 0);

  return (
    <>
      <div className="page-head">
        <div><h1>Dentist's day</h1><p>Today's patients for one dentist: who is ready, what they told us before the visit, and what was planned last time.</p></div>
        <select className="input" style={{ width: 260 }} value={pid} onChange={(e) => { setProviderId(e.target.value); try { localStorage.setItem('clinovara.provider', e.target.value); } catch { /* ignore */ } }}>{providers.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.specialty || p.role}</option>)}</select>
      </div>
      <div className="grid four mb-16">
        <Stat value={rows.length} label="Patients today" />
        <Stat value={waiting.length} label="Waiting" tone={waiting.length ? 'warn' : ''} hint={waiting[0] ? `Next: ${waiting[0].visit.token} · ${fullName(waiting[0].patient)}` : ''} />
        <Stat value={doneCount} label="Completed" tone="good" />
        <Stat value={fmtMoney(collected)} label="Collected today" />
      </div>
      <div className="grid side">
        <Card title="Worklist" actions={<button className="btn sm primary" disabled={!waiting.length} onClick={() => act(() => post('/api/arrivals/call-next', { providerId: pid, locationId: branch || undefined }), 'Next patient called')}><IconPlayerPlay size={14} />Call next</button>}>
          <div className="list">
            {rows.map((r) => {
              const plan = (plans.data || []).find((t) => t.patientId === r.patient?.id && t.openItems?.length);
              return (
                <div className={`list-item ${r === current ? 'active' : ''}`} key={r.appointment.id} style={{ cursor: 'pointer' }} onClick={() => setOpen(r)}>
                  <div className="mono strong" style={{ width: 44 }}>{r.visit?.token || fmtTime(r.appointment.start)}</div>
                  <Avatar patient={r.patient} />
                  <div className="grow">
                    <div className="row gap-6"><span className="strong">{fullName(r.patient)}</span><Pill status={r.stage} />{r.appointment.source === 'ai' && <Pill tone="accent">AI booked</Pill>}</div>
                    <div className="tiny muted">{r.visitType?.name} · {fmtTime(r.appointment.start)}{r.appointment.notes ? ` · ${r.appointment.notes}` : ''}{r.visit && r.stage !== 'done' ? ` · waiting ${minutesSince(r.visit.arrivedAt, now)} min` : ''}</div>
                    <div className="row gap-6 mt-8" style={{ marginTop: 4 }}>
                      {r.packet?.status === 'complete' ? <Pill tone="good"><IconClipboardText size={11} />Forms done</Pill> : <Pill tone="warn"><IconClipboardText size={11} />Forms {r.packet?.status || 'missing'}</Pill>}
                      {plan && <Pill tone="violet"><IconDental size={11} />Open plan: {plan.openItems.map((i) => i.procedure).join(', ').slice(0, 40)}</Pill>}
                    </div>
                  </div>
                  <div className="row gap-6" onClick={(e) => e.stopPropagation()}>
                    {r.visit && ['ready', 'arrived', 'checking_in', 'needs_attention'].includes(r.stage) && <button className="btn sm" onClick={() => act(() => patch(`/api/arrivals/visits/${r.visit.id}`, { status: 'called' }), `Called ${r.visit.token}`)}>Call</button>}
                    {r.stage === 'called' && <button className="btn sm primary" onClick={() => act(() => patch(`/api/arrivals/visits/${r.visit.id}`, { status: 'brought_back' }), 'In chair')}><IconArmchair size={14} />In chair</button>}
                    {r.stage === 'brought_back' && <button className="btn sm primary" onClick={() => act(() => patch(`/api/arrivals/visits/${r.visit.id}`, { status: 'done' }), 'Visit completed')}><IconCheck size={14} />Done</button>}
                  </div>
                </div>
              );
            })}
            {rows.length === 0 && <Empty>No patients today for this dentist.</Empty>}
          </div>
        </Card>
        <Card title="Alerts from pre-visit forms">
          <div className="list">
            {rows.filter((r) => r.stage !== 'done').map((r) => <FormAlerts key={r.appointment.id} row={r} />)}
          </div>
        </Card>
      </div>
      {open && <ChartCard row={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function useAlerts(row) {
  const [pk, setPk] = useState(null);
  React.useEffect(() => { if (row.packet?.id) get('/api/forms').then((all) => setPk(all.find((x) => x.id === row.packet.id) || null)).catch(() => {}); }, [row.packet?.id]);
  if (!pk) return { pk: null, alerts: [] };
  const alerts = [];
  const m = pk.sections.medicalHistory?.data || {}; const meds = pk.sections.medications?.data || {}; const al = pk.sections.allergies?.data || {};
  for (const c of m.conditions || []) alerts.push({ icon: IconHeartbeat, text: c, tone: /heart|bleeding|diabetes|epilepsy/i.test(c) ? 'bad' : 'warn' });
  if (meds.bloodThinners === 'yes') alerts.push({ icon: IconPill, text: 'On blood thinners', tone: 'bad' });
  if (al.list && !/^none$/i.test(al.list.trim())) alerts.push({ icon: IconAlertTriangle, text: `Allergy: ${al.list}`, tone: 'bad' });
  if (al.latex === 'yes') alerts.push({ icon: IconAlertTriangle, text: 'Latex allergy', tone: 'bad' });
  if (m.pregnant === 'yes') alerts.push({ icon: IconHeartbeat, text: 'Pregnant or nursing', tone: 'warn' });
  if (m.smoker && m.smoker !== 'no') alerts.push({ icon: IconHeartbeat, text: `Tobacco: ${m.smoker}`, tone: '' });
  const dc = pk.sections.dentalConcerns?.data || {};
  if (dc.anxiety === 'very') alerts.push({ icon: IconAlertTriangle, text: 'Very anxious about dental visits', tone: 'warn' });
  return { pk, alerts };
}

function FormAlerts({ row }) {
  const { pk, alerts } = useAlerts(row);
  if (!pk) return null;
  const dc = pk.sections.dentalConcerns?.data || {};
  return (
    <div className="list-item start">
      <div className="mono strong" style={{ width: 44 }}>{row.visit?.token || fmtTime(row.appointment.start)}</div>
      <div className="grow">
        <div className="small strong">{fullName(row.patient)}</div>
        {dc.concerns && <div className="small muted">“{dc.concerns}”</div>}
        <div className="tag-list mt-8" style={{ marginTop: 4 }}>{alerts.map((a, i) => <span key={i} className={`pill ${a.tone}`}><a.icon size={11} />{a.text}</span>)}{alerts.length === 0 && <span className="tiny faint">No medical alerts</span>}</div>
      </div>
    </div>
  );
}

function ChartCard({ row, onClose }) {
  const { pk, alerts } = useAlerts(row);
  const [p, setP] = useState(null);
  React.useEffect(() => { get(`/api/patients/${row.patient.id}`).then(setP).catch(() => {}); }, [row.patient.id]);
  const sec = (k) => pk?.sections?.[k]?.data || {};
  return (
    <Modal title={`${row.visit?.token ? row.visit.token + ' · ' : ''}${fullName(row.patient)}`} onClose={onClose} wide footer={<button className="btn" onClick={onClose}>Close</button>}>
      <div className="row wrap gap-6"><Pill status={row.stage} /><Pill tone="outline">{row.visitType?.name} · {fmtTime(row.appointment.start)}</Pill><Pill tone="outline">{row.patient.dob}{row.patient.gender ? ` · ${row.patient.gender}` : ''}</Pill>{row.patient.abhaNumber && <Pill tone="accent">ABHA on file</Pill>}{row.appointment.fee ? <Pill status={row.appointment.paymentStatus || 'unpaid'}>{fmtMoney(row.appointment.fee)} · {row.appointment.paymentStatus || 'unpaid'}</Pill> : null}</div>
      {alerts.length > 0 && <div className="callout bad"><div className="tag-list">{alerts.map((a, i) => <span key={i} className={`pill ${a.tone}`}><a.icon size={11} />{a.text}</span>)}</div></div>}
      <div className="grid two">
        <Card soft title="Patient reported"><Body className="col gap-6 small">
          <div><span className="muted">Concern:</span> {sec('dentalConcerns').concerns || '—'}</div>
          <div><span className="muted">Last cleaning:</span> {sec('dentalConcerns').lastCleaning || '—'} · <span className="muted">Anxiety:</span> {sec('dentalConcerns').anxiety || '—'} · <span className="muted">Bleeding gums:</span> {sec('dentalConcerns').bleedingGums || '—'}</div>
          <div><span className="muted">Conditions:</span> {(sec('medicalHistory').conditions || []).join(', ') || 'None reported'}</div>
          <div><span className="muted">Surgeries:</span> {sec('medicalHistory').surgeries || '—'}</div>
          <div><span className="muted">Medicines:</span> {sec('medications').list || '—'}</div>
          <div><span className="muted">Allergies:</span> {sec('allergies').list || '—'}{sec('allergies').latex === 'yes' ? ' · latex' : ''}</div>
          <div><span className="muted">Notes:</span> {sec('medicalHistory').notes || '—'}</div>
          {!pk && <div className="tiny faint">Pre-visit form not filled.</div>}
        </Body></Card>
        <Card soft title="History & plans"><Body className="col gap-6 small">
          {p ? <>
            <div><span className="muted">Last visit:</span> {p.lastVisit ? fmtDate(p.lastVisit) : 'First visit'} · <span className="muted">Visits:</span> {p.appointments.filter((a) => a.status === 'completed').length}</div>
            {p.treatmentPlans.map((tp) => <div key={tp.id}><div className="muted">Plan by {tp.approvedBy} · {fmtDate(tp.createdAt)}</div>{tp.items.map((i) => <div key={i.id} className="row gap-6"><Pill status={i.status} />{i.procedure}{i.tooth ? ` (#${i.tooth})` : ''}{i.estCost ? <span className="muted">{fmtMoney(i.estCost)}</span> : null}</div>)}{tp.patientQuestions.filter((q) => !q.answer).map((q) => <div key={q.id} className="tiny" style={{ color: 'var(--warn)' }}>Open question: “{q.question}”</div>)}</div>)}
            {p.treatmentPlans.length === 0 && <div className="faint">No treatment plans on file.</div>}
            {p.notes && <div><span className="muted">Notes:</span> {p.notes}</div>}
          </> : <div className="skeleton" />}
        </Body></Card>
      </div>
      <a className="btn sm ghost" style={{ alignSelf: 'flex-start' }} href="#/treatment">Record a treatment plan for this visit</a>
    </Modal>
  );
}
