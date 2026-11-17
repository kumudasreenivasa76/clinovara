import React, { useEffect, useState } from 'react';
import { IconSearch, IconPlus, IconUpload, IconDownload, IconId, IconUsers, IconCalendarPlus, IconMessage, IconPencil, IconCheck } from '@tabler/icons-react';
import { get, post, patch } from '../lib/api.js';
import { fmtWhen, fmtDate, fullName, fmtPhone, fmtMoney, ago, LANG_NAME } from '../lib/format.js';
import { Card, Body, Pill, Avatar, Empty, usePoll, useAction, Modal, Field, Stat, Seg } from '../components/ui.jsx';
import { navigate } from '../App.jsx';

const HEARD = ['Google search', 'Google Maps', 'Friend or family', 'Instagram or Facebook', 'Walked past', 'Doctor referral', 'Other'];
export default function Patients({ hash, branch, locations }) {
  const params = new URLSearchParams(hash.split('?')[1] || '');
  const [q, setQ] = useState('');
  const { data, reload } = usePoll(() => get(`/api/patients?q=${encodeURIComponent(q)}${branch ? `&locationId=${branch}` : ''}`), [q, branch], 0);
  const settings = usePoll(() => get('/api/settings'), []);
  const [open, setOpen] = useState(params.get('id') || null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const list = data || [];
  return (
    <>
      <div className="page-head">
        <div><h1>Patients</h1><p>Everyone on file{branch ? ' at this branch' : ''}, with ABHA, insurance or scheme, language, and family links. Import from your existing PMS or EHR with a CSV.</p></div>
        <div className="row"><a className="btn" href="/api/patients/export.csv" download><IconDownload size={16} />Export CSV</a><button className="btn" onClick={() => setImporting(true)}><IconUpload size={16} />Import CSV</button><button className="btn primary" onClick={() => setCreating(true)}><IconPlus size={16} />Add patient</button></div>
      </div>
      <div className="grid four mb-16">
        <Stat value={list.length} label="Patients" />
        <Stat value={list.filter((p) => p.abhaNumber).length} label="With ABHA ID" hint="Ayushman Bharat Health Account" tone="accent" />
        <Stat value={list.filter((p) => p.insurance?.type && p.insurance.type !== 'self').length} label="Insurance or scheme on file" />
        <Stat value={list.filter((p) => p.nextRecallDue && p.nextRecallDue < new Date().toISOString().slice(0, 10) && !p.upcoming).length} label="Overdue for recall" tone="warn" />
      </div>
      <Card>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }} className="row"><IconSearch size={16} className="faint" /><input className="input" style={{ padding: '6px 10px' }} placeholder="Search by name, mobile, ABHA, or date of birth" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
        <table className="table">
          <thead><tr><th>Patient</th><th>Mobile</th><th>Branch</th><th>Language</th><th>Insurance / scheme</th><th>ABHA</th><th>Last visit</th><th>Next</th></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => setOpen(p.id)}>
                <td style={{ minWidth: 190 }}><div className="row"><Avatar patient={p} /><div><div className="small strong">{fullName(p)}</div><div className="tiny muted">{p.dob}{p.gender ? ` · ${p.gender}` : ''}{p.family?.length ? ` · family of ${p.family.length + 1}` : ''}</div></div></div></td>
                <td className="small" style={{ whiteSpace: "nowrap" }}>{fmtPhone(p.phone)}</td>
                <td className="small muted">{locations.find((l) => l.id === p.locationId)?.name || '—'}</td>
                <td className="small">{LANG_NAME[p.preferredLanguage] || p.preferredLanguage}</td>
                <td className="small" style={{ minWidth: 130 }}>{p.insurance?.carrier ? <><Pill tone={p.insurance.verified ? 'good' : 'outline'}>{p.insurance.carrier}</Pill></> : <span className="muted">Self-pay</span>}</td>
                <td className="small mono" style={{ whiteSpace: "nowrap" }}>{p.abhaNumber || <span className="faint">—</span>}</td>
                <td className="small muted" style={{ whiteSpace: "nowrap" }}>{p.lastVisit ? fmtDate(p.lastVisit) : '—'}</td>
                <td className="small" style={{ whiteSpace: "nowrap" }}>{p.upcoming ? fmtWhen(p.upcoming.start) : p.nextRecallDue ? <span style={{ color: p.nextRecallDue < new Date().toISOString().slice(0, 10) ? 'var(--warn)' : undefined }}>Recall {fmtDate(p.nextRecallDue)}</span> : '—'}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={8}><Empty icon={<IconUsers size={28} />}>No patients match.</Empty></td></tr>}
          </tbody>
        </table>
      </Card>
      {open && settings.data && <PatientProfile id={open} settings={settings.data} onClose={() => setOpen(null)} onChange={reload} />}
      {creating && settings.data && <PatientForm settings={settings.data} onClose={() => setCreating(false)} onDone={() => { setCreating(false); reload(); }} />}
      {importing && <ImportCsv onClose={() => setImporting(false)} onDone={() => { setImporting(false); reload(); }} />}
    </>
  );
}

const TYPE_LABEL = { private: 'Private / TPA', pmjay: 'PM-JAY', cghs: 'CGHS', esic: 'ESIC', corporate: 'Corporate', self: 'Self-pay' };

function PatientProfile({ id, settings, onClose, onChange }) {
  const [p, setP] = useState(null);
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const load = () => get(`/api/patients/${id}`).then(setP).catch(() => {});
  useEffect(() => { load(); }, [id]); // eslint-disable-line
  if (!p) return null;
  const upcoming = p.appointments.filter((a) => ['scheduled', 'confirmed'].includes(a.status)).sort((a, b) => a.start.localeCompare(b.start));
  return (
    <Modal title={fullName(p)} onClose={onClose} wide footer={<button className="btn" onClick={onClose}>Close</button>}>
      <div className="row wrap gap-6">
        <Pill tone="outline">{p.dob}{p.gender ? ` · ${p.gender}` : ''}</Pill><Pill tone="outline">{fmtPhone(p.phone)}</Pill><Pill tone="outline">{LANG_NAME[p.preferredLanguage] || 'English'}</Pill>
        <Pill tone="outline">{settings.locations.find((l) => l.id === p.locationId)?.name || 'No branch'}</Pill>
        {p.abhaNumber && <Pill tone="accent"><IconId size={12} />ABHA {p.abhaNumber}</Pill>}
        {p.insurance?.type && p.insurance.type !== 'self' && <Pill tone={p.insurance.verified ? 'good' : 'warn'}>{TYPE_LABEL[p.insurance.type]}: {p.insurance.carrier}{p.insurance.verified ? ' · verified' : ''}</Pill>}
        {p.family?.length > 0 && <Pill tone="violet"><IconUsers size={12} />Shares phone with {p.family.map((f) => f.name.split(' ')[0]).join(', ')}</Pill>}
      </div>
      <div className="row gap-6 wrap">
        <button className="btn sm" onClick={() => { onClose(); navigate(`#/schedule?patient=${p.id}`); }}><IconCalendarPlus size={14} />Book</button>
        <button className="btn sm" onClick={() => { onClose(); navigate('#/messages'); }}><IconMessage size={14} />Message</button>
        <button className="btn sm" onClick={() => setEditing(true)}><IconPencil size={14} />Edit details</button>
        <a className="btn sm ghost" href={`/api/fhir/Patient/${p.id}/$everything`} target="_blank" rel="noreferrer">FHIR record</a>
      </div>
      <Seg value={tab} onChange={setTab} options={[{ value: 'overview', label: 'Overview' }, { value: 'appointments', label: `Visits (${p.appointments.length})` }, { value: 'plans', label: `Treatment (${p.treatmentPlans.length})` }, { value: 'forms', label: `Forms (${p.packets.length})` }, { value: 'messages', label: `Messages (${p.communications.length})` }]} />
      {tab === 'overview' && (
        <div className="grid two">
          <Card soft><Body className="col gap-6 small">
            <div className="row between"><span className="muted">Next appointment</span><b>{upcoming[0] ? fmtWhen(upcoming[0].start) : 'None'}</b></div>
            <div className="row between"><span className="muted">Last visit</span><b>{p.lastVisit ? fmtDate(p.lastVisit) : '—'}</b></div>
            <div className="row between"><span className="muted">Recall due</span><b>{p.nextRecallDue ? fmtDate(p.nextRecallDue) : '—'}</b></div>
            <div className="row between"><span className="muted">Total paid</span><b>{fmtMoney(p.totalPaid)}</b></div>
            <div className="row between"><span className="muted">Email</span><b>{p.email || '—'}</b></div>
            <div className="row between"><span className="muted">City</span><b>{p.city || '—'}</b></div>
          </Body></Card>
          <Card soft><Body className="col gap-6 small">
            <div className="muted">Insurance / scheme</div>
            <div><b>{TYPE_LABEL[p.insurance?.type] || 'Self-pay'}</b>{p.insurance?.carrier ? ` · ${p.insurance.carrier}` : ''}</div>
            {p.insurance?.memberId && <div className="mono">{p.insurance.memberId}{p.insurance.groupNumber ? ` · grp ${p.insurance.groupNumber}` : ''}{p.insurance.tpa ? ` · TPA ${p.insurance.tpa}` : ''}</div>}
            <div className="muted">{p.insurance?.verified ? `Verified by ${p.insurance.verifiedBy || 'staff'}` : p.insurance?.cardScannedAt ? `Card scanned ${ago(p.insurance.cardScannedAt)}` : 'Not verified'}</div>
            {p.abhaAddress && <div className="muted">ABHA address: <span className="mono">{p.abhaAddress}</span></div>}
            {p.notes && <><div className="divider" /><div className="muted">Notes</div><div>{p.notes}</div></>}
          </Body></Card>
        </div>
      )}
      {tab === 'appointments' && <Card soft><table className="table"><thead><tr><th>When</th><th>Visit</th><th>Dentist</th><th>Branch</th><th>Status</th><th>Fee</th></tr></thead><tbody>{p.appointments.map((a) => <tr key={a.id}><td className="small">{fmtWhen(a.start)}</td><td className="small">{a.visitType?.name}</td><td className="small muted">{a.provider?.name}</td><td className="small muted">{a.location?.name}</td><td><Pill status={a.status} /></td><td className="small">{a.fee ? <>{fmtMoney(a.fee)} <Pill status={a.paymentStatus || 'unpaid'} /></> : '—'}</td></tr>)}</tbody></table></Card>}
      {tab === 'plans' && <div className="col">{p.treatmentPlans.map((tp) => <Card soft key={tp.id}><Body className="col gap-4 small"><div className="row between"><b>Approved by {tp.approvedBy} · {fmtDate(tp.createdAt)}</b>{tp.nextVisitScheduled ? <Pill tone="good">Next visit booked</Pill> : <Pill tone="warn">Not booked</Pill>}</div>{tp.items.map((i) => <div key={i.id} className="row gap-6"><Pill status={i.status} />{i.procedure}{i.estCost ? <span className="muted">{fmtMoney(i.estCost)}</span> : null}</div>)}</Body></Card>)}{p.treatmentPlans.length === 0 && <Empty>No treatment plans.</Empty>}</div>}
      {tab === 'forms' && <Card soft><div className="list">{p.packets.map((k) => <div className="list-item" key={k.id}><div className="grow small">Forms for {fmtWhen(p.appointments.find((a) => a.id === k.appointmentId)?.start)}</div><Pill status={k.status} /><a className="btn sm ghost" href={`#/previsit?packet=${k.id}`} onClick={onClose}>Open</a></div>)}{p.packets.length === 0 && <Empty>No forms yet.</Empty>}</div></Card>}
      {tab === 'messages' && <Card soft><div className="list">{p.communications.map((c) => <div className="list-item start" key={c.id}><div className="grow"><div className="row gap-6"><Pill tone="outline">{c.type}</Pill><span className="tiny faint">{c.channel} · {ago(c.sentAt)}{c.lang && c.lang !== 'en' ? ` · ${LANG_NAME[c.lang]}` : ''}</span></div><div className="small muted mt-8" style={{ marginTop: 4 }}>{c.body}</div></div></div>)}{p.communications.length === 0 && <Empty>No messages yet.</Empty>}</div></Card>}
      {editing && <PatientForm settings={settings} patient={p} onClose={() => setEditing(false)} onDone={() => { setEditing(false); load(); onChange(); }} />}
    </Modal>
  );
}

export function PatientForm({ settings, patient, onClose, onDone }) {
  const [f, setF] = useState(patient ? { ...patient, insurance: { ...patient.insurance } } : { firstName: '', lastName: '', dob: '', gender: '', phone: '', email: '', abhaNumber: '', abhaAddress: '', preferredLanguage: settings.locale?.defaultLanguage || 'en', locationId: settings.locations[0]?.id, city: 'Bengaluru', address: '', notes: '', insurance: { type: 'self', carrier: '', memberId: '', groupNumber: '', tpa: '' } });
  const [run, busy] = useAction();
  const set = (k, v) => setF({ ...f, [k]: v });
  const ins = (k, v) => setF({ ...f, insurance: { ...f.insurance, [k]: v } });
  return (
    <Modal title={patient ? 'Edit patient' : 'Add patient'} onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !f.firstName || !f.lastName} onClick={() => run(async () => { if (patient) await patch(`/api/patients/${patient.id}`, f); else await post('/api/patients', f); onDone(); }, patient ? 'Patient updated' : 'Patient added')}><IconCheck size={16} />Save</button></>}>
      <div className="grid three">
        <Field label="First name"><input className="input" value={f.firstName} onChange={(e) => set('firstName', e.target.value)} autoFocus /></Field>
        <Field label="Last name"><input className="input" value={f.lastName} onChange={(e) => set('lastName', e.target.value)} /></Field>
        <Field label="Gender"><select className="input" value={f.gender || ''} onChange={(e) => set('gender', e.target.value)}><option value="">—</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select></Field>
        <Field label="Date of birth"><input className="input" type="date" value={f.dob || ''} onChange={(e) => set('dob', e.target.value)} /></Field>
        <Field label="Mobile (+91)"><input className="input" value={f.phone || ''} onChange={(e) => set('phone', e.target.value)} placeholder="98450 12345" /></Field>
        <Field label="Email"><input className="input" value={f.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="ABHA number"><input className="input mono" value={f.abhaNumber || ''} onChange={(e) => set('abhaNumber', e.target.value)} placeholder="91-2345-6789-0123" /></Field>
        <Field label="ABHA address"><input className="input mono" value={f.abhaAddress || ''} onChange={(e) => set('abhaAddress', e.target.value)} placeholder="name@abdm" /></Field>
        <Field label="Preferred language"><select className="input" value={f.preferredLanguage || 'en'} onChange={(e) => set('preferredLanguage', e.target.value)}>{(settings.locale?.languages || []).map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select></Field>
        <Field label="Home branch"><select className="input" value={f.locationId || ''} onChange={(e) => set('locationId', e.target.value)}>{settings.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
        <Field label="City"><input className="input" value={f.city || ''} onChange={(e) => set('city', e.target.value)} /></Field>
        <Field label="Address"><input className="input" value={f.address || ''} onChange={(e) => set('address', e.target.value)} /></Field>
      </div>
      <div className="divider" />
      <div className="grid three">
        <Field label="Coverage"><select className="input" value={f.insurance?.type || 'self'} onChange={(e) => ins('type', e.target.value)}>{(settings.insuranceOptions || []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></Field>
        {f.insurance?.type !== 'self' && <><Field label="Insurer / scheme name"><input className="input" value={f.insurance?.carrier || ''} onChange={(e) => ins('carrier', e.target.value)} /></Field><Field label="Policy / member ID"><input className="input" value={f.insurance?.memberId || ''} onChange={(e) => ins('memberId', e.target.value)} /></Field><Field label="TPA"><input className="input" value={f.insurance?.tpa || ''} onChange={(e) => ins('tpa', e.target.value)} /></Field><Field label="Group number"><input className="input" value={f.insurance?.groupNumber || ''} onChange={(e) => ins('groupNumber', e.target.value)} /></Field></>}
      </div>
      <Field label="How did they hear about us?"><select className="input" value={f.source || ''} onChange={(e) => set('source', e.target.value)}><option value="">Not recorded</option>{HEARD.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Notes"><textarea className="input" value={f.notes || ''} onChange={(e) => set('notes', e.target.value)} /></Field>
    </Modal>
  );
}

function ImportCsv({ onClose, onDone }) {
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState(null);
  const [run, busy] = useAction();
  return (
    <Modal title="Import patients from CSV" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Close</button><button className="btn primary" disabled={busy || !csv.trim()} onClick={() => run(async () => { const r = await post('/api/patients/import', { csv }); setResult(r); onDone(); }, 'Import finished')}><IconUpload size={16} />Import</button></>}>
      <div className="callout small">Export from your current software (Dentee, Carestack, Practo, Excel…) and paste or upload the CSV. Recognised columns: name or first/last name, mobile, DOB (dd/mm/yyyy or yyyy-mm-dd), gender, ABHA, insurer, policy no, TPA, branch, language, last visit, recall due, notes. Existing patients (same ABHA or mobile + name) are updated, not duplicated.</div>
      <label className="btn" style={{ alignSelf: 'flex-start' }}><IconUpload size={16} />Choose file<input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) f.text().then(setCsv); }} /></label>
      <textarea className="input mono" style={{ minHeight: 160 }} placeholder={'Name,Mobile,DOB,Insurer,Policy no,Branch\nRavi Kumar,9900011122,15/08/1985,Star Health,SH-1,Whitefield'} value={csv} onChange={(e) => setCsv(e.target.value)} />
      {result && <div className="callout small"><b>{result.created}</b> created, <b>{result.updated}</b> updated{result.errors.length ? <>, {result.errors.length} skipped: {result.errors.slice(0, 5).join('; ')}</> : ''}.</div>}
    </Modal>
  );
}
