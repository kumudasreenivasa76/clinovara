import React, { useEffect, useState } from 'react';
import { IconSend, IconCheck, IconAlertCircle, IconExternalLink, IconPencil } from '@tabler/icons-react';
import { get, post, put } from '../lib/api.js';
import { fmtWhen, fullName, ago, fmtPhone } from '../lib/format.js';
import { Card, Body, Pill, Avatar, Empty, usePoll, useAction, Modal, Field, Seg, Stat } from '../components/ui.jsx';
import { SectionForm } from './Forms.jsx';

export default function PreVisit({ hash }) {
  const params = new URLSearchParams(hash.split('?')[1] || '');
  const { data, reload } = usePoll(() => get('/api/forms'), [], 6000);
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(params.get('packet') || null);
  const [run] = useAction();
  const list = (data || []).filter((p) => filter === 'all' || (filter === 'incomplete' ? p.status !== 'complete' : p.status === filter));
  const pk = (data || []).find((p) => p.id === open);

  return (
    <>
      <div className="page-head">
        <div><h1>Pre-visit preparation</h1><p>Forms go out with the booking confirmation. Staff see what is complete and what still needs attention before the patient arrives.</p></div>
        <Seg value={filter} onChange={setFilter} options={[{ value: 'all', label: 'Upcoming' }, { value: 'incomplete', label: 'Needs attention' }, { value: 'complete', label: 'Complete' }]} />
      </div>
      <div className="grid four mb-16">
        <Stat value={data?.length ?? '—'} label="Upcoming visits with forms" />
        <Stat value={data?.filter((p) => p.status === 'complete').length ?? '—'} label="Complete" tone="good" />
        <Stat value={data?.filter((p) => p.status === 'partial').length ?? '—'} label="In progress" tone="warn" />
        <Stat value={data?.filter((p) => p.status === 'sent' || p.status === 'created').length ?? '—'} label="Not started" tone={data?.some((p) => p.status === 'sent') ? 'bad' : ''} />
      </div>
      <Card>
        <table className="table">
          <thead><tr><th>Appointment</th><th>Patient</th><th>Status</th><th>Sections</th><th>Sent</th><th /></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td><div className="small strong">{fmtWhen(p.appointment.start)}</div><div className="tiny muted">{p.visitType?.name} · {p.provider?.name}</div></td>
                <td><div className="row"><Avatar patient={p.patient} /><div><div className="small strong">{fullName(p.patient)}</div><div className="tiny muted">{fmtPhone(p.patient?.phone)}</div></div></div></td>
                <td><Pill status={p.status} /></td>
                <td><div className="tag-list">{['medicalHistory', 'dentalConcerns', 'medications', 'allergies', 'insurance', 'consent'].map((k) => <span key={k} className={`pill ${p.sections[k]?.complete ? 'good' : 'outline'}`} style={{ padding: '1px 8px', fontSize: 11 }}>{p.sections[k]?.complete ? <IconCheck size={10} /> : null}{LABELS[k]}</span>)}</div></td>
                <td className="tiny muted">{p.sentAt ? `${ago(p.sentAt)}${p.remindersSent ? ` · ${p.remindersSent} reminder${p.remindersSent > 1 ? 's' : ''}` : ''}` : 'Not sent'}</td>
                <td className="right"><div className="row gap-6" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn sm ghost" onClick={() => setOpen(p.id)}><IconPencil size={14} />Review</button>
                  {p.status !== 'complete' && <button className="btn sm" onClick={() => run(async () => { await post(`/api/forms/${p.id}/remind`); reload(); }, p.sentAt ? 'Reminder sent' : 'Forms sent')}><IconSend size={14} />{p.sentAt ? 'Remind' : 'Send'}</button>}
                </div></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={6}><Empty>Nothing to show.</Empty></td></tr>}
          </tbody>
        </table>
      </Card>
      {pk && <PacketModal pk={pk} onClose={() => setOpen(null)} onChange={reload} />}
    </>
  );
}

const LABELS = { medicalHistory: 'Medical', dentalConcerns: 'Dental', medications: 'Meds', allergies: 'Allergies', insurance: 'Insurance', consent: 'Consent' };
const FULL = { medicalHistory: 'Medical history', dentalConcerns: 'Dental concerns', medications: 'Medications', allergies: 'Allergies', insurance: 'Insurance', consent: 'Consent' };

function PacketModal({ pk, onClose, onChange }) {
  const [editing, setEditing] = useState(null);
  const [run] = useAction();
  const [meta, setMeta] = useState(null);
  useEffect(() => { get('/api/forms/sections').then(setMeta).catch(() => {}); }, []);
  const link = `${window.location.origin}${window.location.pathname}#/forms/${pk.token}`;
  return (
    <Modal title={`${fullName(pk.patient)} · pre-visit forms`} onClose={onClose} wide footer={<button className="btn" onClick={onClose}>Close</button>}>
      <div className="row wrap gap-6"><Pill status={pk.status} /><Pill tone="outline">{fmtWhen(pk.appointment.start)}</Pill><Pill tone="outline">{pk.visitType?.name}</Pill><a className="btn sm ghost" href={link} target="_blank" rel="noreferrer"><IconExternalLink size={14} />Open patient link</a></div>
      {pk.missing.length > 0 && <div className="callout warn row gap-6"><IconAlertCircle size={16} />Still missing: {pk.missing.join(', ')}</div>}
      {Object.keys(FULL).map((k) => {
        const sec = pk.sections[k] || {};
        return (
          <Card key={k} soft>
            <div className="card-head"><div className="row gap-6"><h3>{FULL[k]}</h3>{sec.complete ? <Pill tone="good">Complete{sec.by ? ` · ${sec.by}` : ''}</Pill> : sec.prefilled ? <Pill tone="info">Carried forward — needs confirmation</Pill> : <Pill tone="outline">Not started</Pill>}</div><button className="btn sm ghost" onClick={() => setEditing(editing === k ? null : k)}>{editing === k ? 'Cancel' : sec.complete ? 'Edit' : 'Fill in for patient'}</button></div>
            <Body>
              {editing === k ? <SectionForm sectionKey={k} initial={sec.data || {}} consentText={meta?.consentText} staff onSave={(data) => run(async () => { await put(`/api/forms/${pk.id}/sections/${k}`, { data }); setEditing(null); onChange(); }, 'Section saved')} /> : <SectionSummary k={k} data={sec.data || {}} />}
            </Body>
          </Card>
        );
      })}
    </Modal>
  );
}

export function SectionSummary({ k, data }) {
  const entries = Object.entries(data || {}).filter(([key, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length) && key !== 'scanned');
  if (!entries.length) return <div className="tiny muted">No answers yet.</div>;
  return <div className="grid two small">{entries.map(([key, v]) => <div key={key}><div className="tiny muted">{key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}</div><div>{Array.isArray(v) ? v.join(', ') : String(v)}</div></div>)}</div>;
}
