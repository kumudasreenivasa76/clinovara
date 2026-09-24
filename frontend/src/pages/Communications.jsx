import React, { useEffect, useState } from 'react';
import { IconSend, IconBell, IconRepeat, IconHeartHandshake, IconPlayerPlay, IconTemplate, IconPencil } from '@tabler/icons-react';
import { get, post, put } from '../lib/api.js';
import { fmtWhen, fullName, ago, fmtPhone, LANG_NAME } from '../lib/format.js';
import { Card, Body, Pill, Avatar, Empty, usePoll, useAction, Modal, Field, Seg } from '../components/ui.jsx';
import { PatientPicker } from './Schedule.jsx';

const TYPE_TONE = { reminder: 'info', prep: 'accent', forms: 'accent', recall: 'warn', post_visit: 'good', waitlist: 'violet', treatment: 'warn', token: '', custom: '' };
const TYPE_LABEL = { reminder: 'Reminder', prep: 'Preparation', forms: 'Forms', recall: 'Recall', post_visit: 'Post-visit', waitlist: 'Waitlist offer', treatment: 'Treatment follow-up', token: 'Token', custom: 'Message' };

export default function Communications() {
  const due = usePoll(() => get('/api/communications/due'), [], 10000);
  const outbox = usePoll(() => get('/api/communications?limit=80'), [], 10000);
  const templates = usePoll(() => get('/api/communications/templates'), []);
  const settings = usePoll(() => get('/api/settings'), []);
  const [run, busy] = useAction();
  const [compose, setCompose] = useState(false);
  const [editTpl, setEditTpl] = useState(null);
  const [tplLang, setTplLang] = useState('en');
  const refresh = () => { due.reload(); outbox.reload(); };
  const runKind = (kind, msg) => run(async () => { const r = await post('/api/communications/run', { kind }); refresh(); return r; }, msg);
  const d = due.data;
  const langs = settings.data?.locale?.languages || [{ code: 'en', name: 'English' }];
  const provider = settings.data?.integrations?.messaging?.provider;

  return (
    <>
      <div className="page-head">
        <div><h1>Patient communication</h1><p>Practice-approved reminders, preparation instructions, recalls, tokens and post-visit check-ins, sent on WhatsApp in the patient's language. Replies land in the inbox and your team can take over any time.</p></div>
        <div className="row"><button className="btn" onClick={() => setCompose(true)}><IconPencil size={16} />Send a message</button><button className="btn primary" disabled={busy || !d} onClick={() => runKind('all', 'Outreach sent')}><IconPlayerPlay size={16} />Run all due outreach</button></div>
      </div>
      <div className="callout info mb-16 small">{provider && provider !== 'none' ? `Messaging provider configured: ${provider}. ` : 'No WhatsApp or SMS provider is connected yet (Settings → Integrations). '}Messages are recorded in the outbox and mirrored into each patient's inbox thread; nothing leaves the system until a provider is wired in.</div>
      <div className="grid three mb-16">
        <Card title={<span className="row gap-6"><IconBell size={16} />Reminders due</span>} actions={d?.reminders?.length > 0 && <button className="btn sm" onClick={() => runKind('reminders', 'Reminders sent')}>Send {d.reminders.length}</button>}>
          <div className="list">{(d?.reminders || []).map((r) => <div className="list-item" key={r.appointment.id + r.hoursBefore}><div className="grow"><div className="small strong">{fullName(r.appointment.patient)}</div><div className="tiny muted">{r.hoursBefore}h before · {fmtWhen(r.appointment.start)} · {r.appointment.visitType?.name} · {r.appointment.location?.name}</div></div></div>)}{d && d.reminders.length === 0 && <div className="empty small">Nothing due.</div>}</div>
        </Card>
        <Card title={<span className="row gap-6"><IconRepeat size={16} />Recalls due</span>} actions={d?.recalls?.length > 0 && <button className="btn sm" onClick={() => runKind('recalls', 'Recall messages sent')}>Send {d.recalls.length}</button>}>
          <div className="list">{(d?.recalls || []).map((r) => <div className="list-item" key={r.patient.id}><div className="grow"><div className="small strong">{fullName(r.patient)}</div><div className="tiny muted">Recall due {r.patient.nextRecallDue} · last visit {r.patient.lastVisit || 'unknown'}</div></div></div>)}{d && d.recalls.length === 0 && <div className="empty small">Everyone overdue has been contacted in the last 2 weeks or has a visit booked.</div>}</div>
        </Card>
        <Card title={<span className="row gap-6"><IconHeartHandshake size={16} />Post-visit check-ins</span>} actions={d?.postVisit?.length > 0 && <button className="btn sm" onClick={() => runKind('post_visit', 'Check-ins sent')}>Send {d.postVisit.length}</button>}>
          <div className="list">{(d?.postVisit || []).map((r) => <div className="list-item" key={r.appointment.id}><div className="grow"><div className="small strong">{fullName(r.appointment.patient)}</div><div className="tiny muted">{r.appointment.visitType?.name} · completed {ago(r.appointment.completedAt)}</div></div></div>)}{d && d.postVisit.length === 0 && <div className="empty small">Nothing due.</div>}</div>
        </Card>
      </div>
      <div className="grid side">
        <Card title="Outbox">
          <div className="list" style={{ maxHeight: 560, overflow: 'auto' }}>
            {(outbox.data || []).map((c) => (
              <div className="list-item start" key={c.id}>
                <Avatar patient={c.patient} />
                <div className="grow">
                  <div className="row between"><div className="row gap-6 wrap"><span className="small strong">{fullName(c.patient)}</span><Pill tone={TYPE_TONE[c.type]}>{TYPE_LABEL[c.type] || c.type}</Pill><span className="tiny faint">{c.channel} · {c.by || 'Clinovara'}{c.lang && c.lang !== 'en' ? ` · ${LANG_NAME[c.lang] || c.lang}` : ''}{c.delivery === 'simulated' ? ' · not sent (no provider)' : ''}</span></div><span className="tiny faint">{ago(c.sentAt)}</span></div>
                  <div className="small muted" style={{ marginTop: 4 }}>{c.body}</div>
                </div>
              </div>
            ))}
            {outbox.data?.length === 0 && <Empty>No messages sent yet.</Empty>}
          </div>
        </Card>
        <Card title={<span className="row gap-6"><IconTemplate size={16} />Approved templates</span>} actions={<Seg value={tplLang} onChange={setTplLang} options={langs.map((l) => ({ value: l.code, label: l.name }))} />}>
          <div className="list">
            {(templates.data || []).map((t) => <div className="list-item clickable" key={t.id} onClick={() => setEditTpl({ ...t, lang: tplLang })}><div className="grow"><div className="row gap-6"><span className="small strong">{t.name}</span><Pill tone={TYPE_TONE[t.type]}>{TYPE_LABEL[t.type] || t.type}</Pill>{!t.body[tplLang] && <Pill tone="warn">no {langs.find((l) => l.code === tplLang)?.name}</Pill>}</div><div className="tiny muted truncate">{t.body[tplLang] || t.body.en}</div></div></div>)}
          </div>
        </Card>
      </div>
      {compose && <Compose templates={templates.data || []} langs={langs} onClose={() => setCompose(false)} onDone={() => { setCompose(false); refresh(); }} />}
      {editTpl && <Modal title={`${editTpl.name} · ${langs.find((l) => l.code === editTpl.lang)?.name}`} onClose={() => setEditTpl(null)} footer={<><button className="btn" onClick={() => setEditTpl(null)}>Cancel</button><button className="btn primary" onClick={() => run(async () => { await put(`/api/communications/templates/${editTpl.id}`, { body: { [editTpl.lang]: editTpl.body[editTpl.lang] || '' }, name: editTpl.name }); templates.reload(); setEditTpl(null); }, 'Template saved')}>Save</button></>}>
        <Field label="Name"><input className="input" value={editTpl.name} onChange={(e) => setEditTpl({ ...editTpl, name: e.target.value })} /></Field>
        <Field label="Message" hint="Placeholders: {{firstName}} {{practice}} {{visitType}} {{provider}} {{location}} {{when}} {{time}} {{formsLink}} {{treatment}} {{token}}"><textarea className="input" style={{ minHeight: 120 }} value={editTpl.body[editTpl.lang] || ''} placeholder={editTpl.body.en} onChange={(e) => setEditTpl({ ...editTpl, body: { ...editTpl.body, [editTpl.lang]: e.target.value } })} /></Field>
        {editTpl.lang !== 'en' && <div className="tiny muted">English version: {editTpl.body.en}</div>}
      </Modal>}
    </>
  );
}

function Compose({ templates, langs, onClose, onDone }) {
  const [patient, setPatient] = useState(null);
  const [templateId, setTemplateId] = useState('');
  const [body, setBody] = useState('');
  const [appointmentId, setAppointmentId] = useState('');
  const [lang, setLang] = useState('');
  const [channel, setChannel] = useState('');
  const [appts, setAppts] = useState([]);
  const [preview, setPreview] = useState('');
  const [run, busy] = useAction();
  useEffect(() => { if (patient) { get(`/api/appointments?patientId=${patient.id}`).then((a) => setAppts(a.filter((x) => ['scheduled', 'confirmed'].includes(x.status)))); setLang(patient.preferredLanguage || 'en'); } }, [patient]);
  useEffect(() => { if (!patient) return; post('/api/communications/preview', { patientId: patient.id, appointmentId: appointmentId || undefined, templateId: templateId || undefined, body: templateId ? undefined : body, lang: lang || undefined }).then((r) => setPreview(r.body)).catch(() => {}); }, [patient, templateId, body, appointmentId, lang]);
  return (
    <Modal title="Send a message" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !patient || !preview.trim()} onClick={() => run(async () => { await post('/api/communications/send', { patientId: patient.id, templateId: templateId || undefined, body: templateId ? undefined : body, appointmentId: appointmentId || undefined, lang: lang || undefined, channel: channel || undefined }); onDone(); }, 'Message sent')}><IconSend size={16} />Send</button></>}>
      <Field label="Patient"><PatientPicker value={patient} onChange={setPatient} autoFocus /></Field>
      <div className="grid two">
        <Field label="Template"><select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}><option value="">Write my own</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
        <Field label="About appointment"><select className="input" value={appointmentId} onChange={(e) => setAppointmentId(e.target.value)}><option value="">None</option>{appts.map((a) => <option key={a.id} value={a.id}>{fmtWhen(a.start)} · {a.visitType?.name}</option>)}</select></Field>
        <Field label="Language"><select className="input" value={lang} onChange={(e) => setLang(e.target.value)}>{langs.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select></Field>
        <Field label="Channel"><select className="input" value={channel} onChange={(e) => setChannel(e.target.value)}><option value="">Default (WhatsApp)</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option></select></Field>
      </div>
      {!templateId && <Field label="Message"><textarea className="input" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Hi {{firstName}}, …" /></Field>}
      {patient && preview && <div className="callout small"><div className="tiny muted mb-8">Preview to {fmtPhone(patient.phone)}</div>{preview}</div>}
    </Modal>
  );
}
