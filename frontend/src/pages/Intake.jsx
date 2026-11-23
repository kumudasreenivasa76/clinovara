/**
 * Shared pieces of the pre-visit intake module: status and channel labels, the assign dialog, the submission
 * view used by reception and by dentists, and the printable form. Reception and dentists see the same record;
 * what differs is what each may do with it.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { IconBrandWhatsapp, IconMessage, IconMail, IconPrinter, IconDeviceTablet, IconSend, IconCopy, IconExternalLink, IconPaperclip, IconUpload, IconTrash, IconCheck, IconAlertCircle, IconBan, IconStethoscope, IconSearch, IconClock } from '@tabler/icons-react';
import { get, post, put, del } from '../lib/api.js';
import { fmtWhen, fmtTime, fullName, fmtPhone, ago } from '../lib/format.js';
import { Card, Body, Pill, Modal, Field, Seg, Empty, useAction, useToast } from '../components/ui.jsx';
import { SectionForm, CustomFields } from './Forms.jsx';

export const CHANNEL = {
  whatsapp: { label: 'WhatsApp', icon: IconBrandWhatsapp, hint: 'A secure link in a WhatsApp message' },
  sms: { label: 'SMS', icon: IconMessage, hint: 'A secure link by text message' },
  email: { label: 'Email', icon: IconMail, hint: 'A secure link by email' },
  print: { label: 'Paper', icon: IconPrinter, hint: 'Print it for the patient to fill at the clinic' },
  tablet: { label: 'Clinic tablet', icon: IconDeviceTablet, hint: 'The patient fills it on your tablet' },
};
const TONE = { draft: 'outline', scheduled: 'info', queued: 'outline', sent: 'outline', delivered: 'info', failed: 'bad', opened: 'info', in_progress: 'warn', submitted: 'good', expired: 'bad', cancelled: '', paper_received: 'warn', under_review: 'info', reviewed: 'good' };
const SOURCE = { digital: 'Online', tablet: 'Clinic tablet', paper: 'Paper', staff: 'Entered by staff' };
const DELIVERY = { unknown: 'Not confirmed', sent: 'Accepted by provider', delivered: 'Delivered', queued: 'Queued', failed: 'Failed' };
const FULL = { medicalHistory: 'Medical history', dentalConcerns: 'Dental concerns', medications: 'Medications', allergies: 'Allergies', insurance: 'Insurance', consent: 'Consent and signature' };
const HEALTH = new Set(['medicalHistory', 'medications', 'allergies']);

export const IntakePill = ({ intake }) => <Pill tone={TONE[intake.status]}>{intake.label}</Pill>;
export function ChannelTag({ id }) { const c = CHANNEL[id] || { label: id, icon: IconMessage }; return <span className="iv-chan"><c.icon size={14} />{c.label}</span>; }
export const sourceLabel = (s) => SOURCE[s] || 'Not started';
export const deliveryLabel = (d) => (d ? DELIVERY[d] || d : 'Not sent');
export const linkFor = (token) => `${window.location.origin}${window.location.pathname}#/forms/${token}`;
export const Progress = ({ percent }) => <div className="iv-bar" title={`${percent}% complete`}><span style={{ width: `${percent}%` }} /></div>;

export function SectionSummary({ data }) {
  const entries = Object.entries(data || {}).filter(([key, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length) && !['scanned', 'lang', 'selfPay'].includes(key));
  if (!entries.length) return <div className="tiny muted">No answers yet.</div>;
  const show = (v) => (Array.isArray(v) ? v.join(', ') : v === true ? 'Yes' : v === false ? 'No' : /^\d{4}-\d{2}-\d{2}T/.test(String(v)) ? fmtWhen(v) : String(v));
  return <div className="grid two small">{entries.map(([key, v]) => <div key={key}><div className="tiny muted">{key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}</div><div>{show(v)}</div></div>)}</div>;
}

/** Assign a form to an appointment: patient, contact details, channel, and when it goes out. */
export function AssignModal({ onClose, onDone, appointmentId = '' }) {
  const [list, setList] = useState(null);
  const [q, setQ] = useState('');
  const [pick, setPick] = useState(appointmentId);
  const [f, setF] = useState({ channel: 'whatsapp', when: 'now', scheduleAt: '', phone: '', email: '' });
  const [run, busy] = useAction();
  useEffect(() => { get('/api/forms/candidates').then(setList).catch(() => setList([])); }, []);
  const chosen = (list || []).find((c) => c.appointmentId === pick) || null;
  useEffect(() => { if (chosen) setF((x) => ({ ...x, phone: chosen.phone, email: chosen.email, channel: CHANNEL[chosen.preferredChannel] ? chosen.preferredChannel : 'whatsapp' })); }, [chosen?.appointmentId]); // eslint-disable-line
  const shown = (list || []).filter((c) => !q.trim() || `${c.patient} ${c.phone}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8);
  const messaging = ['whatsapp', 'sms', 'email'].includes(f.channel);
  const problem = !chosen ? 'Choose a patient and appointment.' : f.channel === 'email' && !f.email.trim() ? 'Enter an email address, or choose another channel.' : messaging && f.channel !== 'email' && f.phone.replace(/\D/g, '').length < 10 ? 'Enter a mobile number with at least 10 digits.' : messaging && f.when === 'schedule' && !f.scheduleAt ? 'Choose when to send it.' : '';
  const go = () => run(async () => {
    const r = await post('/api/forms/assign', { appointmentId: chosen.appointmentId, channel: f.channel, when: messaging ? f.when : 'now', scheduleAt: f.scheduleAt ? new Date(f.scheduleAt).toISOString() : undefined, phone: f.phone, email: f.email });
    onDone?.(r.packet); onClose();
  }, !messaging ? 'Form assigned for completion at the clinic' : f.when === 'schedule' ? 'Form scheduled' : 'Form sent');
  return (
    <Modal title="Assign intake form" onClose={onClose} wide footer={<><span className="small muted grow">{problem}</span><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !!problem} onClick={go}><IconSend size={15} />{!messaging ? 'Assign' : f.when === 'schedule' ? 'Schedule' : 'Send now'}</button></>}>
      <div>
        <div className="field-label">1. Patient and appointment</div>
        {chosen ? (
          <div className="iv-picked"><div className="grow"><div className="strong">{chosen.patient}</div><div className="small muted">{fmtWhen(chosen.start)} · {chosen.visitType} · {chosen.provider}</div></div>{chosen.status && <Pill tone="outline">Already assigned</Pill>}<button className="btn sm ghost" onClick={() => setPick('')}>Change</button></div>
        ) : (<>
          <div className="iv-search"><IconSearch size={15} /><input className="input" autoFocus placeholder="Search upcoming appointments by patient name or mobile" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="list iv-cands">{!list ? <div className="skeleton" /> : shown.length === 0 ? <Empty>No upcoming appointments match. Book the appointment first, then assign the form.</Empty> : shown.map((c) => (
            <div key={c.appointmentId} className="list-item clickable" onClick={() => setPick(c.appointmentId)}><div className="grow"><div className="small strong">{c.patient}</div><div className="tiny muted">{fmtWhen(c.start)} · {c.visitType} · {c.provider}</div></div>{c.status && <Pill tone="outline">Assigned</Pill>}</div>))}</div>
        </>)}
      </div>
      {chosen && (<>
        <div><div className="field-label">2. Form</div><div className="small">New patient intake: personal details, reason for visit, patient-reported health, insurance, preferences, consent and signature{chosen.forms.length ? `, plus ${chosen.forms.join(', ')}` : ''}.</div></div>
        <div className="grid two">
          <Field label="3. Mobile number" hint="Confirm it with the patient. A change here updates the patient record."><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="Email" hint="Needed only for the email channel."><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        </div>
        <div><div className="field-label">4. How should it reach the patient?</div>
          <div className="iv-channels">{Object.entries(CHANNEL).map(([id, c]) => <button key={id} type="button" className={f.channel === id ? 'on' : ''} onClick={() => setF({ ...f, channel: id })}><c.icon size={20} /><b>{c.label}</b><span>{c.hint}</span></button>)}</div>
        </div>
        {messaging ? (
          <div><div className="field-label">5. When should it be sent?</div>
            <div className="row gap-6 wrap mt-8"><Seg value={f.when} onChange={(v) => setF({ ...f, when: v })} options={[{ value: 'now', label: 'Send now' }, { value: 'schedule', label: 'Schedule before the appointment' }]} />{f.when === 'schedule' && <input className="input" style={{ width: 230 }} type="datetime-local" value={f.scheduleAt} onChange={(e) => setF({ ...f, scheduleAt: e.target.value })} />}</div>
            <div className="tiny muted mt-8">The message carries a secure link only, never the questions or the answers.</div>
          </div>
        ) : <div className="callout small">Nothing is sent to the patient. Open this assignment at the clinic to {f.channel === 'print' ? 'print the form, then record the paper copy when it comes back' : 'hand the tablet to the patient'}.</div>}
      </>)}
    </Modal>
  );
}

/** The printable form: blank for a clipboard, or with the patient's details and whatever has been answered. */
export function printForm(pk, { blank = false, clinic = '' } = {}) {
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const line = (label, value) => `<div class="q"><span>${esc(label)}</span><b>${blank || !value ? '&nbsp;' : esc(value)}</b></div>`;
  const val = (v) => (Array.isArray(v) ? v.join(', ') : v === true ? 'Yes' : v === false ? 'No' : v);
  const p = pk?.patient || {};
  const SECTION_Q = {
    dentalConcerns: [['What brings you in?', 'concerns'], ['Last dental cleaning', 'lastCleaning'], ['Do you feel anxious about dental visits?', 'anxiety'], ['Do your gums bleed?', 'bleedingGums']],
    medicalHistory: [['Health conditions you have been told you have', 'conditions'], ['Past surgeries or hospital stays', 'surgeries'], ['Do you smoke or use tobacco?', 'smoker'], ['Are you pregnant?', 'pregnant'], ['Anything else we should know', 'notes']],
    medications: [['Medicines you take regularly', 'list'], ['Do you take blood thinners?', 'bloodThinners']],
    allergies: [['Allergies (medicines, food, materials)', 'list'], ['Latex allergy?', 'latex']],
    insurance: [['Insurance or scheme', 'type'], ['Insurer', 'carrier'], ['Member ID', 'memberId']],
  };
  const sec = (k) => `<h2>${FULL[k]}${HEALTH.has(k) ? ' <small>(as reported by the patient)</small>' : ''}</h2>${SECTION_Q[k].map(([l, key]) => line(l, val(pk?.sections?.[k]?.data?.[key]))).join('')}`;
  const custom = (pk?.custom || []).map((c) => `<h2>${esc(c.name)}</h2>${(c.answeredFields || c.fields).map((f) => (f.type === 'info' ? `<p>${esc(f.label)}</p>` : line(f.label + (f.options?.length ? ` (${f.options.join(' / ')})` : f.type === 'yesno' ? ' (Yes / No)' : ''), c.data?.[f.id]))).join('')}`).join('');
  const consent = pk?.sections?.consent?.data || {};
  const html = `<!doctype html><title>Intake form${p.firstName ? ` - ${esc(fullName(p))}` : ''}</title><style>
    body{font:13.5px/1.5 Arial,Helvetica,sans-serif;color:#111;max-width:760px;margin:0 auto;padding:28px}
    h1{font-size:20px;margin:0}h2{font-size:14px;margin:22px 0 6px;padding-bottom:4px;border-bottom:1.5px solid #111}h2 small{font-weight:400;color:#555}
    .head{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #111;padding-bottom:10px}.head div:last-child{text-align:right;color:#444}
    .q{display:flex;gap:10px;align-items:flex-end;margin:9px 0}.q span{flex:0 0 46%}.q b{flex:1;border-bottom:1px solid #777;min-height:20px;font-weight:600}
    .sign{display:flex;gap:28px;margin-top:34px}.sign div{flex:1;border-top:1px solid #111;padding-top:4px;font-size:12px}.note{font-size:11.5px;color:#444;margin-top:18px}
    @media print{body{padding:0}}</style>
    <div class="head"><div><h1>${esc(clinic || 'Patient intake form')}</h1><div>Patient intake form</div></div><div>${blank || !pk ? '' : `${esc(fmtWhen(pk.appointment?.start))}<br>${esc(pk.provider?.name || '')}`}</div></div>
    <h2>Personal information</h2>${line('Full name', fullName(p) === 'Unknown' ? '' : fullName(p))}${line('Date of birth', p.dob)}${line('Mobile number', p.phone)}${line('Email', p.email)}${line('Preferred language', p.preferredLanguage)}
    ${['dentalConcerns', 'medicalHistory', 'medications', 'allergies', 'insurance'].map(sec).join('')}${custom}
    <h2>Declaration and consent</h2><p>${esc(pk?.consentText || 'I confirm that the information I have given is true to the best of my knowledge. I consent to dental examination and treatment as discussed with my dentist.')}</p>
    ${blank || !consent.signature ? '' : `<p>Signed online as <b>${esc(consent.signature)}</b>${consent.signedAt ? ` on ${esc(fmtWhen(consent.signedAt))}` : ''}.</p>`}
    <div class="sign"><div>Signature of patient or guardian</div><div>Date</div><div>Received by (clinic staff)</div></div>
    <p class="note">Health answers on this form are the patient's own report. They are reviewed by the dentist and are not a diagnosis.</p>`;
  const w = window.open('', '_blank', 'width=860,height=980'); if (!w) return false;
  w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 250); return true;
}

const readFile = (file) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error('Could not read that file')); r.readAsDataURL(file); });

/**
 * One submission: where it stands, the answers, messages, files and audit trail.
 * `dentist` shows the dentist's actions and hides reception's; the server enforces the same split.
 */
export function SubmissionModal({ id, onClose, onChange, dentist = false, clinic = '' }) {
  const [pk, setPk] = useState(null);
  const [tab, setTab] = useState('answers');
  const [editing, setEditing] = useState(null);
  const [meta, setMeta] = useState(null);
  const [note, setNote] = useState('');
  const [run, busy] = useAction();
  const toast = useToast();
  const load = () => get(`/api/forms/${id}/detail`).then(setPk);
  useEffect(() => { load().catch((e) => toast(e.message, 'error')); get('/api/forms/sections').then(setMeta).catch(() => {}); }, [id]); // eslint-disable-line
  const act = (fn, ok) => run(async () => { await fn(); await load(); onChange?.(); }, ok);
  if (!pk) return <Modal title="Intake form" onClose={onClose} wide><div className="skeleton" /></Modal>;
  const iv = pk.intake; const link = linkFor(pk.token); const live = iv.status !== 'cancelled';
  const messaging = ['whatsapp', 'sms', 'email'].includes(iv.channel);
  const upload = async (file, kind) => { if (!file) return; if (file.size > 2_000_000) { toast('That file is over 2 MB. Take a smaller photo or scan.', 'error'); return; } const dataUrl = await readFile(file); act(() => post(`/api/forms/${id}/attachments`, { name: file.name, dataUrl, kind }), 'File attached'); };
  const openFile = (a) => run(async () => { const f = await get(`/api/forms/${id}/attachments/${a.id}`); const blob = await (await fetch(f.dataUrl)).blob(); window.open(URL.createObjectURL(blob), '_blank'); });
  const copy = async () => { try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch { toast(link); } };
  const fact = (l, v, sub) => <div><div className="tiny muted">{l}</div><div className="small strong">{v}</div>{sub && <div className="tiny muted">{sub}</div>}</div>;
  const open = (pk.clarifications || []).filter((c) => c.status !== 'resolved');

  return (
    <Modal title={`${fullName(pk.patient)} · intake form`} onClose={onClose} wide footer={<>
      <span className="grow" />
      {!dentist && live && !iv.submittedAt && messaging && <button className="btn" disabled={busy} onClick={() => act(() => post(`/api/forms/${id}/remind`), iv.sentAt ? 'Link sent again' : 'Form sent')}><IconSend size={15} />{iv.status === 'expired' ? 'Send a new link' : iv.sentAt ? 'Resend link' : 'Send link'}</button>}
      {!dentist && iv.submittedAt && !iv.review.admin && <button className="btn primary" disabled={busy} onClick={() => act(() => post(`/api/forms/${id}/review`, { kind: 'admin' }), 'Administrative check recorded')}><IconCheck size={15} />Mark admin check complete</button>}
      {dentist && iv.submittedAt && !iv.review.dentist && <button className="btn primary" disabled={busy} onClick={() => act(() => post(`/api/forms/${id}/review`, { kind: 'dentist' }), 'Review recorded')}><IconStethoscope size={15} />Record that I reviewed this</button>}
      <button className="btn" onClick={onClose}>Close</button></>}>
      <div className="row wrap gap-6"><IntakePill intake={iv} /><Pill tone="outline">{fmtWhen(pk.appointment?.start)}</Pill>{pk.visitType && <Pill tone="outline">{pk.visitType.name}</Pill>}{pk.provider && <Pill tone="outline">{pk.provider.name}</Pill>}<span className="grow" />
        <button className="btn sm ghost" onClick={() => printForm({ ...pk, consentText: meta?.consentText }, { clinic })}><IconPrinter size={14} />Print or save as PDF</button>
        {!dentist && live && <><button className="btn sm ghost" onClick={copy}><IconCopy size={14} />Copy link</button><a className="btn sm ghost" href={link} target="_blank" rel="noreferrer"><IconExternalLink size={14} />Open on this device</a></>}
      </div>
      <div className="iv-facts">
        {fact('Delivery channel', <ChannelTag id={iv.channel} />, messaging ? `${iv.messages} message${iv.messages === 1 ? '' : 's'}${iv.reminders ? `, ${iv.reminders} reminder${iv.reminders === 1 ? '' : 's'}` : ''}` : 'Completed at the clinic')}
        {fact('Message delivery', !messaging ? 'Not applicable' : deliveryLabel(iv.delivery), iv.delivery === 'unknown' ? 'No messaging provider is connected, so delivery cannot be confirmed' : iv.scheduledFor ? `Scheduled for ${fmtWhen(iv.scheduledFor)}` : null)}
        {fact('Link opened', iv.openedAt ? fmtWhen(iv.openedAt) : 'Not yet', iv.expiresAt && !iv.submittedAt ? `Link ${iv.expired ? 'expired' : 'valid until'} ${fmtWhen(iv.expiresAt)}` : null)}
        {fact('Submitted', iv.submittedAt ? fmtWhen(iv.submittedAt) : `${iv.percent}% complete`, iv.submittedAt ? sourceLabel(iv.source) : `${iv.done} of ${iv.total} parts`)}
        {fact('Admin check', iv.review.admin ? `Done by ${iv.review.admin.by}` : 'Pending', iv.review.admin ? ago(iv.review.admin.at) : 'Reception confirms details are complete')}
        {fact('Dentist review', iv.review.dentist ? `Reviewed by ${iv.review.dentist.by}` : 'Pending', iv.review.dentist ? ago(iv.review.dentist.at) : 'Recorded by the dentist only')}
      </div>
      {!dentist && pk.contactChanges.length > 0 && <div className="callout warn"><div className="row gap-6"><IconAlertCircle size={16} /><b>The patient gave contact details that differ from the record</b></div><div className="small mt-8">{pk.contactChanges.map((c) => <div key={c.field}>{c.field.replace(/([A-Z])/g, ' $1').toLowerCase()}: on record "{c.onRecord || 'blank'}", patient wrote "{c.reported}"</div>)}</div><button className="btn sm mt-8" disabled={busy} onClick={() => act(() => post(`/api/forms/${id}/apply-contact`), 'Patient record updated')}>Confirm and update the patient record</button></div>}
      {open.map((c) => (
        <div key={c.id} className="callout info"><div className="row gap-6 wrap"><b className="grow">{c.fromDentist ? `${c.by} asked for more information` : 'More information requested'}: {c.note}</b><Pill tone={c.status === 'answered' ? 'good' : c.status === 'sent' ? 'info' : 'warn'}>{c.status === 'open' ? 'Not sent to patient' : c.status === 'sent' ? 'Sent to patient' : 'Patient updated the form'}</Pill>
          {!dentist && c.status === 'open' && messaging && <button className="btn sm" disabled={busy} onClick={() => act(() => post(`/api/forms/${id}/clarify/${c.id}`, { action: 'send' }), 'Request sent to the patient')}>Send to patient</button>}
          <button className="btn sm ghost" disabled={busy} onClick={() => act(() => post(`/api/forms/${id}/clarify/${c.id}`, { action: 'resolve' }), 'Marked resolved')}>Mark resolved</button></div></div>))}

      <Seg value={tab} onChange={setTab} options={[{ value: 'answers', label: 'Answers' }, { value: 'messages', label: `Messages (${pk.messages.length})` }, { value: 'files', label: `Files (${pk.attachments.length})` }, { value: 'history', label: 'History' }]} />

      {tab === 'answers' && (<>
        {(pk.personal?.complete || pk.preferences?.complete) && <Card soft><div className="card-head"><h3>Personal information and preferences</h3><Pill tone="good">Given by the patient</Pill></div><Body><SectionSummary data={{ ...(pk.personal?.data || {}), ...(pk.preferences?.data ? { preferredChannel: pk.preferences.data.channel, reminders: pk.preferences.data.reminders, bestTimeToCall: pk.preferences.data.bestTime } : {}) }} /></Body></Card>}
        {Object.keys(FULL).map((k) => { const sec = pk.sections[k] || {}; return (
          <Card key={k} soft>
            <div className="card-head"><div className="row gap-6 wrap"><h3>{FULL[k]}</h3>{HEALTH.has(k) && <Pill tone="outline">Patient-reported</Pill>}{sec.complete ? <Pill tone="good">Complete{sec.by ? ` · ${sec.by}` : ''}</Pill> : sec.prefilled ? <Pill tone="info">Carried forward, needs confirmation</Pill> : <Pill tone="outline">Not started</Pill>}</div>
              {!dentist && live && <button className="btn sm ghost" onClick={() => setEditing(editing === k ? null : k)}>{editing === k ? 'Cancel' : sec.complete ? 'Edit' : 'Enter for patient'}</button>}</div>
            <Body>{editing === k ? <SectionForm sectionKey={k} initial={sec.data || {}} consentText={meta?.consentText} staff onSave={(data) => act(async () => { await put(`/api/forms/${id}/sections/${k}`, { data }); setEditing(null); return null; }, 'Saved. Your name is recorded against this entry.')} /> : <SectionSummary data={sec.data || {}} />}</Body>
          </Card>); })}
        {(pk.custom || []).map((c) => (
          <Card key={c.id} soft>
            <div className="card-head"><div className="row gap-6 wrap"><h3>{c.name}</h3>{c.complete ? <Pill tone="good">Complete{c.by ? ` · ${c.by}` : ''}</Pill> : <Pill tone="outline">Not started</Pill>}{c.complete && c.answeredVersion && c.answeredVersion !== c.version && <Pill tone="outline">Answered on version {c.answeredVersion}</Pill>}</div>
              {!dentist && live && <button className="btn sm ghost" onClick={() => setEditing(editing === c.id ? null : c.id)}>{editing === c.id ? 'Cancel' : c.complete ? 'Edit' : 'Enter for patient'}</button>}</div>
            <Body>{editing === c.id
              ? <CustomFields form={c} saveLabel="Save answers" onSave={(data) => act(async () => { await put(`/api/forms/${id}/custom/${c.id}`, { data }); setEditing(null); return null; }, 'Answers saved')} />
              : c.complete ? <div className="grid two small">{(c.answeredFields || c.fields).filter((f) => f.type !== 'info' && c.data[f.id]).map((f) => <div key={f.id}><div className="tiny muted">{f.label}</div><div>{c.data[f.id] === 'yes' ? 'Yes' : c.data[f.id] === 'no' ? 'No' : c.data[f.id]}</div></div>)}</div> : <div className="tiny muted">No answers yet.</div>}</Body>
          </Card>))}
        <div className="tiny muted">Health answers are the patient's own report. They are not a diagnosis and are not clinically verified by reception.</div>
        {live && <div className="row gap-6"><input className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder={dentist ? 'Ask reception to get more information, for example "Which blood thinner and what dose?"' : 'Ask the patient for missing information'} /><button className="btn" disabled={busy || note.trim().length < 3} onClick={() => act(async () => { const r = await post(`/api/forms/${id}/clarify`, { note }); setNote(''); return r; }, dentist ? 'Reception has been asked to follow up' : messaging ? 'Request sent to the patient with a secure link' : 'Request noted')}>{dentist ? 'Ask reception' : 'Request information'}</button></div>}
      </>)}

      {tab === 'messages' && (pk.messages.length === 0 ? <Empty>No messages have gone out for this form.</Empty> : <div className="iv-timeline">{pk.messages.map((m) => (
        <div key={m.id}><div className="row gap-6 wrap"><ChannelTag id={m.channel} /><Pill tone="outline">{{ invite: 'Invitation', reminder: 'Reminder', incomplete: 'Incomplete reminder', received: 'Received confirmation', clarify: 'Information request', expired: 'New link', paper: 'Paper follow-up' }[m.kind] || 'Message'}</Pill><Pill tone={m.delivery === 'failed' ? 'bad' : m.delivery === 'delivered' ? 'good' : 'outline'}>{deliveryLabel(m.delivery)}</Pill><span className="tiny muted">{fmtWhen(m.sentAt)} · {m.by}</span></div><div className="small mt-8">{m.body}</div>{m.error && <div className="tiny" style={{ color: 'var(--bad)' }}>{m.error}</div>}</div>))}</div>)}

      {tab === 'files' && (<>
        {!dentist && live && <div className="row gap-6 wrap">
          <label className="btn" style={{ cursor: 'pointer' }}><IconUpload size={15} />Upload scan of signed paper form<input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" style={{ display: 'none' }} onChange={(e) => { upload(e.target.files?.[0], 'paper_scan'); e.target.value = ''; }} /></label>
          <label className="btn ghost" style={{ cursor: 'pointer' }}><IconPaperclip size={15} />Attach another document<input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" style={{ display: 'none' }} onChange={(e) => { upload(e.target.files?.[0], 'document'); e.target.value = ''; }} /></label>
          {!iv.paper?.receivedAt && <button className="btn ghost" disabled={busy} onClick={() => act(() => post(`/api/forms/${id}/paper`, { received: true }), 'Paper form recorded as received')}>Record paper form received</button>}
          {iv.paper?.receivedAt && !iv.submittedAt && <button className="btn ghost" disabled={busy} onClick={() => act(() => post(`/api/forms/${id}/paper`, { submitted: true }), 'Signed paper form kept as the record')}>Keep the signed scan as the record</button>}
        </div>}
        {iv.paper?.receivedAt && <div className="small muted">Original paper form received {fmtWhen(iv.paper.receivedAt)} by {iv.paper.receivedBy}. Keep the signed original as your clinic's retention policy requires.</div>}
        {pk.attachments.length === 0 ? <Empty>No files attached.</Empty> : <div className="list">{pk.attachments.map((a) => (
          <div key={a.id} className="list-item"><IconPaperclip size={16} className="muted" /><div className="grow"><div className="small strong">{a.name}</div><div className="tiny muted">{a.kind === 'paper_scan' ? 'Scan of paper form' : 'Document'} · {Math.max(1, Math.round(a.size / 1024))} KB · {a.by} · {fmtWhen(a.at)}</div></div>
            <button className="btn sm" onClick={() => openFile(a)}>View</button>{!dentist && <button className="btn sm ghost" aria-label={`Remove ${a.name}`} disabled={busy} onClick={() => window.confirm(`Remove ${a.name}?`) && act(() => del(`/api/forms/${id}/attachments/${a.id}`), 'File removed')}><IconTrash size={14} /></button>}</div>))}</div>}
      </>)}

      {tab === 'history' && (<>
        <div className="iv-timeline">{(pk.history || []).map((h, i) => <div key={i}><div className="small"><b>{h.by}</b> · {h.action.replace(/_/g, ' ')}{h.detail ? `: ${h.detail}` : ''}</div><div className="tiny muted">{fmtWhen(h.at)}</div></div>)}{!(pk.history || []).length && <Empty>Nothing recorded yet.</Empty>}</div>
        {!dentist && live && !iv.submittedAt && <div><button className="btn sm ghost" disabled={busy} onClick={() => window.confirm('Cancel this form assignment? The link stops working and no more reminders go out.') && act(() => post(`/api/forms/${id}/cancel`), 'Assignment cancelled')}><IconBan size={14} />Cancel assignment</button></div>}
      </>)}
    </Modal>
  );
}

/** A row of the day list on the overview: who, where the form stands, and the one action that moves it on. */
export function IntakeCard({ p, onOpen, onChanged }) {
  const [run, busy] = useAction();
  const iv = p.intake; const messaging = ['whatsapp', 'sms', 'email'].includes(iv.channel);
  return (
    <div className={`iv-card ${iv.attention ? 'attention' : ''}`}>
      <div className="grow">
        <div className="row gap-6 wrap"><b>{fullName(p.patient)}</b><IntakePill intake={iv} />{iv.openClarifications > 0 && <Pill tone="warn">Information requested</Pill>}</div>
        <div className="small muted">{p.visitType?.name || 'Visit'} · {fmtTime(p.appointment.start)} · {p.provider?.name || 'Unassigned'}</div>
        <div className="row gap-6 wrap mt-8"><ChannelTag id={iv.channel} /><span className="iv-chan">{iv.submittedAt ? sourceLabel(iv.source) : iv.openedAt ? 'Opened' : iv.percent > 0 ? 'Started' : messaging && iv.sentAt ? 'Not opened' : messaging ? 'Not sent' : 'At the clinic'}</span>
          <span className="tiny muted">{iv.submittedAt ? `Completed ${fmtTime(iv.submittedAt)}` : iv.lastMessageAt ? `Last message ${ago(iv.lastMessageAt)}` : iv.scheduledFor ? `Sends ${fmtWhen(iv.scheduledFor)}` : ''}</span></div>
      </div>
      <div className="iv-card-side"><Progress percent={iv.percent} /><div className="tiny muted">{iv.percent}% complete</div>
        <div className="row gap-6" style={{ justifyContent: 'flex-end' }}>
          {!iv.submittedAt && messaging && iv.status !== 'cancelled' && <button className="btn sm" disabled={busy} onClick={() => run(async () => { await post(`/api/forms/${p.id}/remind`); onChanged?.(); }, iv.sentAt ? 'Link sent again' : 'Form sent')}>{iv.status === 'expired' ? 'New link' : iv.sentAt ? 'Resend link' : 'Send link'}</button>}
          <button className="btn sm primary" onClick={() => onOpen(p.id)}>{iv.submittedAt ? 'View submission' : !messaging ? 'Enter responses' : 'View details'}</button>
        </div>
      </div>
    </div>
  );
}

/** Owner report: how forms are doing, filterable by date, dentist and channel. */
export function IntakeReport({ providers = [] }) {
  const today = new Date(); const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const [f, setF] = useState({ from: iso(new Date(today.getTime() - 29 * 86400000)), to: iso(new Date(today.getTime() + 14 * 86400000)), providerId: '', channel: '' });
  const [d, setD] = useState(null); const [err, setErr] = useState('');
  const qs = useMemo(() => Object.entries(f).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&'), [f]);
  useEffect(() => { setErr(''); get(`/api/forms/report?${qs}`).then(setD).catch((e) => setErr(e.message)); }, [qs]);
  if (err) return <Card><Body><Empty>{err}</Empty></Body></Card>;
  const n = (v, suffix = '') => (v == null ? 'No data' : `${v}${suffix}`);
  const tile = (value, l, hint) => <div className="card stat"><div className="value">{value}</div><div className="label">{l}</div>{hint && <div className="hint">{hint}</div>}</div>;
  return (
    <>
      <div className="row gap-6 wrap mb-16" style={{ alignItems: 'flex-end' }}>
        <Field label="Appointments from"><input className="input" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label="To"><input className="input" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        <Field label="Dentist"><select className="input" value={f.providerId} onChange={(e) => setF({ ...f, providerId: e.target.value })}><option value="">All dentists</option>{providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Channel"><select className="input" value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}><option value="">All channels</option>{Object.entries(CHANNEL).map(([id, c]) => <option key={id} value={id}>{c.label}</option>)}</select></Field>
      </div>
      {!d ? <div className="skeleton" /> : (<>
        <div className="grid four mb-16">
          {tile(d.assigned, 'Forms assigned', d.cancelled ? `${d.cancelled} cancelled, not counted` : null)}
          {tile(n(d.completionRate, '%'), 'Completion rate', `${d.submitted} submitted, ${d.pending} pending`)}
          {tile(n(d.openRate, '%'), 'Link open rate', `${d.opened} opened of ${d.messaged} messaged`)}
          {tile(d.avgMinutesToComplete == null ? 'No data' : `${d.avgMinutesToComplete} min`, 'Average time to complete', 'From first answer to submission')}
        </div>
        <div className="grid four mb-16">
          {tile(n(d.beforeAppointmentRate, '%'), 'Completed before the visit', `${d.beforeAppointment} forms`)}
          {tile(n(d.reminderEffect, '%'), 'Submitted after a reminder', `${d.submittedAfterReminder} of ${d.reminded} reminded`)}
          {tile(d.awaitingReview, 'Awaiting dentist review', `${d.awaitingAdminCheck} awaiting admin check`)}
          {tile(d.failed, 'Failed messages', d.deliveryConfirmed ? `${d.deliveryConfirmed} confirmed delivered` : `Delivery not confirmed for ${d.deliveryUnknown}`)}
        </div>
        <div className="grid two">
          <Card title="By delivery channel"><table className="table"><thead><tr><th>Channel</th><th>Assigned</th><th>Submitted</th><th>Completion</th><th>Failed</th></tr></thead><tbody>{d.byChannel.map((c) => <tr key={c.channel}><td><ChannelTag id={c.channel} /></td><td className="mono small">{c.assigned}</td><td className="mono small">{c.submitted}</td><td className="mono small">{n(c.completionRate, '%')}</td><td className="mono small">{c.failed}</td></tr>)}{!d.byChannel.length && <tr><td colSpan={5}><Empty>No forms in this period.</Empty></td></tr>}</tbody></table></Card>
          <Card title="By dentist"><table className="table"><thead><tr><th>Dentist</th><th>Assigned</th><th>Submitted</th><th>Awaiting review</th></tr></thead><tbody>{d.byProvider.map((c) => <tr key={c.providerId}><td className="small">{c.name}</td><td className="mono small">{c.assigned}</td><td className="mono small">{c.submitted}</td><td className="mono small">{c.awaitingReview}</td></tr>)}{!d.byProvider.length && <tr><td colSpan={4}><Empty>No forms in this period.</Empty></td></tr>}</tbody></table></Card>
          <Card title="Paper and digital submissions"><Body className="col gap-6">{d.bySource.length ? d.bySource.map((s) => <div key={s.source} className="row between small"><span>{sourceLabel(s.source)}</span><b className="mono">{s.count}</b></div>) : <span className="small muted">No submissions in this period.</span>}</Body></Card>
          <Card title="Pending forms by branch"><Body className="col gap-6">{d.pendingByBranch.length ? d.pendingByBranch.map((s) => <div key={s.locationId} className="row between small"><span>{s.name}</span><b className="mono">{s.pending}</b></div>) : <span className="small muted">Nothing pending.</span>}</Body></Card>
        </div>
        <p className="tiny muted mt-16">Delivery is counted only when a messaging provider confirms it. Without a connected provider, messages are shown as not confirmed.</p>
      </>)}
    </>
  );
}

/** Reminder rules and the message templates behind every intake message. Owners and admins edit; everyone can read. */
export function IntakeAutomation({ view = 'messages' }) {
  const [d, setD] = useState(null);
  const [s, setS] = useState(null);
  const [edit, setEdit] = useState(null);
  const [run, busy] = useAction();
  const load = () => get('/api/forms/intake-settings').then((x) => { setD(x); setS(x.settings); });
  useEffect(() => { load(); }, []);
  if (!d) return <div className="skeleton" />;
  const sample = { firstName: 'Ananya', practice: 'your clinic', when: 'Tuesday, 24 November, 10:30 am', time: '10:30 am', visitType: 'New patient visit', provider: 'Dr. Mehta', location: 'Main', phone: '080 0000 0000', formsLink: 'https://your-clinic/#/forms/secure-link', note: 'Please tell us which blood thinner you take.' };
  const preview = (text) => String(text || '').replace(/\{\{(\w+)\}\}/g, (_, k) => sample[k] ?? '');
  const saveTpl = () => run(async () => { await put(`/api/forms/message-templates/${edit.id}`, { body: edit.body }); setEdit(null); await load(); }, 'Template saved');
  const saveSettings = () => run(async () => { const r = await put('/api/forms/intake-settings', s); setS(r.settings); }, 'Settings saved');
  if (view === 'settings') return (
    <div className="grid two">
      <Card title="Reminders"><Body className="col gap-12">
        <label className="check"><input type="checkbox" disabled={!d.canEdit} checked={s.autoRemind} onChange={(e) => setS({ ...s, autoRemind: e.target.checked })} />Send reminders automatically while a form is not submitted</label>
        <Field label="Hours before the appointment" hint="Comma separated. One reminder goes out at each point, for example 24, 4."><input className="input" disabled={!d.canEdit} value={s.remindHoursBefore.join(', ')} onChange={(e) => setS({ ...s, remindHoursBefore: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></Field>
        <Field label="Most reminders per form"><input className="input" style={{ maxWidth: 120 }} type="number" min={0} max={6} disabled={!d.canEdit} value={s.maxReminders} onChange={(e) => setS({ ...s, maxReminders: e.target.value })} /></Field>
        <div className="grid two"><Field label="Quiet hours start"><input className="input" type="time" disabled={!d.canEdit} value={s.quietStart} onChange={(e) => setS({ ...s, quietStart: e.target.value })} /></Field><Field label="Quiet hours end"><input className="input" type="time" disabled={!d.canEdit} value={s.quietEnd} onChange={(e) => setS({ ...s, quietEnd: e.target.value })} /></Field></div>
        <div className="tiny muted">No automatic message goes out during quiet hours, after a submission, after a cancellation, or to a patient who switched reminders off.</div>
      </Body></Card>
      <Card title="Links and confirmations"><Body className="col gap-12">
        <Field label="Link stays valid for this many days after the appointment" hint="After that the link shows as expired. Resending issues a new link."><input className="input" style={{ maxWidth: 120 }} type="number" min={0} max={30} disabled={!d.canEdit} value={s.linkValidDaysAfter} onChange={(e) => setS({ ...s, linkValidDaysAfter: e.target.value })} /></Field>
        <label className="check"><input type="checkbox" disabled={!d.canEdit} checked={s.confirmOnSubmit} onChange={(e) => setS({ ...s, confirmOnSubmit: e.target.checked })} />Tell the patient when their form is received</label>
        {d.canEdit ? <div><button className="btn primary" disabled={busy} onClick={saveSettings}>Save settings</button></div> : <div className="tiny muted">Only owners and admins can change these.</div>}
      </Body></Card>
    </div>
  );
  return (
    <>
      <Card title="What happens automatically"><Body><div className="iv-flow">
        {[['Form assigned', 'The invitation goes out on the chosen channel, now or at the time you set.'], ...s.remindHoursBefore.map((h) => [`${h} hours before`, 'A reminder goes out if the form is still not submitted.']), ['Patient submits', `Reminders stop.${s.confirmOnSubmit ? ' The patient gets a short confirmation.' : ''} Reception sees it under Submissions.`], ['Not submitted', 'It stays under Needs attention so reception can complete it at the clinic.'], ['Appointment moved or cancelled', 'Reminder times and link expiry follow the new time. A cancelled visit gets no reminders.']].map(([t, x], i) => <div key={i}><span>{i + 1}</span><div><b>{t}</b><div className="small muted">{x}</div></div></div>)}
      </div>{!s.autoRemind && <div className="callout warn small mt-8">Automatic reminders are switched off. Turn them on under Settings.</div>}</Body></Card>
      <Card className="mt-16" title="Message templates">
        <table className="table"><thead><tr><th>Template</th><th>Sent when</th><th>Languages</th><th>English wording</th><th /></tr></thead><tbody>{d.templates.map((t) => (
          <tr key={t.id}><td className="small strong">{t.name}</td><td className="small">{t.trigger}</td><td className="small">{Object.keys(t.body).map((l) => d.languages.find((x) => x.code === l)?.name || l).join(', ')}</td><td className="small muted" style={{ maxWidth: 380 }}>{preview(t.body.en)}</td><td className="right"><button className="btn sm ghost" onClick={() => setEdit({ ...t, body: { ...t.body } })}>{d.canEdit ? 'Edit' : 'View'}</button></td></tr>))}</tbody></table>
      </Card>
      <p className="tiny muted mt-16">WhatsApp may require a template to be approved by your provider before it can be used for the first message to a patient. Messages are kept in the clinic outbox until a provider is connected under Settings.</p>
      {edit && (
        <Modal title={edit.name} onClose={() => setEdit(null)} wide footer={<><span className="small muted grow">Placeholders: {d.variables.map((v) => `{{${v}}}`).join(' ')}</span><button className="btn" onClick={() => setEdit(null)}>Close</button>{d.canEdit && <button className="btn primary" disabled={busy} onClick={saveTpl}>Save template</button>}</>}>
          <div className="small muted">Sent when: {edit.trigger}. The message carries the secure link, never the questions or answers.</div>
          {d.languages.map((l) => (
            <div key={l.code} className="grid two"><Field label={l.name}><textarea className="input" rows={4} disabled={!d.canEdit} value={edit.body[l.code] || ''} onChange={(e) => setEdit({ ...edit, body: { ...edit.body, [l.code]: e.target.value } })} placeholder={l.code === 'en' ? '' : 'Leave blank to send the English wording'} /></Field><Field label="Preview with sample details"><div className="iv-bubble">{preview(edit.body[l.code] || edit.body.en)}</div></Field></div>))}
        </Modal>)}
    </>
  );
}

export { IconClock };
