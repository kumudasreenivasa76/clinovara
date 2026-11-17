import React, { useMemo, useState } from 'react';
import { IconDownload, IconPrinter, IconSend, IconFileText, IconCheck, IconPlus } from '@tabler/icons-react';
import { get, post, downloadFile } from '../lib/api.js';
import { fmtWhen, fmtDate, fmtMoney, fmtPhone } from '../lib/format.js';
import { RxBuilder } from './DoctorTools2.jsx';
import { Card, Body, Pill, Empty, usePoll, useAction, Seg, Modal, Field, useToast } from '../components/ui.jsx';

const q = (providerId) => (providerId ? `&providerId=${providerId}` : '');
const STATUS_TONE = { Booked: 'outline', Confirmed: 'info', Completed: 'success', 'No-show': 'danger', Cancelled: 'muted' };
const FORM_WORD = { complete: 'Complete', partial: 'Part-filled', sent: 'Sent, not started', created: 'Not sent', none: 'No form' };

/** Appointment tracker: every visit of this dentist, with confirmation, forms, payment and what happened. */
export function Appointments({ providerId, onOpen }) {
  const [range, setRange] = useState('upcoming');
  const [text, setText] = useState('');
  const { data } = usePoll(() => get(`/api/doctor/appointments?days=90&ahead=60${q(providerId)}`), [providerId], 8000);
  const [open, setOpen] = useState(null);
  const rows = useMemo(() => {
    if (!data) return [];
    const now = new Date().toISOString();
    let list = data.appointments;
    if (range === 'upcoming') list = list.filter((a) => a.start > now && ['scheduled', 'confirmed'].includes(a.status)).reverse();
    else if (range === 'today') list = list.filter((a) => a.start.slice(0, 10) === now.slice(0, 10)).reverse();
    else if (range === 'completed') list = list.filter((a) => a.status === 'completed');
    else if (range === 'missed') list = list.filter((a) => ['no_show', 'cancelled'].includes(a.status));
    const t = text.trim().toLowerCase();
    return t ? list.filter((a) => a.patient.toLowerCase().includes(t) || a.visitType.toLowerCase().includes(t)) : list;
  }, [data, range, text]);
  if (!data) return <div className="skeleton" />;
  const c = data.counts;
  return (
    <>
      <div className="grid four mb-16">
        {[['Coming up', c.upcoming, 'Booked visits ahead'], ['Not yet confirmed', c.unconfirmed, 'Patient has not replied to the reminder'], ['Forms missing', c.formsMissing, 'Upcoming patients whose pre-visit form is not complete'], ['Missed', c.noShow + c.cancelled, `${c.noShow} no-show, ${c.cancelled} cancelled (90 days)`]].map(([l, v, h]) => (
          <Card key={l}><Body><div className="tiny muted">{l}</div><div className="mono" style={{ fontSize: 24, margin: '4px 0' }}>{v}</div><div className="tiny faint">{h}</div></Body></Card>
        ))}
      </div>
      <div className="row between wrap mb-16">
        <Seg value={range} onChange={setRange} options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'today', label: 'Today' }, { value: 'completed', label: 'Completed' }, { value: 'missed', label: 'Missed / cancelled' }, { value: 'all', label: 'All' }]} />
        <input className="input" style={{ maxWidth: 260 }} placeholder="Search patient or visit type" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <Card>
        {rows.length === 0 ? <Body><Empty>No appointments here.</Empty></Body> : (
          <table className="table">
            <thead><tr><th>When</th><th>Patient</th><th>Visit</th><th>Status</th><th>Form</th><th>Fee</th><th /></tr></thead>
            <tbody>{rows.map((a) => (
              <React.Fragment key={a.id}>
                <tr style={{ cursor: 'pointer' }} onClick={() => setOpen(open === a.id ? null : a.id)}>
                  <td className="mono small">{fmtWhen(a.start)}</td>
                  <td><div className="small strong">{a.patient}</div><div className="tiny muted">{fmtPhone(a.phone)}{a.token ? ` · token ${a.token}` : ''}</div></td>
                  <td className="small">{a.visitType}<div className="tiny muted">{a.location}</div></td>
                  <td><Pill tone={STATUS_TONE[a.stage] || 'outline'}>{a.stage}</Pill></td>
                  <td className="small">{a.start > new Date().toISOString() || a.forms !== 'none' ? FORM_WORD[a.forms] : '—'}</td>
                  <td className="small mono">{a.paymentStatus === 'paid' ? <>{fmtMoney(a.paid)} <span className="tiny muted">paid</span></> : a.fee ? <>{fmtMoney(a.fee)} <span className="tiny muted">{a.status === 'completed' ? 'unpaid' : 'due'}</span></> : '—'}</td>
                  <td><button className="btn sm ghost" onClick={(e) => { e.stopPropagation(); onOpen(a.patientId); }}>Chart</button></td>
                </tr>
                {open === a.id && (
                  <tr><td colSpan={7} style={{ background: 'var(--surface-2)' }}>
                    <div className="row gap-16 wrap small">
                      {a.timeline.map((t) => <span key={t.label}><IconCheck size={12} /> <b>{t.label}</b> <span className="muted">{fmtWhen(t.at)}</span></span>)}
                      {a.cancelReason && <span className="muted">Reason: {a.cancelReason}</span>}
                      <span className="muted">Booked via {a.source}</span>
                    </div>
                  </td></tr>
                )}
              </React.Fragment>
            ))}</tbody>
          </table>
        )}
      </Card>
    </>
  );
}

/** What this dentist has earned: collected fees, their share, what is still unpaid and what is in the pipeline. */
export function Earnings({ providerId }) {
  const [days, setDays] = useState(30);
  const { data } = usePoll(() => get(`/api/doctor/earnings?days=${days}${q(providerId)}`), [providerId, days], 10000);
  if (!data) return <div className="skeleton" />;
  const max = Math.max(1, ...data.byDay.map((d) => d.amount));
  const tiles = [
    ['You earned', fmtMoney(data.earned), data.sharePct === 100 ? `All fees collected in this period` : `${data.sharePct}% of ${fmtMoney(data.gross)} collected; clinic keeps ${fmtMoney(data.clinicShare)}`],
    ['Collected today', fmtMoney(data.todayGross), 'Gross fees paid today'],
    ['Collected this month', fmtMoney(data.monthGross), 'Gross fees paid this calendar month'],
    ['Waiting to be paid', fmtMoney(data.pendingAmount), `${data.pendingCount} finished visit${data.pendingCount === 1 ? '' : 's'} not yet paid`],
    ['Average per paid visit', fmtMoney(data.avgPerVisit), `${data.visitsPaid} paid visits`],
    ['Treatment still to do', fmtMoney(data.pipeline), 'Recommended or accepted, not yet done'],
  ];
  return (
    <>
      <div className="row between wrap mb-16">
        <div className="small muted">Only you and the clinic owner see this. Your share is set by the owner in Settings → Visit types &amp; dentists.</div>
        <div className="row"><Seg value={days} onChange={setDays} options={[{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }, { value: 365, label: 'Year' }]} />
          <button className="btn" onClick={() => downloadFile(`/api/doctor/earnings.csv?days=${days}${q(providerId)}`, 'my-earnings.csv')}><IconDownload size={16} />Export CSV</button></div>
      </div>
      <div className="grid three">{tiles.map(([l, v, h]) => <Card key={l}><Body><div className="tiny muted">{l}</div><div className="mono" style={{ fontSize: 26, margin: '4px 0' }}>{v}</div><div className="tiny faint">{h}</div></Body></Card>)}</div>
      <Card className="mt-16" title="Collected per day">
        <Body>
          {data.byDay.length === 0 ? <Empty>No payments recorded in this period.</Empty> : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 150, overflowX: 'auto' }}>
              {data.byDay.map((d) => <div key={d.date} title={`${fmtDate(d.date)}: ${fmtMoney(d.amount)}`} style={{ flex: '1 0 18px', maxWidth: 40, background: 'var(--accent)', borderRadius: '3px 3px 0 0', height: `${Math.max(4, (d.amount / max) * 100)}%`, opacity: 0.85 }} />)}
            </div>
          )}
        </Body>
      </Card>
      <div className="grid two mt-16">
        <Card title="By visit type"><table className="table"><thead><tr><th>Visit</th><th>Visits</th><th>Collected</th><th>Your share</th></tr></thead><tbody>{data.byType.map((t) => <tr key={t.name}><td className="small">{t.name}</td><td className="mono small">{t.count}</td><td className="mono small">{fmtMoney(t.gross)}</td><td className="mono small">{fmtMoney(t.earned)}</td></tr>)}</tbody></table>{data.byType.length === 0 && <Body><Empty>Nothing yet.</Empty></Body>}</Card>
        <Card title="Finished but not paid"><div className="list">{data.pending.map((p) => <div className="list-item" key={p.id}><div className="grow small">{p.patient}<div className="tiny muted">{fmtWhen(p.start)}</div></div><span className="mono small">{fmtMoney(p.fee)}</span></div>)}{data.pending.length === 0 && <Body><Empty>All finished visits are paid.</Empty></Body>}</div></Card>
      </div>
      {data.byMode.length > 0 && <Card className="mt-16" title="How patients paid"><Body className="row wrap gap-6">{data.byMode.map((m) => <Pill key={m.mode} tone="outline">{m.mode} · {fmtMoney(m.amount)}</Pill>)}</Body></Card>}
    </>
  );
}

const printText = (title, text) => {
  const w = window.open('', '_blank', 'width=760,height=900'); if (!w) return;
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  w.document.write(`<title>${title}</title><body style="font:15px/1.6 Georgia,serif;padding:48px;white-space:pre-wrap">${esc}</body>`); w.document.close(); w.focus(); w.print();
};

/** Pre-visit forms status plus the dentist's own documents (prescription, certificate, referral, consent, estimate). */
export function FormsAndDocs({ providerId }) {
  const [view, setView] = useState('forms');
  const forms = usePoll(() => get(`/api/doctor/forms?x=1${q(providerId)}`), [providerId], 10000);
  const docs = usePoll(() => get(`/api/doctor/documents?x=1${q(providerId)}`), [providerId], 0);
  const patients = usePoll(() => get(`/api/doctor/patients?x=1${q(providerId)}`), [providerId], 0);
  const [peek, setPeek] = useState(null);
  const [draft, setDraft] = useState(null);
  const [run, busy] = useAction();
  const toast = useToast();
  const [kind, setKind] = useState('prescription');
  const [rxFor, setRxFor] = useState(false);
  const [patientId, setPatientId] = useState('');
  const start = async (pid = patientId, k = kind) => { if (!pid) return; const t = await get(`/api/doctor/documents/template?kind=${k}&patientId=${pid}${q(providerId)}`); setDraft({ patientId: pid, kind: k, text: t.text }); };
  const save = (send) => run(async () => { await post('/api/doctor/documents', { providerId, patientId: draft.patientId, kind: draft.kind, text: draft.text, send }); setDraft(null); docs.reload(); }, send ? 'Saved and sent to the patient' : 'Saved to the patient file');
  return (
    <>
      <div className="mb-16"><Seg value={view} onChange={setView} options={[{ value: 'forms', label: 'Patient forms' }, { value: 'docs', label: 'Prescriptions & letters' }]} /></div>
      {view === 'forms' && (
        <Card>
          {!forms.data ? <Body><div className="skeleton" /></Body> : forms.data.forms.length === 0 ? <Body><Empty>No recent or upcoming visits.</Empty></Body> : (
            <table className="table"><thead><tr><th>Visit</th><th>Patient</th><th>Pre-visit form</th><th /></tr></thead>
              <tbody>{forms.data.forms.map((f) => {
                const done = f.sections.filter((s) => s.complete).length;
                return (
                  <tr key={f.appointmentId}>
                    <td className="mono small">{fmtWhen(f.start)}</td><td className="small strong">{f.patient}</td>
                    <td><Pill tone={f.status === 'complete' ? 'success' : f.status === 'none' ? 'muted' : 'warn'}>{FORM_WORD[f.status]}</Pill> <span className="tiny muted">{done}/{f.sections.length} sections</span></td>
                    <td className="row gap-6"><button className="btn sm" onClick={() => setPeek(f)}>View answers</button><button className="btn sm ghost" onClick={() => { setView('docs'); setPatientId(f.patientId); }}>Write document</button></td>
                  </tr>
                );
              })}</tbody></table>
          )}
        </Card>
      )}
      {view === 'docs' && (
        <>
          <Card title="Write a document"><Body className="row wrap gap-6" style={{ alignItems: 'flex-end' }}>
            <Field label="Patient"><select className="input" style={{ minWidth: 220 }} value={patientId} onChange={(e) => setPatientId(e.target.value)}><option value="">Choose a patient</option>{(patients.data || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label="Document"><select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>{(docs.data?.kinds || []).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select></Field>
            <button className="btn primary" disabled={!patientId} onClick={() => start()}><IconPlus size={16} />Start</button>
            <button className="btn" disabled={!patientId} onClick={() => setRxFor(true)}>Prescription with safety check</button>
          </Body></Card>
          <Card className="mt-16" title="Issued by you">
            <div className="list">{(docs.data?.documents || []).map((d) => <div className="list-item" key={d.id}><IconFileText size={16} className="muted" /><div className="grow small"><b>{d.title}</b> · {d.patient}<div className="tiny muted">{fmtWhen(d.createdAt)}{d.sentAt ? ' · sent to patient' : ''}</div></div><button className="btn sm ghost" onClick={() => printText(d.title, d.text)}><IconPrinter size={14} />Print</button></div>)}
              {docs.data && docs.data.documents.length === 0 && <Body><Empty>Nothing issued yet.</Empty></Body>}</div>
          </Card>
        </>
      )}
      {rxFor && patientId && <RxBuilder patientId={patientId} providerId={providerId} onClose={() => setRxFor(false)} onDone={docs.reload} />}
      {peek && (
        <Modal title={`${peek.patient} — pre-visit form`} onClose={() => setPeek(null)} wide footer={<button className="btn" onClick={() => setPeek(null)}>Close</button>}>
          <div className="col gap-8">{peek.sections.map((s) => (
            <div key={s.key} className="card soft" style={{ padding: 10 }}><div className="small strong">{s.label} {s.complete ? <Pill tone="success">done</Pill> : <Pill tone="muted">not done</Pill>}</div>
              {Object.entries(s.data).filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length)).map(([k, v]) => <div className="tiny" key={k}><span className="muted">{k.replace(/([A-Z])/g, ' $1').toLowerCase()}:</span> {Array.isArray(v) ? v.join(', ') : String(v)}</div>)}</div>
          ))}</div>
        </Modal>
      )}
      {draft && (
        <Modal title={(docs.data?.kinds || []).find((k) => k.id === draft.kind)?.name || 'Document'} onClose={() => setDraft(null)} wide
          footer={<><button className="btn" onClick={() => printText('Document', draft.text)}><IconPrinter size={16} />Print</button><button className="btn" disabled={busy} onClick={() => save(false)}>Save to file</button><button className="btn primary" disabled={busy} onClick={() => save(true)}><IconSend size={16} />Save &amp; send to patient</button></>}>
          <div className="small muted mb-8">Edit anything before it is saved. Sending delivers the text in the patient's usual channel.</div>
          <textarea className="input" style={{ minHeight: 380, fontFamily: 'Georgia, serif' }} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
        </Modal>
      )}
    </>
  );
}
