import React, { useEffect, useMemo, useState } from 'react';
import { IconSend, IconPencil, IconPlus, IconTrash, IconArrowUp, IconArrowDown, IconUpload, IconWand, IconCopy, IconEye, IconPrinter, IconSearch } from '@tabler/icons-react';
import { get, post, put, del } from '../lib/api.js';
import { fmtWhen, fmtDateLong, fullName, ago, fmtPhone, todayKey, dayKey, addDaysKey } from '../lib/format.js';
import { Card, Body, Pill, Avatar, Empty, usePoll, useAction, Modal, Field, Seg } from '../components/ui.jsx';
import { CustomFields } from './Forms.jsx';
import { AssignModal, SubmissionModal, IntakeCard, IntakePill, ChannelTag, Progress, IntakeReport, IntakeAutomation, CHANNEL, sourceLabel, deliveryLabel, printForm } from './Intake.jsx';

const TABS = [
  { id: 'overview', label: 'Overview' }, { id: 'assignments', label: 'All assignments' }, { id: 'submissions', label: 'Submissions' },
  { id: 'templates', label: 'Form templates' }, { id: 'messages', label: 'Messages and reminders' }, { id: 'paper', label: 'Paper forms' },
  { id: 'reports', label: 'Reports', manage: true }, { id: 'settings', label: 'Settings' },
];
const GROUPS = [{ value: '', label: 'Every status' }, { value: 'pending', label: 'Pending' }, { value: 'attention', label: 'Needs attention' }, { value: 'submitted', label: 'Submitted' }, { value: 'cancelled', label: 'Cancelled' }];

/** Pre-visit forms: assign, send, track, review. One list of assignments drives every tab. */
export default function PreVisit({ hash, me }) {
  const params = new URLSearchParams(hash.split('?')[1] || '');
  const tabs = TABS.filter((t) => !t.manage || me?.canManage);
  const [tab, setTab] = useState(() => (params.get('view') === 'forms' ? 'templates' : tabs.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'overview'));
  const [past, setPast] = useState(false);
  const { data, reload } = usePoll(() => get(`/api/forms${past ? '?upcoming=false' : ''}`), [past], 8000);
  const [open, setOpen] = useState(params.get('packet') || null);
  const [assign, setAssign] = useState(false);
  const [clinic, setClinic] = useState({ name: '', providers: [] });
  const [day, setDay] = useState(todayKey());
  const [f, setF] = useState({ q: '', group: '', channel: '', providerId: '', when: 'upcoming' });
  useEffect(() => { get('/api/settings').then((s) => setClinic({ name: s.practice?.name || '', providers: s.providers || [] })).catch(() => {}); }, []);
  useEffect(() => { setPast(f.when === 'all'); }, [f.when]);

  const all = data || [];
  const today = all.filter((p) => dayKey(p.appointment.start) === day);
  const count = (list, g) => list.filter((p) => p.intake.group === g).length;
  const rows = useMemo(() => all.filter((p) => (!f.group || p.intake.group === f.group) && (!f.channel || p.intake.channel === f.channel) && (!f.providerId || p.appointment.providerId === f.providerId)
    && (f.when !== 'today' || dayKey(p.appointment.start) === todayKey()) && (!f.q.trim() || `${fullName(p.patient)} ${p.patient?.phone || ''}`.toLowerCase().includes(f.q.trim().toLowerCase()))), [all, f]);
  const submitted = all.filter((p) => p.intake.group === 'submitted');
  const inClinic = all.filter((p) => ['print', 'tablet'].includes(p.intake.channel) || p.intake.paper);
  const kpi = (value, label, group, tone) => <button className={`iv-kpi ${tone}`} onClick={() => { setF({ ...f, group, when: 'upcoming' }); setTab('assignments'); }}><b>{data ? value : ''}</b><span>{label}</span></button>;

  return (
    <>
      <div className="page-head">
        <div><h1>Pre-visit forms</h1><p>Assign an intake form, send a secure link, and see who has opened, finished or still needs help before they arrive.</p></div>
        <button className="btn primary" onClick={() => setAssign(true)}><IconPlus size={16} />Assign form</button>
      </div>
      <div className="iv-tabs" role="tablist">{tabs.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}{t.id === 'submissions' && submitted.filter((p) => !p.intake.review.admin).length > 0 ? <i>{submitted.filter((p) => !p.intake.review.admin).length}</i> : null}</button>)}</div>

      {tab === 'overview' && (<>
        <div className="iv-kpis">
          {kpi(count(all, 'pending') + count(all, 'attention') + count(all, 'submitted'), 'Assigned', '', '')}
          {kpi(count(all, 'submitted'), 'Submitted', 'submitted', 'good')}
          {kpi(count(all, 'pending'), 'Pending', 'pending', 'warn')}
          {kpi(count(all, 'attention'), 'Needs attention', 'attention', 'bad')}
        </div>
        <Card title={day === todayKey() ? "Today's patient forms" : 'Patient forms'} actions={<><button className="btn sm ghost" onClick={() => setDay(addDaysKey(day, -1))} aria-label="Previous day">Earlier</button><input className="input" style={{ width: 160 }} type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Day" /><button className="btn sm ghost" onClick={() => setDay(addDaysKey(day, 1))} aria-label="Next day">Later</button></>}>
          <Body className="col gap-10">
            <div className="small muted">{fmtDateLong(day)} · {today.length} {today.length === 1 ? 'form' : 'forms'}</div>
            {!data ? <div className="skeleton" /> : today.length === 0 ? <Empty>No forms are assigned for this day. Use Assign form to send one for an upcoming appointment.</Empty>
              : today.map((p) => <IntakeCard key={p.id} p={p} onOpen={setOpen} onChanged={reload} />)}
          </Body>
        </Card>
      </>)}

      {tab === 'assignments' && (<>
        <div className="iv-filters">
          <div className="iv-search"><IconSearch size={15} /><input className="input" placeholder="Search patient or mobile" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div>
          <select className="input" value={f.when} onChange={(e) => setF({ ...f, when: e.target.value })} aria-label="Appointment date"><option value="today">Today</option><option value="upcoming">Today and upcoming</option><option value="all">Include past visits</option></select>
          <select className="input" value={f.group} onChange={(e) => setF({ ...f, group: e.target.value })} aria-label="Status">{GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}</select>
          <select className="input" value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })} aria-label="Delivery channel"><option value="">Every channel</option>{Object.entries(CHANNEL).map(([id, c]) => <option key={id} value={id}>{c.label}</option>)}</select>
          <select className="input" value={f.providerId} onChange={(e) => setF({ ...f, providerId: e.target.value })} aria-label="Dentist"><option value="">Every dentist</option>{clinic.providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </div>
        <Card><div className="iv-scroll"><table className="table">
          <thead><tr><th>Patient</th><th>Appointment</th><th>Channel</th><th>Sent</th><th>Delivery</th><th>Opened</th><th>Completion</th><th>Status</th><th>Review</th><th /></tr></thead>
          <tbody>{rows.map((p) => { const iv = p.intake; const msg = ['whatsapp', 'sms', 'email'].includes(iv.channel); return (
            <tr key={p.id}>
              <td><div className="row"><Avatar patient={p.patient} /><div><div className="small strong">{fullName(p.patient)}</div><div className="tiny muted">{fmtPhone(p.patient?.phone)}</div></div></div></td>
              <td><div className="small strong">{fmtWhen(p.appointment.start)}</div><div className="tiny muted">{p.visitType?.name} · {p.provider?.name}</div></td>
              <td><ChannelTag id={iv.channel} /></td>
              <td className="tiny muted">{iv.sentAt ? `${ago(iv.sentAt)}${iv.reminders ? ` · ${iv.reminders} reminder${iv.reminders > 1 ? 's' : ''}` : ''}` : iv.scheduledFor ? `Scheduled ${fmtWhen(iv.scheduledFor)}` : msg ? 'Not sent' : 'At the clinic'}</td>
              <td className="tiny">{msg ? deliveryLabel(iv.delivery) : 'Not applicable'}</td>
              <td className="tiny muted">{iv.openedAt ? ago(iv.openedAt) : 'No'}</td>
              <td style={{ minWidth: 110 }}><Progress percent={iv.percent} /><div className="tiny muted">{iv.submittedAt ? `${sourceLabel(iv.source)}, ${ago(iv.submittedAt)}` : `${iv.percent}%`}</div></td>
              <td><IntakePill intake={iv} /></td>
              <td className="tiny">{!iv.submittedAt ? '' : iv.review.dentist ? 'Dentist reviewed' : iv.review.admin ? 'Admin checked' : 'Awaiting check'}</td>
              <td className="right"><button className="btn sm" onClick={() => setOpen(p.id)}>Open</button></td>
            </tr>); })}
            {data && rows.length === 0 && <tr><td colSpan={10}><Empty>No assignments match these filters.</Empty></td></tr>}</tbody>
        </table></div></Card>
      </>)}

      {tab === 'submissions' && (
        <Card title={`Submitted forms (${submitted.length})`}><div className="iv-scroll"><table className="table">
          <thead><tr><th>Patient</th><th>Appointment</th><th>Submitted</th><th>Source</th><th>Admin check</th><th>Dentist review</th><th /></tr></thead>
          <tbody>{submitted.map((p) => { const iv = p.intake; return (
            <tr key={p.id}>
              <td><div className="small strong">{fullName(p.patient)}</div>{p.contactChanges.length > 0 && <div className="tiny" style={{ color: 'var(--marigold)' }}>Contact details differ from the record</div>}</td>
              <td><div className="small">{fmtWhen(p.appointment.start)}</div><div className="tiny muted">{p.provider?.name}</div></td>
              <td className="small">{fmtWhen(iv.submittedAt)}</td><td className="small">{sourceLabel(iv.source)}</td>
              <td>{iv.review.admin ? <Pill tone="good">{iv.review.admin.by}</Pill> : <Pill tone="warn">Pending</Pill>}</td>
              <td>{iv.review.dentist ? <Pill tone="good">{iv.review.dentist.by}</Pill> : <Pill tone="outline">Pending</Pill>}</td>
              <td className="right"><button className="btn sm" onClick={() => setOpen(p.id)}>View submission</button></td>
            </tr>); })}
            {data && submitted.length === 0 && <tr><td colSpan={7}><Empty>Nothing has been submitted yet for upcoming visits.</Empty></td></tr>}</tbody>
        </table></div></Card>)}

      {tab === 'templates' && <FormLibrary onChanged={reload} />}
      {tab === 'messages' && <IntakeAutomation view="messages" />}
      {tab === 'settings' && <IntakeAutomation view="settings" />}
      {tab === 'reports' && <IntakeReport providers={clinic.providers} />}

      {tab === 'paper' && (<>
        <div className="grid two mb-16">
          <Card title="Print a form"><Body className="col gap-10">
            <div className="small muted">A blank form for the clipboard, or a patient's own form with their appointment details filled in. To print for one patient, assign the form with the Paper channel and open it.</div>
            <div className="row gap-6 wrap"><button className="btn" onClick={() => printForm(null, { blank: true, clinic: clinic.name })}><IconPrinter size={15} />Print blank form</button><button className="btn ghost" onClick={() => setAssign(true)}><IconPlus size={15} />Assign for the clinic</button></div>
          </Body></Card>
          <Card title="When the paper comes back"><Body className="small col gap-6">
            <div>1. Open the patient's form and record that the paper form was received.</div>
            <div>2. Upload a scan or photo of the signed form.</div>
            <div>3. Type the answers in on the patient's behalf (your name is recorded), or keep the signed scan as the record.</div>
            <div className="muted">Keep the signed original for as long as your clinic's retention policy says. Your clinic decides which signatures it accepts: a typed name or a scan is recorded here as evidence, not certified as a legal electronic signature.</div>
          </Body></Card>
        </div>
        <Card title={`In-clinic and paper forms (${inClinic.length})`}><div className="iv-scroll"><table className="table">
          <thead><tr><th>Patient</th><th>Appointment</th><th>How</th><th>Paper received</th><th>Files</th><th>Status</th><th /></tr></thead>
          <tbody>{inClinic.map((p) => (
            <tr key={p.id}><td className="small strong">{fullName(p.patient)}</td><td className="small">{fmtWhen(p.appointment.start)}</td><td><ChannelTag id={p.intake.channel} /></td>
              <td className="small">{p.intake.paper?.receivedAt ? fmtWhen(p.intake.paper.receivedAt) : 'Not yet'}</td><td className="mono small">{p.intake.attachments}</td><td><IntakePill intake={p.intake} /></td>
              <td className="right"><div className="row gap-6" style={{ justifyContent: 'flex-end' }}><button className="btn sm ghost" onClick={() => printForm(p, { clinic: clinic.name })}><IconPrinter size={14} />Print</button><button className="btn sm" onClick={() => setOpen(p.id)}>{p.intake.submittedAt ? 'View' : 'Enter responses'}</button></div></td></tr>))}
            {data && inClinic.length === 0 && <tr><td colSpan={7}><Empty>No forms are set for paper or the clinic tablet.</Empty></td></tr>}</tbody>
        </table></div></Card>
      </>)}

      {open && <SubmissionModal id={open} clinic={clinic.name} onClose={() => setOpen(null)} onChange={reload} />}
      {assign && <AssignModal onClose={() => setAssign(false)} onDone={(pk) => { reload(); if (['print', 'tablet'].includes(pk?.intake?.channel)) setOpen(pk.id); }} />}
    </>
  );
}

const TYPE_LABEL = { text: 'Short answer', textarea: 'Long answer', yesno: 'Yes / No', choice: 'Choose one', checkbox: 'Choose any that apply', date: 'Date', phone: 'Phone number', email: 'Email address', info: 'Statement to read', signature: 'Signature (typed name)' };
const hasOptions = (t) => t === 'choice' || t === 'checkbox';
const blankField = (type = 'text') => ({ id: `new_${Math.random().toString(36).slice(2, 8)}`, label: '', type, options: hasOptions(type) ? ['', ''] : [], required: type === 'signature', showIf: null });

/** The clinic's own forms: add, edit, switch on or off, send to everyone with an upcoming visit, and see how many have answered. */
function FormLibrary({ onChanged }) {
  const [data, setData] = useState(null);
  const [edit, setEdit] = useState(null); // a form being created or edited
  const [prompt, setPrompt] = useState('');
  const [note, setNote] = useState('');
  const [run, busy] = useAction();
  const load = () => get('/api/forms/templates').then(setData);
  useEffect(() => { load(); }, []);
  if (!data) return <div className="skeleton" />;
  const start = (form, why = '') => { setNote(why); setEdit({ name: '', description: '', fields: [blankField()], appliesTo: 'all', visitTypeIds: [], active: true, ...form }); };
  const draft = () => run(async () => { const r = await post('/api/forms/templates/draft', { prompt }); start(r.form, r.engine === 'claude' ? 'Drafted by Claude from your description. Read every line and edit before you save.' : 'Drafted from a built-in template that matches your description. Connect Claude in Settings for free-form drafts. Edit before you save.'); setPrompt(''); });
  const upload = (file) => { if (!file) return; const reader = new FileReader(); reader.onload = () => run(async () => { const r = await post('/api/forms/templates/import', { text: String(reader.result), name: file.name }); start(r.form, `Read ${r.form.fields.length} questions from ${file.name}. Check each answer type before you save.`); }); reader.readAsText(file); };
  const save = () => run(async () => { const body = { ...edit, fields: edit.fields.map((f) => ({ ...f, options: (f.options || []).filter((o) => o.trim()) })) }; if (edit.id) await put(`/api/forms/templates/${edit.id}`, body); else await post('/api/forms/templates', body); setEdit(null); await load(); onChanged?.(); }, edit?.id ? 'Form saved' : 'Form added. It now goes out with pre-visit forms.');
  const toggle = (f) => run(async () => { await put(`/api/forms/templates/${f.id}`, { ...f, active: !f.active }); await load(); onChanged?.(); }, f.active ? 'Form switched off' : 'Form switched on');
  const sendAll = (f) => { if (!window.confirm(`Send "${f.name}" now to every patient with an upcoming visit who has not answered it?`)) return; run(async () => { const r = await post(`/api/forms/templates/${f.id}/send`); await load(); onChanged?.(); return r; }, 'Sent to patients with upcoming visits'); };
  const duplicate = (f) => run(async () => { await post(`/api/forms/templates/${f.id}/duplicate`); await load(); }, 'Copy made. It is switched off until you turn it on.');
  const remove = (f) => { if (!window.confirm(`Delete "${f.name}"? Answers patients already gave are kept on their records.`)) return; run(async () => { await del(`/api/forms/templates/${f.id}`); await load(); onChanged?.(); }, 'Form deleted'); };
  const who = (f) => (f.appliesTo === 'all' ? 'Every visit' : f.visitTypeIds.map((v) => data.visitTypes.find((x) => x.id === v)?.name || v).join(', '));

  return (
    <>
      <div className="grid two mb-16">
        <Card title={<span className="row gap-6"><IconWand size={16} />Describe a form and get a draft</span>}>
          <Body className="col gap-10">
            <div className="small muted">Say what you need in a sentence. You get a draft to edit. Nothing is sent until you save it.</div>
            <div className="row gap-6"><input className="input" value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && prompt.trim().length > 3 && draft()} placeholder="e.g. consent form for tooth extraction" /><button className="btn primary" disabled={busy || prompt.trim().length < 4} onClick={draft}>Draft it</button></div>
            <div className="row gap-6 wrap">{['Photo consent', 'Health screening for today', 'Feedback after a visit', 'Consent for root canal treatment'].map((x) => <button key={x} className="btn sm ghost" disabled={busy} onClick={() => setPrompt(x)}>{x}</button>)}</div>
          </Body>
        </Card>
        <Card title="Start another way">
          <Body className="col gap-10">
            <div className="row gap-6 wrap">
              <button className="btn" onClick={() => start({})}><IconPlus size={15} />Blank form</button>
              <label className="btn" style={{ cursor: 'pointer' }}><IconUpload size={15} />Upload questions<input type="file" accept=".txt,.csv,text/plain,text/csv" style={{ display: 'none' }} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} /></label>
            </div>
            <div className="tiny muted">Upload a .txt file with one question per line, or a .csv with the columns question, type, options, required.</div>
            <div className="field-label">Ready-made forms</div>
            <div className="row gap-6 wrap">{data.starters.map((st) => <button key={st.key} className="btn sm" onClick={() => start({ name: st.name, description: st.description, fields: st.fields.map((f) => ({ ...blankField(f.type), ...f })) }, 'A ready-made form. Change the wording to match your clinic before you save.')}><IconCopy size={13} />{st.name}</button>)}</div>
          </Body>
        </Card>
      </div>

      <Card title={`Your forms (${data.forms.length})`}>
        {data.forms.length === 0 ? <Body><Empty>You have not added any forms yet. Start with a general consent form: it takes a minute.</Empty></Body> : (
          <table className="table">
            <thead><tr><th>Form</th><th>Goes with</th><th>Status</th><th>Sent to</th><th>Answered</th><th /></tr></thead>
            <tbody>{data.forms.map((f) => (
              <tr key={f.id}>
                <td><div className="small strong">{f.name} <span className="tiny muted">v{f.version || 1}</span></div><div className="tiny muted">{f.fields.filter((x) => x.type !== 'info').length} questions{f.description ? ` · ${f.description}` : ''}</div></td>
                <td className="small">{who(f)}</td>
                <td><button className={`pill ${f.active ? 'good' : 'outline'}`} style={{ cursor: 'pointer', border: 0 }} disabled={busy} onClick={() => toggle(f)} title={f.active ? 'Click to switch off' : 'Click to switch on'}>{f.active ? 'On' : 'Off'}</button></td>
                <td className="mono small">{f.sentTo}</td>
                <td className="mono small">{f.answered}</td>
                <td className="right"><div className="row gap-6" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn sm ghost" onClick={() => start(f)}><IconPencil size={14} />Edit</button>
                  <button className="btn sm" disabled={busy || !f.active} onClick={() => sendAll(f)}><IconSend size={14} />Send to all</button>
                  <button className="btn sm ghost" disabled={busy} onClick={() => duplicate(f)} aria-label={`Duplicate ${f.name}`} title="Duplicate"><IconCopy size={14} /></button>
                  <button className="btn sm ghost" disabled={busy} onClick={() => remove(f)} aria-label={`Delete ${f.name}`}><IconTrash size={14} /></button>
                </div></td>
              </tr>))}</tbody>
          </table>)}
      </Card>
      {edit && <FormEditor form={edit} setForm={setEdit} note={note} visitTypes={data.visitTypes} busy={busy} onSave={save} onClose={() => setEdit(null)} />}
    </>
  );
}

function FormEditor({ form, setForm, note, visitTypes, busy, onSave, onClose }) {
  const [preview, setPreview] = useState(false);
  const set = (p) => setForm({ ...form, ...p });
  const setField = (i, p) => set({ fields: form.fields.map((f, k) => (k === i ? { ...f, ...p } : f)) });
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= form.fields.length) return; const fs = [...form.fields]; [fs[i], fs[j]] = [fs[j], fs[i]]; set({ fields: fs }); };
  const questions = form.fields.filter((f) => f.type !== 'info' && f.label.trim()).length;
  const problem = !form.name.trim() ? 'Give the form a name.' : !questions ? 'Add at least one question.' : form.fields.some((f) => hasOptions(f.type) && f.label.trim() && (f.options || []).filter((o) => o.trim()).length < 2) ? 'A question with choices needs at least two of them.' : form.appliesTo === 'visitTypes' && !form.visitTypeIds.length ? 'Choose at least one visit type.' : '';
  return (
    <Modal title={form.id ? 'Edit form' : 'New form'} onClose={onClose} wide footer={<><span className="small muted grow">{problem || `${questions} ${questions === 1 ? 'question' : 'questions'}`}</span><button className="btn ghost" onClick={() => setPreview(!preview)}><IconEye size={15} />{preview ? 'Back to editing' : 'Preview as patient'}</button><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !!problem} onClick={onSave}>{form.id ? 'Save form' : 'Add form'}</button></>}>
      {note && <div className="callout small">{note}</div>}
      {preview ? <div className="cf-preview"><h3>{form.name || 'Untitled form'}</h3>{form.description && <p className="small muted">{form.description}</p>}<CustomFields form={{ ...form, fields: form.fields.filter((f) => f.label.trim()).map((f) => ({ ...f, options: (f.options || []).filter((o) => o.trim()) })), data: {} }} onSave={() => {}} saveLabel="Save and continue" /></div> : (<>
        <div className="grid two">
          <Field label="Form name"><input className="input" value={form.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} placeholder="General consent for dental treatment" autoFocus /></Field>
          <Field label="Short note for the patient" hint="Optional"><input className="input" value={form.description} maxLength={200} onChange={(e) => set({ description: e.target.value })} placeholder="Signed once before treatment begins." /></Field>
        </div>
        <div>
          <div className="field-label">Who gets this form</div>
          <div className="row gap-6 wrap mt-8"><Seg value={form.appliesTo} onChange={(v) => set({ appliesTo: v })} options={[{ value: 'all', label: 'Every visit' }, { value: 'visitTypes', label: 'Only some visit types' }]} />
            {form.appliesTo === 'visitTypes' && visitTypes.map((v) => <label key={v.id} className="check small"><input type="checkbox" checked={form.visitTypeIds.includes(v.id)} onChange={(e) => set({ visitTypeIds: e.target.checked ? [...form.visitTypeIds, v.id] : form.visitTypeIds.filter((x) => x !== v.id) })} />{v.name}</label>)}</div>
        </div>
        <div className="cf-edit">
          {form.fields.map((f, i) => (
            <div key={f.id} className="cf-row">
              <span className="num">{i + 1}</span>
              <div className="grow col gap-6">
                <div className="row gap-6">
                  {f.type === 'info' ? <textarea className="input" rows={2} value={f.label} onChange={(e) => setField(i, { label: e.target.value })} placeholder="The statement the patient reads" /> : <input className="input" value={f.label} onChange={(e) => setField(i, { label: e.target.value })} placeholder="Question" />}
                  <select className="input" style={{ width: 210, flex: 'none' }} value={f.type} onChange={(e) => setField(i, { type: e.target.value, options: hasOptions(e.target.value) ? (f.options?.length ? f.options : ['', '']) : [], required: e.target.value === 'info' ? false : f.required })} aria-label="Answer type">{Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                </div>
                {hasOptions(f.type) && <div className="row gap-6 wrap">{(f.options || []).map((o, k) => <input key={k} className="input" style={{ width: 170 }} value={o} placeholder={`Choice ${k + 1}`} onChange={(e) => setField(i, { options: f.options.map((x, n) => (n === k ? e.target.value : x)) })} />)}<button className="btn sm ghost" onClick={() => setField(i, { options: [...(f.options || []), ''] })}><IconPlus size={13} />Add choice</button></div>}
                {f.type !== 'info' && <label className="check small"><input type="checkbox" checked={!!f.required} onChange={(e) => setField(i, { required: e.target.checked })} />The patient must answer this</label>}
                {(() => { const deps = form.fields.slice(0, i).filter((x) => (x.type === 'yesno' || x.type === 'choice') && x.label.trim()); if (!deps.length) return null; const dep = deps.find((x) => x.id === f.showIf?.fieldId); const opts = dep ? (dep.type === 'yesno' ? ['yes', 'no'] : (dep.options || []).filter((o) => o.trim())) : [];
                  return <div className="row gap-6 wrap small"><span className="muted">Show</span><select className="input" style={{ width: 250 }} value={f.showIf?.fieldId || ''} onChange={(e) => { const d = deps.find((x) => x.id === e.target.value); setField(i, { showIf: d ? { fieldId: d.id, equals: d.type === 'yesno' ? 'yes' : (d.options || []).find((o) => o.trim()) || '' } : null }); }} aria-label="Show this question"><option value="">always</option>{deps.map((x) => <option key={x.id} value={x.id}>only if: {x.label.slice(0, 40)}</option>)}</select>
                    {dep && <><span className="muted">is</span><select className="input" style={{ width: 150 }} value={f.showIf.equals} onChange={(e) => setField(i, { showIf: { ...f.showIf, equals: e.target.value } })} aria-label="Answer">{opts.map((o) => <option key={o} value={o}>{o === 'yes' ? 'Yes' : o === 'no' ? 'No' : o}</option>)}</select></>}</div>; })()}
              </div>
              <div className="col gap-4">
                <button className="btn sm ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><IconArrowUp size={14} /></button>
                <button className="btn sm ghost" disabled={i === form.fields.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><IconArrowDown size={14} /></button>
                <button className="btn sm ghost" disabled={form.fields.length === 1} onClick={() => set({ fields: form.fields.filter((_, k) => k !== i) })} aria-label="Remove question"><IconTrash size={14} /></button>
              </div>
            </div>))}
          <div className="row gap-6 wrap"><button className="btn sm" onClick={() => set({ fields: [...form.fields, blankField('text')] })}><IconPlus size={14} />Add question</button><button className="btn sm ghost" onClick={() => set({ fields: [...form.fields, blankField('yesno')] })}>Yes / No</button><button className="btn sm ghost" onClick={() => set({ fields: [...form.fields, blankField('info')] })}>Statement</button><button className="btn sm ghost" onClick={() => set({ fields: [...form.fields, blankField('signature'), { ...blankField('date'), label: 'Date', required: true }].map((x) => (x.type === 'signature' && !x.label ? { ...x, label: 'Full name of patient or guardian' } : x)) })}>Signature and date</button></div>
        </div>
      </>)}
    </Modal>
  );
}
