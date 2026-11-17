import React, { useEffect, useRef, useState } from 'react';
import { IconMessageCircle, IconX, IconSend, IconChevronRight } from '@tabler/icons-react';
import { get, post } from '../lib/api.js';

const STARTERS = {
  dentist: ['Who is next?', 'My schedule today', 'Find a patient'],
  hygienist: ['Who is next?', 'My schedule today', 'Find a patient'],
  front_desk: ["Today's schedule", 'Open slots this week', 'Unpaid visits', 'What needs attention?'],
  default: ["Today's schedule", 'What needs attention?', 'Marketing results', 'Revenue this week'],
};

/**
 * Staff assistant. It opens with a short brief of the day built from live data, answers in plain words, links each answer to
 * the screen where you act, and prepares changes (a booking, a message, a draft campaign) that you confirm before anything happens.
 */
export default function Assistant({ role }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [brief, setBrief] = useState(null);
  const [log, setLog] = useState([]);
  const end = useRef(null);
  const starters = STARTERS[role] || STARTERS.default;

  useEffect(() => { get('/api/assistant/brief').then(setBrief).catch(() => setBrief({ greeting: 'Hello.', lines: [], suggestions: [], count: 0 })); }, [role]);
  useEffect(() => {
    if (brief && log.length === 0) setLog([{ from: 'bot', reply: [brief.greeting, ...brief.lines].join('\n'), suggestions: brief.suggestions.length ? brief.suggestions : starters }]);
  }, [brief]); // eslint-disable-line
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [log, open]);
  useEffect(() => {
    const toggle = () => setOpen((o) => !o); const show = () => setOpen(true);
    const k = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === '/') { e.preventDefault(); toggle(); } };
    window.addEventListener('keydown', k); window.addEventListener('clinovara:assistant', show);
    return () => { window.removeEventListener('keydown', k); window.removeEventListener('clinovara:assistant', show); };
  }, []);

  const ask = async (msg) => {
    const m = (msg ?? text).trim(); if (!m || busy) return;
    setText(''); setBusy(true); setLog((l) => [...l.map((x) => ({ ...x, suggestions: undefined })), { from: 'me', reply: m }]);
    try { const r = await post('/api/assistant/ask', { message: m, history: log.filter((x) => x.reply).map((x) => ({ from: x.from, text: x.reply })).slice(-8) }); setLog((l) => [...l, { from: 'bot', ...r }]); }
    catch (e) { setLog((l) => [...l, { from: 'bot', reply: e.message || 'Something went wrong. Try again.' }]); }
    finally { setBusy(false); }
  };
  const decide = async (msgIdx, action, decision) => {
    setBusy(true);
    const drop = (l) => l.map((m, i) => (i === msgIdx ? { ...m, actions: m.actions.filter((a) => a.id !== action.id) } : m));
    try { const r = await post('/api/assistant/action', { actionId: action.id, decision }); setLog((l) => drop(l).concat([{ from: 'bot', reply: r.message, items: r.href ? [{ title: 'Open', sub: '', href: r.href }] : [] }])); }
    catch (e) { setLog((l) => drop(l).concat([{ from: 'bot', reply: e.message }])); }
    finally { setBusy(false); }
  };

  if (!open) return <button className="assist-fab" onClick={() => setOpen(true)} aria-label="Open the assistant"><IconMessageCircle size={20} />Assistant{brief?.count > 0 && <span className="assist-dot">{brief.count}</span>}</button>;
  return (
    <section className="assist" aria-label="Assistant">
      <header><b>Assistant</b><span className="tiny muted">Ctrl /</span><button className="btn ghost icon sm" onClick={() => setOpen(false)} aria-label="Close"><IconX size={16} /></button></header>
      <div className="assist-log">
        {log.map((m, i) => m.from === 'me'
          ? <div className="msg me" key={i}>{m.reply}</div>
          : <div className="msg bot" key={i}>
              <div style={{ whiteSpace: 'pre-line' }}>{m.reply}</div>
              {m.items?.length > 0 && <div className="assist-items">{m.items.map((it, j) => <a key={j} href={it.href} onClick={() => setOpen(false)}><span><b>{it.title}</b>{it.sub && <small>{it.sub}</small>}</span><IconChevronRight size={14} /></a>)}</div>}
              {m.actions?.map((a) => <div className="assist-action" key={a.id}><div>{a.summary}</div><div className="row gap-6"><button className="btn sm primary" disabled={busy} onClick={() => decide(i, a, 'confirm')}>Confirm</button><button className="btn sm" disabled={busy} onClick={() => decide(i, a, 'dismiss')}>Dismiss</button></div></div>)}
              {m.suggestions?.length > 0 && <div className="assist-chips">{m.suggestions.map((s) => <button key={s} onClick={() => ask(s)}>{s}</button>)}</div>}
            </div>)}
        {!brief && <div className="msg bot muted">Getting your day…</div>}
        {busy && <div className="msg bot muted">Looking that up…</div>}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask anything about the clinic" autoFocus />
        <button className="btn primary" disabled={busy || !text.trim()} aria-label="Send"><IconSend size={16} /></button>
      </form>
    </section>
  );
}
