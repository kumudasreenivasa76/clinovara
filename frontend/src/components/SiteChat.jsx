import React, { useEffect, useRef, useState } from 'react';
import { IconMessageCircle, IconX, IconSend } from '@tabler/icons-react';
import { get, post } from '../lib/api.js';

const KEY = 'clinovara.chat';
const SUGGEST = ['What are your timings?', 'I want to book an appointment', 'How much is a check-up?', 'Do you accept insurance?'];

/** Chat for visitors on the clinic website. Answered by the clinic's AI front desk; anything clinical or sensitive is handed to staff. */
export default function SiteChat({ practice }) {
  const [open, setOpen] = useState(false);
  const [conv, setConv] = useState(() => { try { return JSON.parse(sessionStorage.getItem(KEY)) || null; } catch { return null; } });
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const end = useRef(null);
  const save = (c) => { setConv(c); try { sessionStorage.setItem(KEY, JSON.stringify(c)); } catch { /* ignore */ } };
  const headers = conv ? { 'x-chat-token': conv.token } : {};
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [conv?.messages?.length, open]);
  // Pick up replies from clinic staff while the chat is open.
  useEffect(() => {
    if (!open || !conv) return undefined;
    const t = setInterval(() => get(`/api/conversations/${conv.id}`, headers).then((c) => save({ ...conv, ...c })).catch(() => {}), 5000);
    return () => clearInterval(t);
  }, [open, conv?.id]); // eslint-disable-line

  const send = async (msg) => {
    const m = (msg ?? text).trim(); if (!m || busy) return;
    setText(''); setErr(''); setBusy(true);
    const optimistic = { ...(conv || { messages: [] }), messages: [...(conv?.messages || []), { id: `tmp${Date.now()}`, from: 'patient', text: m }] };
    setConv(optimistic);
    try {
      const r = conv
        ? await post(`/api/conversations/${conv.id}/messages`, { text: m }, headers)
        : await post('/api/conversations', { text: m, contactName: name.trim() || undefined });
      save({ ...r.conversation, token: r.token || conv?.token });
    } catch (e) { setErr(e.status === 429 ? 'You are sending messages too quickly. Please wait a few minutes.' : 'Could not send that. Please try again, or call the clinic.'); save(conv); }
    finally { setBusy(false); }
  };

  if (!open) return <button className="assist-fab" onClick={() => setOpen(true)} aria-label="Chat with the clinic"><IconMessageCircle size={20} />Chat with us</button>;
  const msgs = conv?.messages || [];
  return (
    <section className="assist" aria-label="Chat with the clinic">
      <header><b>{practice?.name || 'Clinic'}</b><button className="btn ghost icon sm" onClick={() => setOpen(false)} aria-label="Close chat"><IconX size={16} /></button></header>
      <div className="assist-log">
        <div className="msg bot">Hello. Ask about timings, fees or booking. Replies come from our assistant; our team steps in for anything clinical.{practice?.phone ? ` For severe pain or swelling, call ${practice.phone}.` : ''}</div>
        {msgs.map((m) => <div key={m.id} className={`msg ${m.from === 'patient' ? 'me' : 'bot'}`}>{m.text}</div>)}
        {!msgs.length && <div className="assist-chips">{SUGGEST.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}</div>}
        {busy && <div className="msg bot muted">Typing…</div>}
        {err && <div className="msg bot" style={{ color: 'var(--bad)' }}>{err}</div>}
        <div ref={end} />
      </div>
      {!conv && <div style={{ padding: '8px 10px 0' }}><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (optional)" maxLength={80} /></div>}
      <form onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message" maxLength={500} />
        <button className="btn primary" disabled={busy || !text.trim()} aria-label="Send"><IconSend size={16} /></button>
      </form>
    </section>
  );
}
