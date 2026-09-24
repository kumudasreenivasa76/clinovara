import Logo from '../components/Logo.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { IconDental, IconPhone, IconMessage, IconWorld, IconSend, IconRobot, IconUser, IconBrandWhatsapp } from '@tabler/icons-react';
import { get, post } from '../lib/api.js';
import { fmtTime, fullName, fmtPhone } from '../lib/format.js';
import { Seg } from '../components/ui.jsx';

const CH = { whatsapp: { label: 'WhatsApp', icon: IconBrandWhatsapp, hint: 'A patient messaging the clinic WhatsApp number' }, web: { label: 'Website chat', icon: IconWorld, hint: 'A visitor on the clinic website' }, sms: { label: 'SMS', icon: IconMessage, hint: 'A patient texting the clinic number' }, call: { label: 'Phone call', icon: IconPhone, hint: 'Transcript of a call answered by the AI' } };

/** Demo of what patients experience. It talks to the same conversation API the real channels would. */
export default function PatientPortal() {
  const [channel, setChannel] = useState('whatsapp');
  const [patients, setPatients] = useState([]);
  const [who, setWho] = useState('new');
  const [name, setName] = useState('Tara Bhat');
  const [phone, setPhone] = useState('9845099911');
  const [conv, setConv] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [practice, setPractice] = useState('the practice');
  const bottom = useRef(null);
  useEffect(() => { get('/api/patients?demo=1').then(setPatients).catch(() => setPatients([])); get('/api/settings').then((s) => setPractice(s.practice.name)).catch(() => {}); }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [conv?.messages?.length]);
  // Poll for staff replies
  useEffect(() => { if (!conv) return; const t = setInterval(() => get(`/api/conversations/${conv.id}`).then(setConv).catch(() => {}), 4000); return () => clearInterval(t); }, [conv?.id]);
  const patient = patients.find((p) => p.id === who);
  const contactPhone = patient ? patient.phone : phone;
  const contactName = patient ? fullName(patient) : name;

  const send = async () => {
    if (!text.trim() || busy) return;
    const t = channel === 'call' ? `[Voice] ${text.trim()}` : text.trim();
    setText(''); setBusy(true);
    try {
      const r = conv ? await post(`/api/conversations/${conv.id}/messages`, { text: t }) : await post('/api/conversations', { channel, contactName, contactPhone, patientId: patient?.id, text: t, forceNew: false });
      setConv(r.conversation);
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };
  const Icon = CH[channel].icon;

  return (
    <div className="portal">
      <div className="col" style={{ width: 'min(900px, 100%)' }}>
        <div className="row wrap between" style={{ gap: 16 }}>
          <div className="row"><div className="brand-mark"><Logo /></div><div><div className="strong">Patient experience demo</div><div className="tiny muted">Talk to the AI front desk the way a patient would. Staff see it live in the inbox.</div></div></div>
          <a className="btn sm ghost" href="#/inbox" target="_blank" rel="noreferrer">Open staff inbox</a>
        </div>
        <div className="grid" style={{ gridTemplateColumns: '1fr 440px' }}>
          <div className="card"><div className="card-body col gap-16">
            <div className="field"><label>Channel</label><Seg value={channel} onChange={(v) => { setChannel(v); setConv(null); }} options={Object.entries(CH).map(([k, v]) => ({ value: k, label: v.label }))} /><span className="tiny muted">{CH[channel].hint}</span></div>
            <div className="field"><label>Who is contacting the practice?</label><select className="input" value={who} onChange={(e) => { setWho(e.target.value); setConv(null); }}><option value="new">Someone new (not a patient yet)</option>{patients.map((p) => <option key={p.id} value={p.id}>{fullName(p)} · existing patient</option>)}</select></div>
            {!patient && <div className="grid two"><div className="field"><label>Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div><div className="field"><label>Phone</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></div></div>}
            {patient && <div className="tiny muted">{fmtPhone(patient.phone)}{patient.upcoming ? ` · has an upcoming appointment` : ' · no upcoming appointment'}</div>}
            <div className="divider" />
            <div className="small strong">Try saying</div>
            <div className="tag-list">{['What are your timings?', 'Do you take Star Health cashless?', 'Cleaning chahiye next week, evening mein', 'Daant mein bahut dard hai, aaj aa sakta hoon?', 'Should I take my leftover antibiotics?', 'I need to reschedule', 'Can I cancel my appointment?', 'Do you treat kids?', 'Do you support ABHA?', 'Whitefield mein braces consult kitna hai?'].map((s) => <button key={s} className="btn sm" onClick={() => setText(s)}>{s}</button>)}</div>
            <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => setConv(null)}>Start a new conversation</button>
          </div></div>
          <div className="phone">
            <div className="phone-head"><Icon size={18} className="muted" /><div className="grow"><div className="strong">{practice}</div><div className="tiny muted">{CH[channel].label}{conv ? ` · ${conv.status === 'staff' ? `with ${conv.assignedTo || 'staff'}` : conv.status === 'needs_staff' ? 'waiting for staff' : 'AI front desk'}` : ''}</div></div></div>
            <div className="thread grow" style={{ background: 'var(--ground)' }}>
              {!conv && <div className="empty small">{channel === 'call' ? 'Type what the caller says. The AI answers as it would on the phone.' : 'Send a message to begin.'}</div>}
              {conv?.messages.map((m) => (
                <div key={m.id} className={`bubble ${m.from === 'patient' ? 'ai' : 'patient'}`} style={m.from === 'patient' ? { background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)' } : undefined}>
                  {m.text}
                  <div className="bubble-meta" style={m.from === 'patient' ? { color: 'rgba(255,255,255,0.7)' } : undefined}>{m.from === 'ai' ? <><IconRobot size={11} /> AI</> : m.from === 'staff' ? <><IconUser size={11} /> {m.by || 'Staff'}</> : 'You'} · {fmtTime(m.at)}</div>
                </div>
              ))}
              {busy && <div className="bubble patient tiny muted">…</div>}
              <div ref={bottom} />
            </div>
            <div className="composer">
              <textarea className="input" placeholder={channel === 'call' ? 'What the caller says…' : 'Message…'} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
              <button className="btn primary icon" disabled={busy || !text.trim()} onClick={send} aria-label="Send"><IconSend size={18} /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
