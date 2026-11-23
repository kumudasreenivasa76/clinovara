import React, { useEffect, useState } from 'react';
import { IconPlus, IconSend } from '@tabler/icons-react';
import { get, post, patch, del } from '../lib/api.js';
import { fmtDate, fmtWhen, ago } from '../lib/format.js';
import { Card, Pill, Empty, usePoll, useAction, Modal, Field } from '../components/ui.jsx';

const q = (providerId) => (providerId ? `&providerId=${providerId}` : '');
const pq = (providerId) => (providerId ? `?providerId=${providerId}` : '');

/* ---------------- Safe prescribing ---------------- */
const LEVEL_STYLE = { high: { bg: '#f6d9d4', fg: '#9a2f22', label: 'Stop and check' }, medium: { bg: '#fbf0dc', fg: '#8a5a10', label: 'Be careful' }, low: { bg: '#eff6ff', fg: '#1d4ed8', label: 'Note' } };

export function RxBuilder({ patientId, providerId, onClose, onDone }) {
  const [drugs, setDrugs] = useState([]);
  const [lines, setLines] = useState([]);
  const [warn, setWarn] = useState({ facts: null, warnings: [] });
  const [advice, setAdvice] = useState('');
  const [override, setOverride] = useState('');
  const [run, busy] = useAction();
  useEffect(() => { get('/api/doctor/drugs').then((r) => setDrugs(r.drugs)); }, []);
  const key = lines.map((l) => l.drugId).join(',');
  useEffect(() => { post('/api/doctor/rx/check', { patientId, drugIds: lines.map((l) => l.drugId) }).then(setWarn).catch(() => {}); }, [patientId, key]); // eslint-disable-line
  const add = (d) => !lines.some((l) => l.drugId === d.id) && setLines([...lines, { drugId: d.id, dose: d.dose, frequency: d.frequency, days: d.days }]);
  const upd = (i, p) => setLines(lines.map((l, k) => (k === i ? { ...l, ...p } : l)));
  const high = warn.warnings.filter((w) => w.level === 'high');
  const save = (send) => run(async () => { await post(`/api/doctor/rx${pq(providerId)}`, { patientId, lines, advice, send, overrideReason: override }); onDone?.(); onClose(); }, send ? 'Prescription saved and sent' : 'Prescription saved');
  const f = warn.facts;
  return (
    <Modal title="Write a prescription" onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn" disabled={busy || !lines.length} onClick={() => save(false)}>Save</button><button className="btn primary" disabled={busy || !lines.length} onClick={() => save(true)}><IconSend size={16} />Save &amp; send to patient</button></>}>
      {f && (
        <div className="callout small">
          {f.formOnFile
            ? <>Checked against the patient's form: <b>{f.allergies ? `allergy: ${f.allergies}` : 'no allergies listed'}</b>{f.bloodThinners ? ' · on blood thinners' : ''}{f.pregnant ? ' · pregnant or nursing' : ''}{f.conditions.length ? ` · ${f.conditions.join(', ')}` : ''}{f.ageYears != null ? ` · ${f.ageYears} yrs` : ''}</>
            : <b>No pre-visit form on file, so allergies could not be checked. Ask the patient.</b>}
        </div>
      )}
      <div className="row wrap gap-6">{drugs.map((d) => <button key={d.id} className="btn sm" disabled={lines.some((l) => l.drugId === d.id)} onClick={() => add(d)}><IconPlus size={12} />{d.name} {d.strength}</button>)}</div>
      {lines.map((l, i) => {
        const d = drugs.find((x) => x.id === l.drugId); if (!d) return null;
        return (
          <div className="card soft" style={{ padding: 10 }} key={l.drugId}>
            <div className="row between"><b className="small">{d.name} {d.strength} <span className="muted">({d.form})</span></b><button className="btn sm ghost" onClick={() => setLines(lines.filter((_, k) => k !== i))}>Remove</button></div>
            <div className="grid three mt-8">
              <Field label="Dose"><input className="input" value={l.dose} onChange={(e) => upd(i, { dose: e.target.value })} /></Field>
              <Field label="How often"><input className="input" value={l.frequency} onChange={(e) => upd(i, { frequency: e.target.value })} /></Field>
              <Field label="Days"><input className="input" type="number" min="1" value={l.days} onChange={(e) => upd(i, { days: Number(e.target.value) })} /></Field>
            </div>
          </div>
        );
      })}
      {warn.warnings.map((w, i) => <div key={i} className="small" style={{ background: LEVEL_STYLE[w.level].bg, color: LEVEL_STYLE[w.level].fg, padding: '8px 12px', borderRadius: 6 }}><b>{LEVEL_STYLE[w.level].label} · {w.drug}:</b> {w.text}</div>)}
      {high.length > 0 && <Field label="You are prescribing despite a stop-and-check warning. Why?" hint="This is written on the prescription and kept in the record."><input className="input" value={override} onChange={(e) => setOverride(e.target.value)} placeholder="e.g. tolerated this before, confirmed with the patient" /></Field>}
      <Field label="Advice for the patient"><input className="input" value={advice} onChange={(e) => setAdvice(e.target.value)} placeholder="e.g. warm saline rinses, soft diet for 2 days" /></Field>
    </Modal>
  );
}

/* ---------------- X-rays and photos ---------------- */
const shrink = (file) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onerror = () => reject(new Error('Could not read the file'));
  fr.onload = () => {
    const img = new Image();
    img.onerror = () => reject(new Error('That file is not an image'));
    img.onload = () => {
      const k = Math.min(1, 1400 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.src = fr.result;
  };
  fr.readAsDataURL(file);
});
const KIND_LABEL = { xray: 'X-ray', photo: 'Photo', scan: 'Scan', other: 'Other' };

export function PatientImages({ patientId }) {
  const [data, setData] = useState(null);
  const [kind, setKind] = useState('xray');
  const [tooth, setTooth] = useState('');
  const [title, setTitle] = useState('');
  const [view, setView] = useState(null);
  const [run, busy] = useAction();
  const load = () => get(`/api/doctor/images/${patientId}`).then(setData).catch(() => {});
  useEffect(() => { load(); }, [patientId]); // eslint-disable-line
  if (!data) return <div className="skeleton" />;
  const pick = (e) => {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
    run(async () => { const dataUrl = await shrink(file); await post(`/api/doctor/images/${patientId}`, { dataUrl, kind, tooth, title: title || file.name.replace(/\.[^.]+$/, '') }); setTitle(''); await load(); }, 'Image saved');
  };
  return (
    <div className="col gap-16">
      <div className="card soft" style={{ padding: 12 }}>
        <div className="row wrap gap-6" style={{ alignItems: 'flex-end' }}>
          <Field label="Type"><select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>{data.kinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></Field>
          <Field label="Tooth (FDI)"><input className="input" style={{ width: 90 }} value={tooth} onChange={(e) => setTooth(e.target.value)} placeholder="36" /></Field>
          <Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="IOPA before RCT" /></Field>
          <label className="btn primary" style={{ cursor: 'pointer' }}><IconPlus size={16} />{busy ? 'Saving…' : 'Add image'}<input type="file" accept="image/*" hidden disabled={busy} onChange={pick} /></label>
        </div>
        <div className="tiny muted mt-8">Photos are shrunk to a clinic-friendly size before saving. Keep full-resolution radiographs in your imaging software.</div>
      </div>
      {data.images.length === 0 ? <Empty>No X-rays or photos yet.</Empty> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
          {data.images.map((im) => (
            <div key={im.id} className="card" style={{ overflow: 'hidden', cursor: 'pointer' }} onClick={() => setView(im)}>
              <img src={im.dataUrl} alt={im.title} style={{ width: '100%', height: 110, objectFit: 'cover', display: 'block', background: '#000' }} />
              <div style={{ padding: 8 }}><div className="small strong truncate">{im.title || 'Untitled'}</div><div className="tiny muted">{KIND_LABEL[im.kind]}{im.tooth ? ` · tooth ${im.tooth}` : ''} · {fmtDate(im.createdAt)}</div></div>
            </div>
          ))}
        </div>
      )}
      {view && (
        <Modal title={`${view.title || 'Image'}${view.tooth ? ` · tooth ${view.tooth}` : ''}`} onClose={() => setView(null)} wide footer={<><button className="btn danger" onClick={() => run(async () => { await del(`/api/doctor/images/${patientId}/${view.id}`); setView(null); await load(); }, 'Image deleted')}>Delete</button><button className="btn" onClick={() => setView(null)}>Close</button></>}>
          <img src={view.dataUrl} alt={view.title} style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', background: '#000', borderRadius: 6 }} />
          <div className="tiny muted">{KIND_LABEL[view.kind]} · added {fmtWhen(view.createdAt)} by {view.by}</div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------- Follow-ups ---------------- */
export function Followups({ providerId, onOpen, onTab }) {
  const { data, reload } = usePoll(() => get(`/api/doctor/followups?x=1${q(providerId)}`), [providerId], 15000);
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const [run] = useAction();
  if (!data) return <div className="skeleton" />;
  const act = (fn, msg) => run(async () => { await fn(); reload(); }, msg);
  const open = data.tasks.filter((t) => !t.done);
  const addTask = () => act(async () => { await post(`/api/doctor/tasks${pq(providerId)}`, { text, due }); setText(''); setDue(''); });
  return (
    <>
      <div className="small muted mb-16">What a good dentist does the day after: check on yesterday's surgery patients, bring back overdue check-ups, and clear your own list.</div>
      <div className="grid two">
        <Card title={<span>Post-op check-ins <span className="muted">· {data.postOp.length}</span></span>}>
          <div className="list">{data.postOp.map((p) => (
            <div className="list-item start" key={p.visitId} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
              <div className="row between"><div><div className="small strong" style={{ cursor: 'pointer' }} onClick={() => onOpen(p.patientId)}>{p.patient}</div><div className="tiny muted">{p.procedure} · {ago(p.doneAt)}</div></div>{p.messaged && <Pill tone="info">Asked</Pill>}</div>
              <div className="row wrap gap-6">
                <button className="btn sm" onClick={() => act(() => post(`/api/doctor/followups/postop/${p.visitId}/message${pq(providerId)}`), 'Check-in message sent')}><IconSend size={12} />Ask how they feel</button>
                <button className="btn sm primary" onClick={() => act(() => post(`/api/doctor/followups/postop/${p.visitId}/done${pq(providerId)}`, { outcome: 'ok' }), 'Marked as doing well')}>Doing well</button>
                <button className="btn sm danger" onClick={() => { const note = window.prompt('What worries you? The front desk will call them to book a review.'); if (note !== null) act(() => post(`/api/doctor/followups/postop/${p.visitId}/done${pq(providerId)}`, { outcome: 'concern', note }), 'Front desk will call the patient'); }}>Needs a review</button>
              </div>
            </div>))}
            {data.postOp.length === 0 && <div className="empty small">No surgery or root canal patients to check on.</div>}</div>
        </Card>
        <Card title={<span>Check-ups overdue <span className="muted">· {data.recalls.length}</span></span>}>
          <div className="list">{data.recalls.map((p) => (
            <div className="list-item" key={p.patientId}>
              <div className="grow small"><span className="strong" style={{ cursor: 'pointer' }} onClick={() => onOpen(p.patientId)}>{p.patient}</span><div className="tiny muted">due {fmtDate(p.dueOn)}{p.lastMessaged ? ` · reminded ${ago(p.lastMessaged)}` : ''}</div></div>
              <button className="btn sm" onClick={() => act(() => post(`/api/doctor/followups/recall/${p.patientId}/send${pq(providerId)}`), 'Reminder sent')}><IconSend size={12} />Remind</button>
            </div>))}
            {data.recalls.length === 0 && <div className="empty small">Nobody is overdue.</div>}</div>
        </Card>
        {data.labBack.length > 0 && (
          <Card title="Lab work back, waiting to be fitted"><div className="list">{data.labBack.map((c) => <div className="list-item" key={c.id}><div className="grow small"><b>{c.kind}{c.tooth ? ` · tooth ${c.tooth}` : ''}</b> · {c.patient}</div><button className="btn sm" onClick={() => onTab('lab')}>Open lab cases</button></div>)}</div></Card>
        )}
        <Card title={<span>My to-do list <span className="muted">· {open.length}</span></span>}>
          <div className="row" style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
            <input className="input" placeholder="Add a to-do, e.g. call lab about the zirconia crown" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) addTask(); }} />
            <input className="input" type="date" style={{ width: 150 }} value={due} onChange={(e) => setDue(e.target.value)} />
            <button className="btn primary" disabled={!text.trim()} onClick={addTask}><IconPlus size={16} /></button>
          </div>
          <div className="list">{data.tasks.map((t) => (
            <div className="list-item" key={t.id}>
              <input type="checkbox" checked={t.done} onChange={(e) => act(() => patch(`/api/doctor/tasks/${t.id}`, { done: e.target.checked }))} />
              <div className="grow small" style={{ textDecoration: t.done ? 'line-through' : 'none', color: t.done ? 'var(--faint)' : undefined }}>{t.text}{t.due && <span className="tiny muted"> · {t.due < data.today && !t.done ? 'overdue, ' : ''}{fmtDate(t.due)}</span>}</div>
              <button className="btn sm ghost" onClick={() => act(() => del(`/api/doctor/tasks/${t.id}`))}>×</button>
            </div>))}
            {data.tasks.length === 0 && <div className="empty small">Nothing on your list.</div>}</div>
        </Card>
      </div>
    </>
  );
}
