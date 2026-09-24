import React, { useEffect, useRef, useState } from 'react';
import { IconPhone, IconMessage, IconWorld, IconUserPlus, IconRobot, IconHandStop, IconCheck, IconArrowBackUp, IconSearch, IconBrandWhatsapp } from '@tabler/icons-react';
import { get, post } from '../lib/api.js';
import { ago, fmtWhen, fmtPhone, fullName } from '../lib/format.js';
import { Card, Pill, Avatar, Empty, usePoll, useAction, Seg, Modal, Field } from '../components/ui.jsx';

const CH_ICON = { call: IconPhone, sms: IconMessage, web: IconWorld, whatsapp: IconBrandWhatsapp };

export default function Inbox() {
  const { data, reload } = usePoll(() => get('/api/conversations'), [], 4000);
  const [filter, setFilter] = useState('open');
  const [selected, setSelected] = useState(null);
  const [q, setQ] = useState('');
  const list = (data || []).filter((c) => (filter === 'open' ? c.status !== 'closed' : filter === 'needs_staff' ? c.status === 'needs_staff' : filter === 'ai' ? c.status === 'ai' : filter === 'staff' ? c.status === 'staff' : c.status === 'closed'))
    .filter((c) => !q || (c.contactName || '').toLowerCase().includes(q.toLowerCase()) || (c.reason || '').toLowerCase().includes(q.toLowerCase()) || (c.contactPhone || '').includes(q.replace(/\D/g, '') || '§'));
  const conv = (data || []).find((c) => c.id === selected) || null;
  useEffect(() => { if (!selected && list.length) setSelected(list[0].id); }, [list.length]); // eslint-disable-line

  return (
    <>
      <div className="page-head">
        <div><h1>Front desk inbox</h1><p>The AI answers WhatsApp, calls, texts and web chats in English, Hindi, Kannada or Hinglish within practice rules, and hands anything clinical or sensitive to you.</p></div>
        <Seg value={filter} onChange={setFilter} options={[{ value: 'open', label: `Open (${(data || []).filter((c) => c.status !== 'closed').length})` }, { value: 'needs_staff', label: `Needs staff (${(data || []).filter((c) => c.status === 'needs_staff').length})` }, { value: 'ai', label: 'AI handling' }, { value: 'staff', label: 'With staff' }, { value: 'closed', label: 'Closed' }]} />
      </div>
      <div className="grid split" style={{ height: 'calc(100vh - 150px)', minHeight: 520 }}>
        <Card style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }} className="row"><IconSearch size={16} className="faint" /><input className="input" style={{ padding: '6px 10px' }} placeholder="Search name, number or reason" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="list" style={{ overflow: 'auto' }}>
            {list.map((c) => {
              const Icon = CH_ICON[c.channel] || IconMessage;
              return (
                <div key={c.id} className={`list-item clickable ${selected === c.id ? 'active' : ''}`} onClick={() => setSelected(c.id)}>
                  <Avatar patient={c.patient} name={c.contactName} />
                  <div className="grow">
                    <div className="row between"><span className="strong truncate">{c.contactName}</span><span className="tiny faint">{ago(c.updatedAt)}</span></div>
                    <div className="tiny muted truncate">{c.lastMessage?.text}</div>
                    <div className="row gap-4" style={{ marginTop: 4 }}><Pill status={c.status} /><span className="tiny muted row gap-4"><Icon size={12} />{c.channel}</span>{c.unread && <span className="dot bad" />}</div>
                  </div>
                </div>
              );
            })}
            {list.length === 0 && <Empty>No conversations here.</Empty>}
          </div>
        </Card>
        {conv ? <Thread conv={conv} reload={reload} /> : <Card><Empty>Select a conversation.</Empty></Card>}
      </div>
    </>
  );
}

function Thread({ conv, reload }) {
  const [run, busy] = useAction();
  const [text, setText] = useState('');
  const [asPatient, setAsPatient] = useState(false);
  const [linking, setLinking] = useState(false);
  const bottom = useRef(null);
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [conv.messages.length, conv.id]);
  useEffect(() => { if (conv.unread) post(`/api/conversations/${conv.id}/read`).then(reload); }, [conv.id]); // eslint-disable-line
  const send = async () => {
    if (!text.trim()) return;
    const tx = text; setText('');
    await run(() => post(`/api/conversations/${conv.id}/messages`, asPatient ? { text: tx } : { from: 'staff', text: tx }));
    reload();
  };
  const action = (path, msg) => run(async () => { await post(`/api/conversations/${conv.id}/${path}`); await reload(); }, msg);
  const Icon = CH_ICON[conv.channel] || IconMessage;
  return (
    <Card style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="card-head">
        <div className="row">
          <Avatar patient={conv.patient} name={conv.contactName} lg />
          <div>
            <div className="row gap-6"><h3>{conv.contactName}</h3><Pill status={conv.status} /></div>
            <div className="tiny muted row gap-4"><Icon size={12} />{conv.channel} · {fmtPhone(conv.contactPhone) || 'no number'} · {conv.reason || 'No reason yet'}{conv.assignedTo ? ` · with ${conv.assignedTo}` : ''}{conv.patient?.preferredLanguage && conv.patient.preferredLanguage !== 'en' ? ` · prefers ${conv.patient.preferredLanguage === 'hi' ? 'Hindi' : conv.patient.preferredLanguage === 'kn' ? 'Kannada' : conv.patient.preferredLanguage}` : ''}</div>
          </div>
        </div>
        <div className="row gap-6 wrap">
          {!conv.patientId && conv.candidatePatients?.length > 0 && conv.candidatePatients.map((c) => <button key={c.id} className="btn sm" onClick={() => run(async () => { await post(`/api/conversations/${conv.id}/link`, { patientId: c.id }); reload(); }, `Linked to ${c.name}`)}><IconUserPlus size={14} />{c.name}</button>)}
          {!conv.patientId && <button className="btn sm" onClick={() => setLinking(true)}><IconUserPlus size={14} />Link patient</button>}
          {conv.patientId && <a className="btn sm ghost" href={`#/patients?id=${conv.patientId}`}>Record</a>}
          {conv.patientId && <a className="btn sm ghost" href={`#/schedule?patient=${conv.patientId}`}>Schedule</a>}
          {conv.status !== 'staff' && conv.status !== 'closed' && <button className="btn sm primary" onClick={() => action('takeover', 'You have this conversation')}><IconHandStop size={14} />Take over</button>}
          {conv.status === 'staff' && <button className="btn sm" onClick={() => action('release', 'Handed back to the AI')}><IconRobot size={14} />Hand back to AI</button>}
          {conv.status !== 'closed' ? <button className="btn sm ghost" onClick={() => action('close', 'Closed')}><IconCheck size={14} />Close</button> : <button className="btn sm ghost" onClick={() => action('release', 'Reopened')}><IconArrowBackUp size={14} />Reopen</button>}
        </div>
      </div>
      {conv.escalation && conv.status === 'needs_staff' && <div className="callout bad" style={{ margin: '12px 20px 0', borderRadius: 12 }}><b>Handed to staff:</b> {conv.escalation.reason} · {ago(conv.escalation.at)}</div>}
      <div className="thread grow">
        {conv.messages.map((m) => (
          <div key={m.id} className={`bubble ${m.from}`}>
            {m.text}
            <div className="bubble-meta">
              {m.from === 'ai' && <IconRobot size={11} />}{m.from === 'staff' && (m.by || 'Staff')}{m.from === 'ai' && (m.engine === 'claude' ? 'Claude' : 'AI')}{m.intent ? ` · ${m.intent}` : ''}{m.escalated ? ' · sent to staff' : ''} · {fmtWhen(m.at)}
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <div className="composer">
        <div className="col gap-4" style={{ minWidth: 130 }}>
          <label className="check tiny muted"><input type="checkbox" checked={asPatient} onChange={(e) => setAsPatient(e.target.checked)} />Simulate patient reply</label>
          <span className="tiny faint">{asPatient ? 'Sends as the patient (demo)' : `Sends as ${conv.status === 'staff' ? conv.assignedTo || 'you' : 'you and takes over'}`}</span>
        </div>
        <textarea className="input" placeholder={asPatient ? 'Type what the patient says…' : 'Reply to the patient…'} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button className="btn primary" disabled={busy || !text.trim()} onClick={send}>Send</button>
      </div>
      {linking && <LinkPatient conv={conv} onClose={() => setLinking(false)} onDone={() => { setLinking(false); reload(); }} />}
    </Card>
  );
}

function LinkPatient({ conv, onClose, onDone }) {
  const [q, setQ] = useState(conv.contactName || '');
  const [results, setResults] = useState([]);
  const [run] = useAction();
  useEffect(() => { get(`/api/patients?q=${encodeURIComponent(q)}`).then(setResults).catch(() => {}); }, [q]);
  const [form, setForm] = useState({ firstName: conv.contactName?.split(' ')[0] || '', lastName: conv.contactName?.split(' ').slice(1).join(' ') || '', dob: '', phone: conv.contactPhone || '', email: conv.contactEmail || '' });
  return (
    <Modal title="Link to a patient" onClose={onClose}>
      <Field label="Search existing patients"><input className="input" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></Field>
      <div className="list card soft" style={{ maxHeight: 200, overflow: 'auto' }}>
        {results.slice(0, 8).map((p) => <div key={p.id} className="list-item clickable" onClick={() => run(async () => { await post(`/api/conversations/${conv.id}/link`, { patientId: p.id }); onDone(); }, 'Linked')}><Avatar patient={p} /><div className="grow"><div className="strong">{fullName(p)}</div><div className="tiny muted">{p.dob} · {fmtPhone(p.phone)}</div></div></div>)}
        {results.length === 0 && <div className="empty small">No matches</div>}
      </div>
      <div className="divider" />
      <div className="small strong">Or create a new patient</div>
      <div className="grid two">
        <Field label="First name"><input className="input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
        <Field label="Last name"><input className="input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
        <Field label="Date of birth"><input className="input" type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} /></Field>
        <Field label="Mobile"><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
      </div>
      <button className="btn primary" onClick={() => run(async () => { const p = await post('/api/patients', form); await post(`/api/conversations/${conv.id}/link`, { patientId: p.id }); onDone(); }, 'Patient created and linked')}>Create and link</button>
    </Modal>
  );
}
