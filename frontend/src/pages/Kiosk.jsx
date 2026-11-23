import React, { useEffect, useRef, useState } from 'react';
import { IconDental, IconHandStop, IconCheck, IconTextSize, IconContrast, IconCreditCard, IconSignature, IconClipboardText, IconArrowLeft, IconBackspace, IconDoorEnter, IconUserQuestion, IconClock, IconStethoscope } from '@tabler/icons-react';
import { get, post } from '../lib/api.js';
import { brandVars, BrandLogo } from '../lib/brand.jsx';
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
  // The clinic's name, logo and colour are public, so the welcome screen can show them before anyone starts a session.
  const [clinic, setClinic] = useState(null);
  useEffect(() => { get('/api/settings').then(setClinic).catch(() => {}); }, []);
  const [clockNow, setClockNow] = useState(new Date());
  useEffect(() => { const x = setInterval(() => setClockNow(new Date()), 30000); return () => clearInterval(x); }, []);
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

  const cls = `kiosk kx ${large ? 'large' : ''} ${contrast ? 'high-contrast' : ''}`;
  const branding = session?.branding || clinic?.branding || null;
  const clinicName = session?.practice?.name || clinic?.practice?.name || 'Welcome';
  const stepNo = ['identify', 'choose'].includes(screen) ? 1 : ['home', 'forms', 'insurance', 'consent'].includes(screen) ? 2 : screen === 'done' ? 3 : 0;
  if (screen === 'privacy') return <div className="privacy" style={brandVars(branding)}><div><IconDental size={56} /><h1>{T('privacyTitle')}</h1><p>{T('privacySub')}</p></div></div>;
  const langs = session?.languages || LANGS;

  return (
    <div className={cls} style={contrast ? undefined : brandVars(branding)}>
      <header className="kx-top">
        <div className="kx-brand"><BrandLogo branding={branding} name={clinicName} size={46} /><div><div className="kx-name">{clinicName}</div><div className="kx-sub">{session?.location?.name ? `${session.location.name} · ` : ''}Self-service check-in</div></div></div>
        <div className="kx-tools">
          <span className="kx-clock"><IconClock size={16} />{clockNow.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span>
          <button className={`kx-tool ${large ? 'on' : ''}`} onClick={() => setLarge(!large)} aria-pressed={large}><IconTextSize size={18} />{T('largerText')}</button>
          <button className={`kx-tool ${contrast ? 'on' : ''}`} onClick={() => setContrast(!contrast)} aria-pressed={contrast}><IconContrast size={18} />{T('highContrast')}</button>
          {session && screen !== 'help' && screen !== 'walkin' && <button className="kx-tool help" onClick={() => setScreen('help')}><IconHandStop size={18} />{T('askHelp')}</button>}
        </div>
      </header>

      <div className="kiosk-card">
        {stepNo > 0 && <ol className="kx-steps">{[T('stepFind'), T('stepDetails'), T('stepToken')].map((label, i) => <li key={label} className={i + 1 < stepNo ? 'past' : i + 1 === stepNo ? 'on' : ''}><i>{i + 1 < stepNo ? <IconCheck size={14} stroke={3} /> : i + 1}</i>{label}</li>)}</ol>}
        {session && screen !== 'welcome' && screen !== 'done' && <div className="row between"><span className="kiosk-timer">{T('sessionClears', { n: secondsLeft ?? '…' })}</span><button className="btn sm ghost" onClick={() => reset(false)}>{T('cancelClear')}</button></div>}
        {err && <div className="callout bad">{err}</div>}

        {screen === 'welcome' && (<>
          <div className="kx-hello">
            <BrandLogo branding={branding} name={clinicName} size={88} className="big" />
            <h1>{branding?.welcome || T('welcome')}</h1>
            <p className="muted">{T('chooseLang')}</p>
            <div className="kx-langs">{langs.map((l) => <button key={l.code} className={lang === l.code ? 'on' : ''} onClick={() => changeLang(l.code)}>{l.name}</button>)}</div>
          </div>
          <button className="kx-go" disabled={busy} onClick={() => start('identify')}><IconDoorEnter size={30} />{T('checkIn')}</button>
          <div className="kx-alt">
            <button disabled={busy} onClick={() => start('walkin')}><IconUserQuestion size={22} />{T('walkIn')}</button>
            <button disabled={busy} onClick={() => start('help')}><IconHandStop size={22} />{T('needHelp')}</button>
          </div>
        </>)}
        {screen === 'walkin' && <WalkIn session={session} call={call} busy={busy} T={T} onBack={() => reset(false)} />}
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
          <div className="kx-done">
            <span className="tick"><IconCheck size={34} stroke={3} /></span>
            <h1>{T('checkedIn')}, {session?.patient?.firstName}.</h1>
            <div className="kx-ticket">
              <div className="lbl">{T('yourToken')}</div>
              <div className="kiosk-token">{session?.visit?.token}</div>
              <div className="ahead">{session?.visit?.ahead > 0 ? T('aheadOfYou', { n: session.visit.ahead }) : T('youAreNext')}</div>
              <dl><div><dt><IconStethoscope size={16} />{T('withDentist')}</dt><dd>{session?.appointment?.provider}</dd></div><div><dt><IconClock size={16} />{T('timeLabel')}</dt><dd>{fmtTime(session?.appointment?.start)}</dd></div></dl>
            </div>
            <p className="muted">{session?.visit?.missing?.length ? `${T('deskWillHelp')} ${session.visit.missing.join(', ')}. ` : ''}{T('haveSeat')}</p>
            {session?.appointment?.fee > 0 && session.appointment.paymentStatus === 'unpaid' && <p className="muted">{T('fee')}: <b>{fmtMoney(session.appointment.fee)}</b>, {T('payAtDesk')}.</p>}
          </div>
          <button className="kx-go" onClick={() => reset(false)}>{T('done')}</button>
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
    <div className="kx-modes"><button className={`btn ${mode === 'phone' ? 'primary' : ''}`} onClick={() => setMode('phone')}>{T('mobile')}</button><button className={`btn ${mode === 'abha' ? 'primary' : ''}`} onClick={() => setMode('abha')}>{T('abha')}</button><button className={`btn ${mode === 'name' ? 'primary' : ''}`} onClick={() => setMode('name')}>{T('nameDob')}</button></div>
    {mode === 'phone' && (<>
      <p className="muted">{T('enterMobile')}</p>
      <div className="kx-number" aria-live="polite"><span className="cc">+91</span><span className={phone ? '' : 'ph'}>{phone ? phone.replace(/(\d{5})(\d{0,5})/, '$1 $2').trim() : '98450 12345'}</span></div>
      <input className="kx-hidden" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} autoFocus onKeyDown={(e) => e.key === 'Enter' && ok && submit()} aria-label={T('mobile')} />
      <div className="kx-pad">{['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'].map((k) => (
        <button key={k} type="button" className={k.length > 1 ? 'fn' : ''} onClick={() => setPhone(k === 'clear' ? '' : k === 'back' ? phone.slice(0, -1) : (phone + k).slice(0, 10))} aria-label={k === 'back' ? 'Delete last digit' : k === 'clear' ? T('clear') : k}>{k === 'back' ? <IconBackspace size={26} /> : k === 'clear' ? T('clear') : k}</button>))}</div>
    </>)}
    {mode === 'abha' && <input className="input lg" placeholder="91-2345-6789-0123 or name@abdm" value={abha} onChange={(e) => setAbha(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && submit()} />}
    {mode === 'name' && <div className="grid two"><input className="input lg" placeholder={T('nameDob').split(' ')[0]} value={lastName} onChange={(e) => setLastName(e.target.value)} autoFocus /><input className="input lg" type="date" value={dob} onChange={(e) => setDob(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} /></div>}
    <button className="kx-go" disabled={busy || !ok} onClick={submit}>{T('findAppt')}</button>
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

/** No appointment: the patient leaves a name and number, and the front desk is alerted on the arrivals board. */
function WalkIn({ session, call, busy, onBack, T }) {
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [sent, setSent] = useState(false);
  const ok = name.trim().length > 1 && phone.replace(/\D/g, '').length >= 10;
  if (sent) return (<>
    <div className="kx-done"><span className="tick"><IconCheck size={34} stroke={3} /></span><h1>{T('walkInSent')}</h1></div>
    <button className="kx-go" onClick={onBack}>{T('done')}</button>
    <AutoReset seconds={12} onFire={onBack} T={T} />
  </>);
  return (<>
    <h2>{T('walkInTitle')}</h2>
    <p className="muted">{T('walkInSub')}</p>
    <input className="input lg" placeholder={T('yourName')} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
    <input className="input lg" inputMode="tel" placeholder={T('mobile')} value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d ]/g, '').slice(0, 12))} />
    <button className="kx-go" disabled={busy || !ok || !session} onClick={async () => { const s = await call(() => post(`/api/kiosk/sessions/${session.id}/help`, { note: `Walk-in without an appointment: ${name.trim()}, ${phone.trim()}. Wants to book.` })); if (s) setSent(true); }}>{T('tellDesk')}</button>
    <button className="btn lg" onClick={onBack}>{T('back')}</button>
  </>);
}
