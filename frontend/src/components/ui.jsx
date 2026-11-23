import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { IconX, IconInbox } from '@tabler/icons-react';
import { initials, label } from '../lib/format.js';

/* ---------- Toasts ---------- */
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((text, kind = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">{toasts.map((t) => <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>{t.text}</div>)}</div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/** Runs an async action, toasts errors, returns result or undefined. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn, okMessage) => {
    setBusy(true);
    try { const r = await fn(); if (okMessage) toast(okMessage); return r; }
    catch (e) { toast(e.message || 'Something went wrong', 'error'); return undefined; }
    finally { setBusy(false); }
  }, [toast]);
  return [run, busy];
}

/**
 * Loads data and keeps it fresh. A slow request is never doubled up, polling stops while the tab is in the
 * background, and the data refreshes at once when the person comes back to it.
 */
export function usePoll(loader, deps = [], intervalMs = 0) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);
  const running = useRef(false);
  const reload = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try { const d = await loader(); if (alive.current) { setData(d); setError(null); } }
    catch (e) { if (alive.current) setError(e); }
    finally { running.current = false; if (alive.current) setLoading(false); }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    alive.current = true; setLoading(true); reload();
    const tick = () => { if (typeof document === 'undefined' || !document.hidden) reload(); };
    const t = intervalMs ? setInterval(tick, intervalMs) : null;
    const back = () => { if (!document.hidden) reload(); };
    if (intervalMs) document.addEventListener('visibilitychange', back);
    return () => { alive.current = false; if (t) clearInterval(t); document.removeEventListener('visibilitychange', back); };
  }, [reload, intervalMs]);
  return { data, error, loading, reload, setData };
}

/** One quiet banner when the server cannot be reached, cleared as soon as a request gets through. */
export function ReachBanner() {
  const [down, setDown] = useState(false);
  useEffect(() => {
    let timer = null;
    const on = (e) => { if (e.detail?.ok) { clearTimeout(timer); timer = null; setDown(false); } else if (!timer) timer = setTimeout(() => setDown(true), 1200); };
    window.addEventListener('clinovara:reach', on);
    return () => { window.removeEventListener('clinovara:reach', on); clearTimeout(timer); };
  }, []);
  if (!down) return null;
  return <div className="reach-banner" role="status"><span className="dot" />Cannot reach the server. Your screen may be out of date. Trying again…</div>;
}

/* ---------- Primitives ---------- */
export const Card = ({ title, actions, children, className = '', soft = false, style }) => (
  <section className={`card ${soft ? 'soft' : ''} ${className}`} style={style}>
    {(title || actions) && <div className="card-head"><h3>{title}</h3><div className="row gap-6">{actions}</div></div>}
    {children}
  </section>
);
export const Body = ({ children, className = '' }) => <div className={`card-body ${className}`}>{children}</div>;

const TONE = {
  scheduled: '', confirmed: 'info', arrived: 'accent', checking_in: 'accent', ready: 'good', in_chair: 'good', brought_back: 'good', completed: '', done: '', cancelled: 'bad', no_show: 'bad', expected: 'outline', needs_attention: 'warn',
  ai: 'accent', needs_staff: 'bad', staff: 'info', closed: '',
  sent: 'outline', partial: 'warn', complete: 'good', created: 'outline',
  recommended: 'warn', accepted: 'info', declined: 'bad',
  high: 'bad', elective: '', urgent: 'bad',
  call: 'violet', sms: 'info', web: 'accent',
};
export const Pill = ({ status, tone, children, icon }) => (
  <span className={`pill ${tone ?? TONE[status] ?? ''}`}>{icon}{children ?? label(status)}</span>
);

export const Avatar = ({ patient, name, lg }) => <div className={`avatar ${lg ? 'lg' : ''}`}>{patient ? initials(patient) : (name || '?').split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase()}</div>;

export const Stat = ({ value, label: l, hint, tone = '', onClick }) => (
  <div className={`card stat ${tone}`} onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
    <div className="value">{value ?? '—'}</div>
    <div className="label">{l}</div>
    {hint && <div className="hint">{hint}</div>}
  </div>
);

export const Empty = ({ icon = <IconInbox size={28} />, children }) => <div className="empty">{icon}<div>{children}</div></div>;

export const Field = ({ label: l, children, hint }) => (
  <div className="field">{l && <label>{l}</label>}{children}{hint && <span className="tiny faint">{hint}</span>}</div>
);

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head"><h2>{title}</h2><button className="btn ghost icon" onClick={onClose} aria-label="Close"><IconX size={18} /></button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export const Seg = ({ value, onChange, options }) => (
  <div className="seg">{options.map((o) => <button key={o.value} className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>{o.label}</button>)}</div>
);

export const Spinner = () => <div className="spin" aria-label="Loading" />;

export function Steps({ total, done }) {
  return <div className="steps">{Array.from({ length: total }, (_, i) => <span key={i} className={i < done ? 'done' : ''} />)}</div>;
}
