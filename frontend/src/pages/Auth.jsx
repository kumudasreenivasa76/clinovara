import React, { useEffect, useRef, useState } from 'react';
import { IconCheck, IconArrowRight, IconDeviceMobile, IconMail, IconLock, IconEye, IconEyeOff, IconCalendarEvent, IconUsers, IconMessageDots, IconBolt } from '@tabler/icons-react';
import { get, post, setRemember } from '../lib/api.js';
import { PASSWORD_RULES, passwordOk } from '../lib/password.js';
import '../auth.css';
import { regionsFor, citiesFor } from '../lib/places.js';
import { Field, useAction } from '../components/ui.jsx';
import { navigate } from '../App.jsx';

// [value the server accepts, label shown]. The values must stay as they are: registration checks them.
const CLINIC_TYPES = [['General dental clinic', 'General Dental Clinic'], ['Multi-specialty dental clinic', 'Multi-Specialty Clinic'], ['Orthodontic clinic', 'Orthodontic Clinic'], ['Pediatric dental clinic', 'Pediatric Dental Clinic'], ['Oral surgery / implant centre', 'Oral Surgery & Implant Centre'], ['Dental chain / group', 'Dental Group / Chain'], ['Other', 'Other']];
const DIALS = [['91', 'India'], ['1', 'United States'], ['44', 'United Kingdom'], ['971', 'United Arab Emirates'], ['65', 'Singapore'], ['61', 'Australia'], ['977', 'Nepal'], ['94', 'Sri Lanka'], ['880', 'Bangladesh']];

export default function Auth({ mode, session, inviteToken }) {
  const [run, busy] = useAction();
  const [err, setErr] = useState('');
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const [f, setF] = useState({ name: '', email: '', phone: '', dial: '91', password: '', confirmPassword: '', clinicName: '', clinicType: '', country: 'India', state: '', city: '', cityOther: false, acceptTerms: false, demo: false, code: '', emailCode: '', phoneCode: '', newPassword: '' });
  const [step, setStep] = useState('details');
  const [sent, setSent] = useState(null);
  const [verif, setVerif] = useState({ email: true, sms: true });
  useEffect(() => { get('/api/health').then((h) => h.verification && setVerif(h.verification)).catch(() => {}); }, []);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const sendCode = async (channel) => { const r = await post('/api/auth/signup/code', channel === 'email' ? { channel, email: f.email } : { channel, phone: f.phone, dial: f.dial }); if (!r.skipped) setSent({ ...r, at: Date.now() }); setNow(Date.now()); return r; };
  const cityList = citiesFor(f.country, f.state);
  const mismatch = f.confirmPassword && f.password !== f.confirmPassword;
  const detailsOk = f.name.trim() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email) && f.phone.replace(/\D/g, '').length >= 6 && f.clinicName.trim() && f.clinicType && f.state && f.city.trim() && passwordOk(f.password) && f.password === f.confirmPassword && f.acceptTerms;
  const [otpSent, setOtpSent] = useState(null);
  const [loginWith, setLoginWith] = useState('password');
  const [showPw, setShowPw] = useState(false);
  const [keep, setKeep] = useState(true);
  const [invite, setInvite] = useState(null);
  const set = (k, v) => { setF({ ...f, [k]: v }); if (err) setErr(''); };
  useEffect(() => { if (mode === 'invite' && inviteToken) get(`/api/auth/invite/${inviteToken}`).then(setInvite).catch((e) => setErr(e.message)); }, [mode, inviteToken]);
  const finish = (me) => { setRemember(mode === 'login' ? keep : true); session.login(me); navigate(me.tenant?.onboarding?.completed === false && me.canManage ? '#/onboarding' : '#/'); };
  const submit = (fn) => run(async () => { setErr(''); try { await fn(); } catch (e) { setErr(e.message); } });
  const demo = (role) => submit(async () => finish(await post('/api/auth/demo', { role })));

  return (
    <div className="au">
      <aside className="au-side">
        <svg className="au-wave" viewBox="0 0 120 1000" preserveAspectRatio="none" aria-hidden><path d="M120 0H74C8 160 118 300 62 520C22 690 104 850 66 1000H120Z" /></svg>
        <span className="au-glow a" /><span className="au-glow b" />
        <div className="au-side-in">
          <a href="#/" className="au-brand"><img src="/brand/clinovara-mark.svg" alt="" /><span>Clinovara</span></a>
          <span className="au-pill">Clinic operating system</span>
          <h2>The front desk your clinic <em>never</em> has to staff.</h2>
          <p className="au-lead">Bookings, check-ins and patient messages. One place.</p>
          <ul className="au-points">
            {[[IconCalendarEvent, 'Online booking, on your hours'], [IconUsers, 'Kiosk check-in and a live queue'], [IconMessageDots, 'AI replies to patients, flags clinical queries'], [IconBolt, 'Free for 30 days. Set up in 10 minutes.']].map(([Icon, t]) => <li key={t}><i><Icon size={20} stroke={1.8} /></i>{t}</li>)}
          </ul>
        </div>
        <ClinicScene />
      </aside>
      <div className="au-main"><span className="au-orb a" /><span className="au-orb b" /><div className={`au-card ${mode === 'signup' ? 'wide' : ''}`}>
        <a href="#/" className="au-logo"><img src="/brand/clinovara-app-icon.svg" alt="" /><span>Clinovara</span></a>
        {err && <div className="au-err" role="alert">{err}</div>}

        {mode === 'signup' && (<>
          {step === 'details' && (<>
            <div className="au-intro"><h1>Welcome to Clinovara</h1><p className="lead">Set up your clinic in minutes.</p><p className="muted">Start your 30-day free trial. No credit card required. You’ll have full owner access to manage your clinic and invite your team.</p></div>
            <div className="steps"><span className="done" /><span /><span /></div>

            <fieldset className="au-sec">
              <legend><i>1</i>Clinic Details</legend>
              <div className="grid two">
                <Field label="Clinic Name"><input className="input" value={f.clinicName} onChange={(e) => set('clinicName', e.target.value)} placeholder="SmileCare Dental" autoComplete="organization" autoFocus /></Field>
                <Field label="Clinic Type"><select className="input" value={f.clinicType} onChange={(e) => set('clinicType', e.target.value)}><option value="">Choose…</option>{CLINIC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
              </div>
            </fieldset>

            <fieldset className="au-sec">
              <legend><i>2</i>Owner Details</legend>
              <div className="grid two">
                <Field label="Full Name"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Dr. Ananya Rao" autoComplete="name" /></Field>
                <Field label="Business Email"><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="you@clinic.com" autoComplete="email" /></Field>
                <Field label="Phone Number"><div className="row gap-6"><select className="input au-dial" value={f.dial} onChange={(e) => set('dial', e.target.value)} aria-label="Country calling code">{DIALS.map(([d, n]) => <option key={n} value={d} title={n}>+{d}</option>)}</select><input className="input" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="98450 12345" autoComplete="tel-national" /></div></Field>
              </div>
            </fieldset>

            <fieldset className="au-sec">
              <legend><i>3</i>Clinic Location</legend>
              <div className="grid three">
                <Field label="Country"><select className="input" value={f.country} onChange={(e) => { const c = DIALS.find(([, n]) => n === e.target.value); setF({ ...f, country: e.target.value, dial: c ? c[0] : f.dial, state: '', city: '', cityOther: false }); }}>{DIALS.map(([, n]) => <option key={n}>{n}</option>)}</select></Field>
                <Field label="State / Region"><select className="input" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value, city: '', cityOther: false })}><option value="">Choose…</option>{regionsFor(f.country).map((x) => <option key={x}>{x}</option>)}</select></Field>
                <Field label="City">{f.country === 'India' && !f.cityOther
                  ? <select className="input" value={f.city} disabled={!f.state} onChange={(e) => (e.target.value === '__other' ? setF({ ...f, city: '', cityOther: true }) : set('city', e.target.value))}><option value="">{f.state ? 'Choose…' : 'Choose a state first'}</option>{cityList.map((x) => <option key={x}>{x}</option>)}<option value="__other">Other (type your city)</option></select>
                  : <div className="row gap-6"><input className="input" value={f.city} disabled={!f.state} onChange={(e) => set('city', e.target.value)} placeholder="Your city or town" />{f.cityOther && <button type="button" className="btn sm ghost" onClick={() => setF({ ...f, city: '', cityOther: false })}>List</button>}</div>}</Field>
              </div>
            </fieldset>

            <fieldset className="au-sec">
              <legend><i>4</i>Secure Your Account</legend>
              <div className="grid two">
                <Field label="Create Password"><PwInput value={f.password} onChange={(v) => set('password', v)} show={showPw} onToggle={() => setShowPw(!showPw)} /></Field>
                <Field label="Confirm Password" hint={mismatch ? <span style={{ color: '#b91c1c' }}>Passwords do not match.</span> : undefined}><PwInput value={f.confirmPassword} onChange={(v) => set('confirmPassword', v)} show={showPw} onToggle={() => setShowPw(!showPw)} /></Field>
              </div>
              <PwRules value={f.password} />
            </fieldset>

            <div className="au-checks">
              <label className="au-keep top"><input type="checkbox" checked={f.acceptTerms} onChange={(e) => set('acceptTerms', e.target.checked)} /><i /><span>I agree to the <a href="#/terms" target="_blank" rel="noreferrer">Terms of Service</a> and <a href="#/privacy" target="_blank" rel="noreferrer">Privacy Policy</a> and acknowledge my responsibilities under applicable data protection laws, including India’s DPDP Act, 2023.</span></label>
              <label className="au-keep top"><input type="checkbox" checked={f.demo} onChange={(e) => set('demo', e.target.checked)} /><i /><span><b>Explore with sample data.</b> Start with a demo clinic and reset it anytime.</span></label>
            </div>
            <button className="au-btn caps" disabled={busy || !detailsOk} onClick={() => submit(async () => { await sendCode('email'); setStep('email'); })}>{busy ? 'One moment…' : 'Create my clinic'} <IconArrowRight size={19} /></button>
            <p className="au-explore">Already have an account? <a href="#/login">Sign in</a></p>
            <p className="au-fine">30 days free · No credit card · Cancel anytime</p>
          </>)}
          {(step === 'email' || step === 'phone') && sent && (() => {
            const isEmail = step === 'email'; const field = isEmail ? 'emailCode' : 'phoneCode'; const to = isEmail ? f.email : `+${f.dial} ${f.phone}`;
            const left = Math.max(0, Math.ceil(((sent.at || 0) + 30000 - now) / 1000));
            const verify = (code = f[field]) => submit(async () => {
              await post('/api/auth/signup/verify', isEmail ? { channel: 'email', email: f.email, code } : { channel: 'phone', phone: f.phone, dial: f.dial, code });
              if (isEmail) { const r = await sendCode('phone'); if (r.skipped) finish(await post('/api/auth/register', f)); else setStep('phone'); } else finish(await post('/api/auth/register', f));
            });
            return (
              <div className="au-verify" key={step}>
                <p className="stepno">Step {isEmail ? 2 : 3} of 3</p>
                <h1>{isEmail ? 'Verify your email' : 'Verify your phone number'}</h1>
                <p className="to">Enter the 6-digit code we sent to <b>{to}</b>. It expires in 10 minutes.{!isEmail && ' Your email is verified.'}</p>
                <label className="codelbl" htmlFor="au-code-0">Verification code</label>
                <CodeBoxes value={f[field]} onChange={(v) => set(field, v)} onComplete={(v) => !busy && verify(v)} disabled={busy} label={isEmail ? 'Email verification code' : 'Phone verification code'} />
                {sent.devCode && <p className="au-test">Test build: no {isEmail ? 'email' : 'SMS'} provider is connected, so the code is shown here. Your code is <b>{String(sent.devCode)}</b>. <button type="button" onClick={() => set(field, String(sent.devCode))}>Fill it in</button></p>}
                <button className="au-btn" disabled={busy || f[field].length < 6} onClick={() => verify()}>{busy ? 'Checking…' : isEmail ? 'Verify email' : 'Verify and create clinic'} <IconArrowRight size={19} /></button>
                <div className="au-verify-foot">
                  <span>Didn’t get it? {left > 0 ? <em>Resend in {left}s</em> : <a href="#/signup" onClick={(e) => { e.preventDefault(); set(field, ''); submit(async () => sendCode(isEmail ? 'email' : 'phone')); }}>Resend code</a>}</span>
                  <a href="#/signup" onClick={(e) => { e.preventDefault(); setStep('details'); setErr(''); }}>{isEmail ? 'Change email' : 'Change phone number'}</a>
                </div>
              </div>
            );
          })()}
        </>)}

        {mode === 'login' && (<>
          <div><h1>Log in</h1><p className="muted">Welcome back to your clinic workspace.</p></div>
          {params.get('demo') && <div className="callout small col gap-6"><b>Try the demo clinic, SmileCare Dental (Bengaluru, 2 branches):</b><div className="row wrap gap-6"><button className="btn primary sm" disabled={busy} onClick={() => demo('owner')}>As the owner</button><button className="btn sm" disabled={busy} onClick={() => demo('front_desk')}>As front desk</button><button className="btn sm" disabled={busy} onClick={() => demo('dentist')}>As a dentist</button></div></div>}
          {verif.sms && (
            <div className="au-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={loginWith === 'password'} className={loginWith === 'password' ? 'on' : ''} onClick={() => setLoginWith('password')}><IconMail size={18} />Email &amp; Password</button>
              <button type="button" role="tab" aria-selected={loginWith === 'otp'} className={loginWith === 'otp' ? 'on' : ''} onClick={() => setLoginWith('otp')}><IconDeviceMobile size={18} />Mobile OTP</button>
            </div>
          )}
          {loginWith === 'password' || !verif.sms ? (
            <form className="au-form" onSubmit={(e) => { e.preventDefault(); if (!f.email || !f.password) { setErr('Enter your email and password to log in.'); return; } submit(async () => finish(await post('/api/auth/login', { email: f.email, password: f.password }))); }}>
              <label className="au-field"><span>Email</span><div><IconMail size={19} /><input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="Enter your email" autoComplete="email" autoFocus /></div></label>
              <label className="au-field"><span>Password</span><div><IconLock size={19} /><input type={showPw ? 'text' : 'password'} value={f.password} onChange={(e) => set('password', e.target.value)} placeholder="Enter your password" autoComplete="current-password" /><button type="button" className="eye" onClick={() => setShowPw(!showPw)} aria-label={showPw ? 'Hide password' : 'Show password'}>{showPw ? <IconEyeOff size={19} /> : <IconEye size={19} />}</button></div></label>
              <div className="au-row"><label className="au-keep"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /><i />Keep me signed in</label><a href="#/forgot">Forgot password?</a></div>
              <button type="submit" className="au-btn" disabled={busy}>{busy ? 'Logging in…' : 'Log in'} <IconArrowRight size={19} /></button>
            </form>
          ) : (
            <div className="au-form">
              <label className="au-field"><span>Mobile number</span><div><IconDeviceMobile size={19} /><b>+91</b><input inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="98450 12345" autoComplete="tel" autoFocus /></div></label>
              {!otpSent ? <button type="button" className="au-btn" disabled={busy || !f.phone} onClick={() => submit(async () => setOtpSent(await post('/api/auth/code', { phone: f.phone, purpose: 'login' })))}>Send code <IconArrowRight size={19} /></button> : (<>
                <div className="callout small">Code sent to +91 {otpSent.to}. {otpSent.devCode && <>No SMS provider is connected in this build, so here it is: <b className="mono">{otpSent.devCode}</b></>}</div>
                <label className="au-field"><span>6-digit code</span><div><IconLock size={19} /><input className="mono" inputMode="numeric" maxLength={6} value={f.code} onChange={(e) => set('code', e.target.value.replace(/\D/g, ''))} placeholder="000000" /></div></label>
                <div className="au-row"><label className="au-keep"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /><i />Keep me signed in</label></div>
                <button type="button" className="au-btn" disabled={busy || f.code.length < 6} onClick={() => submit(async () => finish(await post('/api/auth/verify', { phone: f.phone, purpose: 'login', code: f.code })))}>Verify and log in <IconArrowRight size={19} /></button>
              </>)}
            </div>
          )}
          <div className="au-or"><span>New to Clinovara?</span></div>
          <a href="#/signup" className="au-btn outline">Register your clinic</a>
          {!params.get('demo') && <p className="au-explore">Just exploring? <a href="#/login?demo=1">Try the demo clinic <IconArrowRight size={16} /></a></p>}
        </>)}

        {mode === 'forgot' && (<>
          <div><h1>Reset password</h1><p className="muted">We will send a one-time code to your email{verif.sms ? ' or mobile' : ''}.</p></div>
          <Field label="Mobile or email"><input className="input" value={f.phone || f.email} onChange={(e) => (e.target.value.includes('@') ? setF({ ...f, email: e.target.value, phone: '' }) : setF({ ...f, phone: e.target.value, email: '' }))} autoFocus /></Field>
          {!otpSent ? <button className="btn primary lg" disabled={busy || !(f.phone || f.email)} onClick={() => submit(async () => setOtpSent(await post('/api/auth/code', { phone: f.phone || undefined, email: f.email || undefined, purpose: 'reset' })))}>Send code</button> : (<>
            <div className="callout small">Code sent. {otpSent.devCode && <>No SMS/email provider is connected in this build, so here it is: <b className="mono">{otpSent.devCode}</b></>}</div>
            <div className="grid two"><Field label="Code"><input className="input mono" value={f.code} onChange={(e) => set('code', e.target.value)} /></Field><Field label="New password"><PwInput value={f.newPassword} onChange={(v) => set('newPassword', v)} show={showPw} onToggle={() => setShowPw(!showPw)} /></Field></div>
            <PwRules value={f.newPassword} />
            <button className="btn primary lg" disabled={busy || f.code.length < 6 || !passwordOk(f.newPassword)} onClick={() => submit(async () => finish(await post('/api/auth/verify', { phone: f.phone || undefined, email: f.email || undefined, purpose: 'reset', code: f.code, newPassword: f.newPassword })))}>Set password and log in</button>
          </>)}
          <div className="tiny muted"><a href="#/login">Back to log in</a></div>
        </>)}

        {mode === 'invite' && (<>
          {!invite ? (!err && <div className="skeleton" />) : (<>
            <div><h1>Join {invite.clinic}</h1><p className="muted">{invite.invitedBy} invited you as <b>{invite.roleLabel}</b> ({invite.email}).</p></div>
            {invite.existingAccount ? <Field label="Your Clinovara password"><input className="input" type="password" value={f.password} onChange={(e) => set('password', e.target.value)} autoFocus /></Field> : (<div className="grid two">
              <Field label="Your name"><input className="input" value={f.name || invite.name || ''} onChange={(e) => set('name', e.target.value)} autoFocus /></Field>
              <Field label="Mobile (+91)"><input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
              <Field label="Choose a password"><PwInput value={f.password} onChange={(v) => set('password', v)} show={showPw} onToggle={() => setShowPw(!showPw)} /></Field>
            </div>)}
            {!invite.existingAccount && <PwRules value={f.password} />}
            <button className="btn primary lg" disabled={busy || (invite.existingAccount ? !f.password : !passwordOk(f.password))} onClick={() => submit(async () => finish(await post(`/api/auth/invite/${inviteToken}/accept`, { name: f.name || invite.name, phone: f.phone, password: f.password })))}>Accept and join</button>
          </>)}
        </>)}
      </div></div>
    </div>
  );
}

/** Six single-digit boxes that behave like one field: type, backspace, arrow keys and paste all work. */
function CodeBoxes({ value, onChange, onComplete, disabled, label }) {
  const refs = useRef([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || '');
  useEffect(() => { refs.current[0]?.focus(); }, []);
  const put = (next) => { const v = next.replace(/\D/g, '').slice(0, 6); onChange(v); if (v.length === 6 && v !== value) onComplete?.(v); return v; };
  const onInput = (i, raw) => {
    const d = raw.replace(/\D/g, '');
    if (!d) return;
    const v = put(value.slice(0, i) + d + value.slice(i + d.length));
    refs.current[Math.min(5, Math.min(v.length, i + d.length))]?.focus();
  };
  const onKey = (i, e) => {
    if (e.key === 'Backspace') { e.preventDefault(); const at = digits[i] ? i : Math.max(0, i - 1); onChange(value.slice(0, at)); refs.current[at]?.focus(); }
    else if (e.key === 'ArrowLeft') refs.current[Math.max(0, i - 1)]?.focus();
    else if (e.key === 'ArrowRight') refs.current[Math.min(5, i + 1)]?.focus();
    else if (e.key === 'Enter' && value.length === 6) onComplete?.(value);
  };
  return (
    <div className="au-code" role="group" aria-label={label} onPaste={(e) => { e.preventDefault(); const v = put(e.clipboardData.getData('text')); refs.current[Math.min(5, v.length)]?.focus(); }}>
      {digits.map((d, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }} className={d ? 'filled' : ''} value={d} disabled={disabled} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={6} id={`au-code-${i}`} aria-label={`Digit ${i + 1}`}
          onChange={(e) => onInput(i, e.target.value)} onKeyDown={(e) => onKey(i, e)} onFocus={(e) => e.target.select()} />
      ))}
    </div>
  );
}

/** Password box with a show/hide eye. */
function PwInput({ value, onChange, show, onToggle }) {
  return (
    <div className="au-pw">
      <input className="input" type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="new-password" />
      <button type="button" onClick={onToggle} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <IconEyeOff size={18} /> : <IconEye size={18} />}</button>
    </div>
  );
}
/** Live checklist of the password rules, with a strength bar. */
function PwRules({ value }) {
  const met = PASSWORD_RULES.map(([, ok]) => ok(value || ''));
  const n = met.filter(Boolean).length;
  const label = !value ? '' : n <= 2 ? 'Weak' : n < PASSWORD_RULES.length ? 'Almost there' : 'Strong';
  return (
    <div className="au-rules" aria-live="polite">
      <div className="hd"><span>Your password must have</span>{label && <b className={`lv${n}`}>{label}</b>}</div>
      <div className="bar">{PASSWORD_RULES.map((_, i) => <i key={i} className={i < n ? `on lv${n}` : ''} />)}</div>
      <ul>{PASSWORD_RULES.map(([text], i) => <li key={text} className={met[i] ? 'ok' : ''}><i>{met[i] && <IconCheck size={11} stroke={3.5} />}</i>{text}</li>)}</ul>
    </div>
  );
}

/** Side-panel illustration: a dental chair under its lamp, a cabinet with a screen, and a plant in the foreground. */
function ClinicScene() {
  return (
    <svg className="au-scene" viewBox="0 0 700 320" preserveAspectRatio="xMidYMax meet" aria-hidden>
      <defs>
        <linearGradient id="auW" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#cfdcf8" /></linearGradient>
        <linearGradient id="auW2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#bccdf3" /></linearGradient>
        <linearGradient id="auB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6fb0ff" /><stop offset="0.55" stopColor="#2f6fed" /><stop offset="1" stopColor="#1b46b8" /></linearGradient>
        <linearGradient id="auScr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7cc0ff" /><stop offset="1" stopColor="#1f55d6" /></linearGradient>
        <linearGradient id="auLeaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7ee8d3" /><stop offset="1" stopColor="#157a6e" /></linearGradient>
        <linearGradient id="auCone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff8d6" stopOpacity="0.75" /><stop offset="1" stopColor="#ffffff" stopOpacity="0" /></linearGradient>
        <radialGradient id="auFloor" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#ffffff" stopOpacity="0.9" /><stop offset="1" stopColor="#ffffff" stopOpacity="0" /></radialGradient>
        <radialGradient id="auBulb" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#ffe9a3" /></radialGradient>
        <filter id="auSoft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5" /></filter>
        <filter id="auDrop" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="10" stdDeviation="9" floodColor="#173a9c" floodOpacity="0.28" /></filter>
      </defs>

      {/* bright floor the furniture stands on */}
      <ellipse cx="400" cy="300" rx="330" ry="46" fill="url(#auFloor)" />
      <ellipse cx="410" cy="296" rx="250" ry="13" fill="#1e3a8a" opacity="0.16" filter="url(#auSoft)" />

      {/* lamp: pole, arm, head and its light */}
      <g filter="url(#auDrop)">
        <rect x="498" y="96" width="11" height="196" rx="5.5" fill="url(#auW)" />
        <rect x="480" y="284" width="48" height="12" rx="6" fill="url(#auW2)" />
        <path d="M503 100C498 64 462 50 424 58" fill="none" stroke="url(#auW)" strokeWidth="11" strokeLinecap="round" />
        <circle cx="503" cy="100" r="10" fill="#e3ebfb" />
        <g transform="rotate(-14 404 74)">
          <path d="M358 66C358 53 379 44 404 44C429 44 450 53 450 66V74H358Z" fill="url(#auW)" />
          <ellipse cx="404" cy="75" rx="46" ry="9" fill="url(#auBulb)" />
        </g>
      </g>
      <path d="M362 90L448 70L452 196L262 198Z" fill="url(#auCone)" opacity="0.65" />

      {/* chair: every part hangs off the seat so the pieces stay joined */}
      <g filter="url(#auDrop)">
        <ellipse cx="330" cy="290" rx="84" ry="11" fill="url(#auW2)" />
        <rect x="312" y="228" width="36" height="60" rx="9" fill="url(#auW2)" />
        <rect x="298" y="220" width="64" height="18" rx="9" fill="#dfe8fb" />
        {/* backrest with headrest, rising up and back from the rear of the seat */}
        <g transform="translate(276 204) rotate(-124)">
          <rect x="-6" y="-20" width="142" height="40" rx="20" fill="url(#auW)" />
          <rect x="8" y="-13" width="112" height="22" rx="11" fill="url(#auB)" />
          <rect x="20" y="-9" width="70" height="5" rx="2.5" fill="#fff" opacity="0.35" />
          <rect x="128" y="-17" width="58" height="34" rx="16" fill="url(#auW)" />
          <rect x="135" y="-11" width="44" height="20" rx="10" fill="url(#auB)" />
        </g>
        {/* leg rest and foot plate, sloping down from the front of the seat */}
        <g transform="translate(404 208) rotate(33)">
          <rect x="-6" y="-15" width="112" height="30" rx="15" fill="url(#auW)" />
          <rect x="6" y="-10" width="86" height="16" rx="8" fill="url(#auB)" />
          <rect x="100" y="-24" width="13" height="46" rx="6.5" fill="url(#auW2)" />
        </g>
        {/* seat */}
        <path d="M256 206C256 193 266 186 279 186H402C417 186 427 196 425 210C424 221 414 228 402 228H279C265 228 256 220 256 206Z" fill="url(#auW)" />
        <rect x="272" y="191" width="136" height="21" rx="10.5" fill="url(#auB)" />
        <rect x="284" y="195" width="80" height="5" rx="2.5" fill="#fff" opacity="0.35" />
        {/* armrest */}
        <rect x="300" y="158" width="88" height="13" rx="6.5" fill="url(#auW2)" />
        <rect x="338" y="168" width="10" height="22" rx="4" fill="#d5e0f8" />
      </g>

      {/* cabinet with basin and screen */}
      <g filter="url(#auDrop)">
        <rect x="530" y="212" width="160" height="84" rx="14" fill="url(#auW)" />
        <rect x="524" y="204" width="172" height="16" rx="8" fill="#ffffff" />
        <rect x="542" y="230" width="64" height="24" rx="8" fill="#dbe5fa" /><rect x="614" y="230" width="64" height="24" rx="8" fill="#dbe5fa" />
        <rect x="542" y="262" width="136" height="24" rx="8" fill="#e4ecfc" />
        <rect x="566" y="240" width="16" height="4" rx="2" fill="#a9bdea" /><rect x="638" y="240" width="16" height="4" rx="2" fill="#a9bdea" /><rect x="600" y="272" width="20" height="4" rx="2" fill="#a9bdea" />
        <rect x="604" y="186" width="12" height="20" rx="3" fill="#cdd9f5" /><rect x="584" y="198" width="52" height="8" rx="4" fill="#dfe8fb" />
        <rect x="548" y="96" width="124" height="92" rx="12" fill="#12327f" />
        <rect x="555" y="103" width="110" height="78" rx="7" fill="url(#auScr)" />
        <path d="M555 110a7 7 0 0 1 7-7h60l-67 52z" fill="#fff" opacity="0.14" />
        <path d="M610 120c-9 0-14 4-14 13 0 8 2 14 5 21 1 4 6 4 7-1l1.5-8c.4-2 2.6-2 3 0l1.5 8c1 5 6 5 7 1 3-7 5-13 5-21 0-9-5-13-16-13z" fill="none" stroke="#fff" strokeWidth="4" strokeLinejoin="round" />
      </g>

      {/* plant, soft in the foreground */}
      <g filter="url(#auSoft)" opacity="0.9">
        <path d="M58 320C30 250 22 190 64 120C86 186 86 262 78 320Z" fill="url(#auLeaf)" />
        <path d="M96 320C100 240 126 184 182 150C170 220 142 280 122 320Z" fill="url(#auLeaf)" opacity="0.85" />
        <path d="M30 320C2 276-8 230 12 186C36 228 46 280 50 320Z" fill="url(#auLeaf)" opacity="0.75" />
        <path d="M130 320C150 276 176 250 214 240C200 276 176 304 156 320Z" fill="url(#auLeaf)" opacity="0.6" />
      </g>
    </svg>
  );
}
