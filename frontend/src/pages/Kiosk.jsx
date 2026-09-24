import Logo from '../components/Logo.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { IconDental, IconHandStop, IconCheck, IconTextSize, IconContrast, IconCreditCard, IconSignature, IconClipboardText, IconArrowLeft } from '@tabler/icons-react';
import { post } from '../lib/api.js';
import { fmtTime, fmtMoney } from '../lib/format.js';
import { SectionForm } from './Forms.jsx';
import { Steps, Seg } from '../components/ui.jsx';
import { t, sectionTitle, LANGS } from '../lib/i18n.js';

const ORDER = ['medicalHistory', 'dentalConcerns', 'medications', 'allergies'];

export default function Kiosk({ locationId, kioskCode }) {
  const [session, setSession] = useState(null);
  const [screen, setScreen] = useState('welcome'); // welcome | identify | choose | home | forms | insurance | consent | help | done | privacy
  const [large, setLarge] = useState(false);
  const [contrast, setContrast] = useState(false);
  const [lang, setLang] = useState('en');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(null);
  const sessionRef = useRef(null);
  sessionRef.current = session;
  const T = (k, vars) => t(lang, k, vars);

  useEffect(() => {
    if (!session?.expiresAt) { setSecondsLeft(null); return; }
    const tick = setInterval(() => { const left = Math.round((new Date(session.expiresAt) - Date.now()) / 1000); setSecondsLeft(left); if (left <= 0) reset(true); }, 1000);
    return () => clearInterval(tick);
  }, [session?.expiresAt]); // eslint-disable-line

  async function call(fn) {
    setBusy(true); setErr('');
    try { const s = await fn(); if (s) setSession(s); return s; }
    catch (e) { if (e.status === 410) reset(true); else setErr(e.message); return null; }
    finally { setBusy(false); }
  }
  async function start(next = 'identify') {
    const s = await call(() => post('/api/kiosk/sessions', { kioskCode: kioskCode || undefined, locationId: locationId || undefined, lang }));
    if (s) setScreen(next);
  }
  async function reset(privacy = false) {
    const s = sessionRef.current;
    if (s) post(`/api/kiosk/sessions/${s.id}/end`).catch(() => {});
    setSession(null); setErr(''); setLang('en'); setLarge(false); setContrast(false);
    if (privacy) { setScreen('privacy'); setTimeout(() => setScreen('welcome'), 2500); } else setScreen('welcome');
  }
  const changeLang = (l) => { setLang(l); if (session) post(`/api/kiosk/sessions/${session.id}/language`, { lang: l }).then(setSession).catch(() => {}); };

  const cls = `kiosk ${large ? 'large' : ''} ${contrast ? 'high-contrast' : ''}`;
  if (screen === 'privacy') return <div className="privacy"><div><IconDental size={56} /><h1>{T('privacyTitle')}</h1><p>{T('privacySub')}</p></div></div>;
  const langs = session?.languages || LANGS;

  return (
    <div className={cls}>
      <div className="kiosk-card">
        <div className="kiosk-bar">
          <div className="row"><div className="brand-mark"><Logo /></div><div><div className="strong">{session?.practice?.name || 'Welcome'}</div><div className="tiny muted">{session?.location?.name ? `${session.location.name} · ` : ''}Self-service check-in</div></div></div>
          <div className="row gap-6 wrap">
            <div className="seg lang-seg">{langs.map((l) => <button key={l.code} className={lang === l.code ? 'active' : ''} onClick={() => changeLang(l.code)}>{l.name}</button>)}</div>
            <button className={`btn sm ${large ? 'soft' : ''}`} onClick={() => setLarge(!large)} aria-pressed={large}><IconTextSize size={16} />{T('largerText')}</button>
            <button className={`btn sm ${contrast ? 'soft' : ''}`} onClick={() => setContrast(!contrast)} aria-pressed={contrast}><IconContrast size={16} />{T('highContrast')}</button>
            {session && screen !== 'help' && <button className="btn sm danger" onClick={() => setScreen('help')}><IconHandStop size={16} />{T('askHelp')}</button>}
          </div>
        </div>
        {session && <div className="row between"><span className="kiosk-timer">{T('sessionClears', { n: secondsLeft ?? '—' })}</span>{screen !== 'welcome' && screen !== 'done' && <button className="btn sm ghost" onClick={() => reset(false)}>{T('cancelClear')}</button>}</div>}
        {err && <div className="callout bad">{err}</div>}

        {screen === 'welcome' && (<>
          <h1>{T('welcome')}</h1>
          <p className="muted">{T('welcomeSub')}</p>
          <button className="btn primary lg" disabled={busy} onClick={() => start('identify')}>{T('start')}</button>
          <button className="btn lg" onClick={() => start('help')}><IconHandStop size={20} />{T('needHelp')}</button>
        </>)}
        {screen === 'identify' && <Identify session={session} busy={busy} call={call} T={T} onFound={(s) => { setSession(s); setScreen(s.choose ? 'choose' : 'home'); }} />}
        {screen === 'choose' && session?.choose && (<>
          <h2>{T('whichOfYou')}</h2>
          <div className="option-grid">{session.choose.map((c) => <button key={c.id} className="option" disabled={busy} onClick={async () => { const s = await call(() => post(`/api/kiosk/sessions/${session.id}/identify`, { patientId: c.id })); if (s?.patient) setScreen('home'); }}><div className="strong">{c.firstName} {c.lastInitial}</div><div className="muted" style={{ fontSize: '0.85em' }}>{fmtTime(c.time)}</div></button>)}</div>
        </>)}
        {screen === 'home' && session?.patient && <Home session={session} go={setScreen} busy={busy} T={T} lang={lang} onFinish={async () => { const s = await call(() => post(`/api/kiosk/sessions/${session.id}/complete`)); if (s) setScreen('done'); }} />}
        {screen === 'forms' && <FormsFlow session={session} call={call} busy={busy} T={T} lang={lang} onDone={() => setScreen('home')} />}
        {screen === 'insurance' && <Insurance session={session} call={call} busy={busy} T={T} lang={lang} onDone={() => setScreen('home')} />}
        {screen === 'consent' && <Consent session={session} call={call} busy={busy} T={T} onDone={() => setScreen('home')} />}
        {screen === 'help' && <Help session={session} call={call} busy={busy} T={T} onBack={() => setScreen(session?.patient ? 'home' : 'welcome')} />}
        {screen === 'done' && (<>
          <IconCheck size={48} style={{ color: 'var(--good)' }} />
          <h1>{T('checkedIn')}, {session?.patient?.firstName}.</h1>
          <div><div className="muted">{T('yourToken')}</div><div className="kiosk-token">{session?.visit?.token}</div></div>
          <p className="muted">{session?.visit?.missing?.length ? `${T('deskWillHelp')} ${session.visit.missing.join(', ')}. ` : ''}{T('haveSeat')} {session?.appointment?.provider} {T('willSee')}</p>
          {session?.appointment?.fee > 0 && session.appointment.paymentStatus === 'unpaid' && <p className="muted">{T('fee')}: <b>{fmtMoney(session.appointment.fee)}</b> — {T('payAtDesk')}.</p>}
          <button className="btn primary lg" onClick={() => reset(false)}>{T('done')}</button>
          <AutoReset seconds={15} onFire={() => reset(true)} T={T} />
        </>)}
      </div>
    </div>
  );
}

function AutoReset({ seconds, onFire, T }) {
  const [n, setN] = useState(seconds);
  useEffect(() => { if (n <= 0) { onFire(); return; } const x = setTimeout(() => setN(n - 1), 1000); return () => clearTimeout(x); }, [n]); // eslint-disable-line
  return <p className="tiny muted">{T('clearsIn', { n })}</p>;
}

function Identify({ session, call, busy, onFound, T }) {
  const [mode, setMode] = useState('phone');
  const [phone, setPhone] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('');
  const [abha, setAbha] = useState('');
  const submit = async () => {
    const s = await call(() => post(`/api/kiosk/sessions/${session.id}/identify`, mode === 'phone' ? { phone } : mode === 'abha' ? { abha } : { lastName, dob }));
    if (s?.patient || s?.choose) onFound(s);
  };
  const ok = mode === 'phone' ? phone.replace(/\D/g, '').length >= 10 : mode === 'abha' ? abha.replace(/\D/g, '').length >= 14 || abha.includes('@') : (lastName && dob);
  return (<>
    <h2>{T('whoAreYou')}</h2>
    <div className="row gap-6 wrap"><button className={`btn ${mode === 'phone' ? 'primary' : ''}`} onClick={() => setMode('phone')}>{T('mobile')}</button><button className={`btn ${mode === 'abha' ? 'primary' : ''}`} onClick={() => setMode('abha')}>{T('abha')}</button><button className={`btn ${mode === 'name' ? 'primary' : ''}`} onClick={() => setMode('name')}>{T('nameDob')}</button></div>
    {mode === 'phone' && <input className="input lg" inputMode="tel" placeholder="98450 12345" value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && submit()} />}
    {mode === 'abha' && <input className="input lg" placeholder="91-2345-6789-0123 or name@abdm" value={abha} onChange={(e) => setAbha(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && submit()} />}
    {mode === 'name' && <div className="grid two"><input className="input lg" placeholder={T('nameDob').split(' ')[0]} value={lastName} onChange={(e) => setLastName(e.target.value)} autoFocus /><input className="input lg" type="date" value={dob} onChange={(e) => setDob(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} /></div>}
    <button className="btn primary lg" disabled={busy || !ok} onClick={submit}>{T('findAppt')}</button>
    <p className="tiny muted">{T('onlyInitial')}</p>
  </>);
}

function Home({ session, go, onFinish, busy, T, lang }) {
  const f = session.forms;
  const formsDone = ORDER.every((k) => f.sections.find((s) => s.key === k)?.complete);
  const insuranceDone = f.sections.find((s) => s.key === 'insurance')?.complete || session.patient.insuranceOnFile;
  const consentDone = f.sections.find((s) => s.key === 'consent')?.complete;
  const total = f.sections.filter((s) => s.complete).length;
  const Row = ({ icon, title, sub, done, onClick }) => <button className={`option row ${done ? 'selected' : ''}`} onClick={onClick} style={{ width: '100%' }}>{icon}<div className="grow"><div className="strong">{title}</div><div className="muted" style={{ fontSize: '0.85em' }}>{sub}</div></div>{done ? <span className="pill good"><IconCheck size={14} />{T('done')}</span> : <span className="pill warn">{T('todo')}</span>}</button>;
  return (<>
    <h1>{T('hi')} {session.patient.firstName} {session.patient.lastInitial}</h1>
    <p className="muted">{session.appointment.visitType} {T('at')} {fmtTime(session.appointment.start)} {T('withDr')} {session.appointment.provider}. {T('arrivedNote')} <b className="mono">{session.visit?.token}</b>.</p>
    <Steps total={f.sections.length} done={total} />
    <div className="col">
      <Row icon={<IconClipboardText size={28} />} title={T('healthForms')} sub={formsDone ? T('allDone') : T('formsSub')} done={formsDone} onClick={() => go('forms')} />
      <Row icon={<IconCreditCard size={28} />} title={T('insuranceCard')} sub={insuranceDone ? `${session.patient.insuranceCarrier || T('onFile')}` : T('insuranceSub')} done={insuranceDone} onClick={() => go('insurance')} />
      <Row icon={<IconSignature size={28} />} title={T('consent')} sub={consentDone ? T('signed') : T('consentSub')} done={consentDone} onClick={() => go('consent')} />
    </div>
    <button className="btn primary lg" disabled={busy} onClick={onFinish}>{formsDone && insuranceDone && consentDone ? T('finish') : T('finishAnyway')}</button>
    <span className="tiny faint">{lang !== 'en' ? '' : ''}</span>
  </>);
}

function FormsFlow({ session, call, busy, onDone, T, lang }) {
  const sections = session.forms.sections.filter((s) => ORDER.includes(s.key));
  const [idx, setIdx] = useState(Math.max(0, sections.findIndex((s) => !s.complete)));
  const sec = sections[idx];
  if (!sec) { onDone(); return null; }
  return (<>
    <div className="row between"><button className="btn sm ghost" onClick={onDone}><IconArrowLeft size={16} />{T('back')}</button><span className="muted">{idx + 1} {T('of')} {sections.length}</span></div>
    <h2>{sectionTitle(lang, sec.key)}</h2>
    {sec.prefilled && <div className="callout">{T('prefilledNote')}</div>}
    <SectionForm key={sec.key + lang} lang={lang} sectionKey={sec.key} initial={sec.data} large saving={busy} onSave={async (data) => { const s = await call(() => post(`/api/kiosk/sessions/${session.id}/forms/${sec.key}`, { data })); if (s) { if (idx + 1 < sections.length) setIdx(idx + 1); else onDone(); } }} />
  </>);
}

function Insurance({ session, call, busy, onDone, T, lang }) {
  const [step, setStep] = useState('scan');
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const existing = session.forms.sections.find((s) => s.key === 'insurance')?.data || {};
  // The kiosk hardware scanner would hand us the card fields here. Without hardware we simulate the capture and let the patient confirm what was read.
  const scan = () => { setScanning(true); setTimeout(() => { setScanning(false); setScanned(true); setStep('confirm'); }, 1400); };
  return (<>
    <div className="row between"><button className="btn sm ghost" onClick={onDone}><IconArrowLeft size={16} />{T('back')}</button></div>
    <h2>{T('insTitle')}</h2>
    {step === 'scan' && (<>
      <p className="muted">{T('insSub')}</p>
      <div className="row wrap"><button className="btn primary lg" disabled={scanning} onClick={scan}><IconCreditCard size={22} />{scanning ? '…' : T('scan')}</button><button className="btn lg" onClick={() => setStep('confirm')}>{T('typeIt')}</button><button className="btn lg" onClick={async () => { const s = await call(() => post(`/api/kiosk/sessions/${session.id}/insurance`, { type: 'self', carrier: 'Self-pay', memberId: '', groupNumber: '' })); if (s) onDone(); }}>{T('selfPay')}</button></div>
    </>)}
    {step === 'confirm' && (<>
      <p className="muted">{T('checkDetails')}</p>
      <SectionForm lang={lang} sectionKey="insurance" initial={{ ...existing, type: existing.type || (session.patient.insuranceType !== 'self' ? session.patient.insuranceType : '') || '', carrier: existing.carrier || session.patient.insuranceCarrier || '' }} insuranceOptions={session.insuranceOptions} large saving={busy} onSave={async (data) => { const s = await call(() => post(`/api/kiosk/sessions/${session.id}/insurance`, { ...data, scanned })); if (s) onDone(); }} />
    </>)}
  </>);
}

function Consent({ session, call, busy, onDone, T }) {
  const canvas = useRef(null);
  const [drawn, setDrawn] = useState(false);
  const [typed, setTyped] = useState('');
  const [agree, setAgree] = useState(false);
  const drawing = useRef(false);
  const pos = (e) => { const r = canvas.current.getBoundingClientRect(); const p = e.touches ? e.touches[0] : e; return { x: p.clientX - r.left, y: p.clientY - r.top }; };
  const down = (e) => { drawing.current = true; const ctx = canvas.current.getContext('2d'); const { x, y } = pos(e); ctx.beginPath(); ctx.moveTo(x, y); };
  const move = (e) => { if (!drawing.current) return; e.preventDefault(); const ctx = canvas.current.getContext('2d'); ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#1d2b33'; const { x, y } = pos(e); ctx.lineTo(x, y); ctx.stroke(); setDrawn(true); };
  const up = () => { drawing.current = false; };
  const clear = () => { const c = canvas.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); setDrawn(false); };
  useEffect(() => { const c = canvas.current; if (c) { c.width = c.offsetWidth; c.height = c.offsetHeight; } }, []);
  const ok = agree && (drawn || typed.trim().length > 2);
  return (<>
    <div className="row between"><button className="btn sm ghost" onClick={onDone}><IconArrowLeft size={16} />{T('back')}</button></div>
    <h2>{T('consentTitle')}</h2>
    <div className="callout" style={{ fontSize: '1em' }}>{session.consentText}</div>
    <label className="check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />{T('agree')}</label>
    <div className="field"><label>{T('signFinger')}</label><canvas ref={canvas} className="sig-pad" onMouseDown={down} onMouseMove={move} onMouseUp={up} onMouseLeave={up} onTouchStart={down} onTouchMove={move} onTouchEnd={up} /></div>
    <div className="row"><span className="muted">{T('orType')}</span><input className="input" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={T('fullNamePh')} /><button className="btn sm ghost" onClick={clear}>{T('clear')}</button></div>
    <button className="btn primary lg" disabled={!ok || busy} onClick={async () => { const s = await call(() => post(`/api/kiosk/sessions/${session.id}/consent`, { signature: typed.trim() || `${session.patient.firstName} ${session.patient.lastInitial} (drawn)`, drawn })); if (s) onDone(); }}><IconCheck size={20} />{T('signContinue')}</button>
  </>);
}

function Help({ session, call, busy, onBack, T }) {
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const opts = T('helpOpts');
  return (<>
    <h2>{T('helpTitle')}</h2>
    {!sent ? (<>
      <p className="muted">{T('helpSub')}</p>
      <div className="option-grid">{opts.map((o) => <button key={o} className={`option ${note === o ? 'selected' : ''}`} onClick={() => setNote(o)}>{o}</button>)}</div>
      <input className="input" placeholder={T('somethingElse')} value={opts.includes(note) ? '' : note} onChange={(e) => setNote(e.target.value)} />
      <div className="row"><button className="btn primary lg" disabled={busy || !session} onClick={async () => { const s = await call(() => post(`/api/kiosk/sessions/${session.id}/help`, { note })); if (s) setSent(true); }}><IconHandStop size={20} />{T('callDesk')}</button><button className="btn lg" onClick={onBack}>{T('neverMind')}</button></div>
    </>) : (<>
      <IconCheck size={40} style={{ color: 'var(--good)' }} />
      <p>{T('helpSent')}</p>
      <button className="btn lg" onClick={onBack}>{T('back')}</button>
    </>)}
  </>);
}
