import Logo from '../components/Logo.jsx';
import React, { useEffect, useState } from 'react';
import { IconDental, IconArrowRight, IconDeviceMobile, IconMail, IconCheck } from '@tabler/icons-react';
import { get, post } from '../lib/api.js';
import { regionsFor, citiesFor } from '../lib/places.js';
import { Field, useAction, Seg } from '../components/ui.jsx';
import { navigate } from '../App.jsx';

const CLINIC_TYPES = ['General dental clinic', 'Multi-specialty dental clinic', 'Orthodontic clinic', 'Pediatric dental clinic', 'Oral surgery / implant centre', 'Dental chain / group', 'Other'];
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
  const detailsOk = f.name.trim() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email) && f.phone.replace(/\D/g, '').length >= 6 && f.clinicName.trim() && f.clinicType && f.state && f.city.trim() && f.password.length >= 8 && f.password === f.confirmPassword && f.acceptTerms;
  const [otpSent, setOtpSent] = useState(null);
  const [loginWith, setLoginWith] = useState('password');
  const [invite, setInvite] = useState(null);
  const set = (k, v) => setF({ ...f, [k]: v });
  useEffect(() => { if (mode === 'invite' && inviteToken) get(`/api/auth/invite/${inviteToken}`).then(setInvite).catch((e) => setErr(e.message)); }, [mode, inviteToken]);
  const finish = (me) => { session.login(me); navigate(me.tenant?.onboarding?.completed === false && me.canManage ? '#/onboarding' : '#/'); };
  const submit = (fn) => run(async () => { setErr(''); try { await fn(); } catch (e) { setErr(e.message); } });
  const demo = (role) => submit(async () => finish(await post('/api/auth/demo', { role })));

  return (
    <div className="auth2">
      <aside className="auth2-side">
        <div className="ob-brand"><div className="brand-mark"><Logo /></div><span>Clinovara</span></div>
        <div className="ob-hero"><h2>The front desk your clinic never has to staff.</h2><p>Booking, reminders, check-in and patient messages, handled and in one place.</p></div>
        <ul className="auth2-points">{['Online booking that respects your hours and dentists', 'Kiosk check-in and a live waiting-room display', 'An assistant that answers patient messages, and hands the clinical ones to you', 'Free for 30 days, set up in about 10 minutes'].map((t) => <li key={t}><IconCheck size={16} />{t}</li>)}</ul>
      </aside>
      <div className="auth2-main"><div className="auth-card">
        <a href="#/" className="row" style={{ color: 'inherit' }}><div className="brand-mark"><Logo /></div><div className="brand-name">Clinovara</div></a>
        {err && <div className="callout bad small">{err}</div>}

        {mode === 'signup' && (<>
          <div><h1>Register your clinic</h1><p className="muted">Free for 30 days. You will be the owner and can invite your team.</p></div>
          <div className="steps"><span className="done" /><span className={step !== 'details' ? 'done' : ''} /><span className={step === 'phone' ? 'done' : ''} /></div>
          {step === 'details' && (<>
            <div className="grid two">
              <Field label="Clinic name"><input className="input" value={f.clinicName} onChange={(e) => set('clinicName', e.target.value)} placeholder="SmileCare Dental" autoFocus /></Field>
              <Field label="Clinic type"><select className="input" value={f.clinicType} onChange={(e) => set('clinicType', e.target.value)}><option value="">Choose…</option>{CLINIC_TYPES.map((x) => <option key={x}>{x}</option>)}</select></Field>
              <Field label="Owner / administrator full name"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Dr. Ananya Rao" /></Field>
              <Field label="Business email"><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
              <Field label="Phone number"><div className="row gap-6"><select className="input" style={{ width: 104 }} value={f.dial} onChange={(e) => set('dial', e.target.value)}>{DIALS.map(([d, n]) => <option key={n} value={d}>+{d} {n}</option>)}</select><input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="98450 12345" /></div></Field>
              <Field label="Country"><select className="input" value={f.country} onChange={(e) => { const c = DIALS.find(([, n]) => n === e.target.value); setF({ ...f, country: e.target.value, dial: c ? c[0] : f.dial, state: '', city: '', cityOther: false }); }}>{DIALS.map(([, n]) => <option key={n}>{n}</option>)}</select></Field>
              <Field label="State / region"><select className="input" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value, city: '', cityOther: false })}><option value="">Choose…</option>{regionsFor(f.country).map((x) => <option key={x}>{x}</option>)}</select></Field>
              <Field label="City">{f.country === 'India' && !f.cityOther
                ? <select className="input" value={f.city} disabled={!f.state} onChange={(e) => (e.target.value === '__other' ? setF({ ...f, city: '', cityOther: true }) : set('city', e.target.value))}><option value="">{f.state ? 'Choose…' : 'Choose a state first'}</option>{cityList.map((x) => <option key={x}>{x}</option>)}<option value="__other">Other (type your city)</option></select>
                : <div className="row gap-6"><input className="input" value={f.city} disabled={!f.state} onChange={(e) => set('city', e.target.value)} placeholder="Your city or town" />{f.cityOther && <button type="button" className="btn sm ghost" onClick={() => setF({ ...f, city: '', cityOther: false })}>List</button>}</div>}</Field>
              <Field label="Password" hint="At least 8 characters"><input className="input" type="password" value={f.password} onChange={(e) => set('password', e.target.value)} /></Field>
              <Field label="Confirm password"><input className="input" type="password" value={f.confirmPassword} onChange={(e) => set('confirmPassword', e.target.value)} /></Field>
            </div>
            {mismatch && <div className="tiny" style={{ color: 'var(--bad)' }}>Passwords do not match.</div>}
            <label className="check small"><input type="checkbox" checked={f.acceptTerms} onChange={(e) => set('acceptTerms', e.target.checked)} /><span>I agree to the <a href="#/terms" target="_blank" rel="noreferrer">Terms of Service</a> and <a href="#/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>, and to handle patient data in line with the Digital Personal Data Protection Act, 2023.</span></label>
            <label className="check small"><input type="checkbox" checked={f.demo} onChange={(e) => set('demo', e.target.checked)} /><span>Start with sample data so I can explore (you can reset it later)</span></label>
            <button className="btn primary lg" disabled={busy || !detailsOk} onClick={() => submit(async () => { await sendCode('email'); setStep('email'); })}>Continue <IconArrowRight size={18} /></button>
            <div className="tiny muted">Already have an account? <a href="#/login">Log in</a></div>
          </>)}
          {(step === 'email' || step === 'phone') && sent && (() => {
            const isEmail = step === 'email'; const field = isEmail ? 'emailCode' : 'phoneCode'; const to = isEmail ? f.email : `+${f.dial} ${f.phone}`;
            const left = Math.max(0, Math.ceil(((sent.at || 0) + 30000 - now) / 1000));
            const verify = () => submit(async () => {
              await post('/api/auth/signup/verify', isEmail ? { channel: 'email', email: f.email, code: f[field] } : { channel: 'phone', phone: f.phone, dial: f.dial, code: f[field] });
              if (isEmail) { const r = await sendCode('phone'); if (r.skipped) finish(await post('/api/auth/register', f)); else setStep('phone'); } else finish(await post('/api/auth/register', f));
            });
            return (<>
              <div><h2 style={{ fontSize: 20 }}>{isEmail ? 'Verify your email' : 'Verify your phone number'}</h2><p className="small muted">Enter the 6-digit code we sent to <b>{to}</b>. It expires in 10 minutes.{!isEmail && ' Your email is verified.'}</p></div>
              <Field label="Verification code"><input className="input mono" style={{ fontSize: 22, letterSpacing: 6, textAlign: 'center' }} inputMode="numeric" maxLength={6} autoFocus value={f[field]} onChange={(e) => set(field, e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && f[field].length === 6 && verify()} /></Field>
              {sent.devCode && <div className="callout small">No {isEmail ? 'email' : 'SMS'} provider is connected in this build, so the code is shown here: <b className="mono">{sent.devCode}</b></div>}
              <button className="btn primary lg" disabled={busy || f[field].length < 6} onClick={verify}>{isEmail ? 'Verify email' : 'Verify and create clinic'} <IconArrowRight size={18} /></button>
              <div className="row between small">
                <span className="muted">Didn't get it? {left > 0 ? <>Resend in {left}s</> : <a href="#/signup" onClick={(e) => { e.preventDefault(); submit(async () => sendCode(step === 'email' ? 'email' : 'phone')); }}>Resend code</a>}</span>
                <a href="#/signup" onClick={(e) => { e.preventDefault(); setStep('details'); setErr(''); }}>{isEmail ? 'Change email' : 'Change phone number'}</a>
              </div>
            </>);
          })()}
        </>)}

        {mode === 'login' && (<>
          <div><h1>Log in</h1><p className="muted">Welcome back.</p></div>
          {params.get('demo') && <div className="callout small col gap-6"><b>Try the demo clinic, SmileCare Dental (Bengaluru, 2 branches):</b><div className="row wrap gap-6"><button className="btn primary sm" disabled={busy} onClick={() => demo('owner')}>As the owner</button><button className="btn sm" disabled={busy} onClick={() => demo('front_desk')}>As front desk</button><button className="btn sm" disabled={busy} onClick={() => demo('dentist')}>As a dentist</button></div></div>}
          {verif.sms && <Seg value={loginWith} onChange={setLoginWith} options={[{ value: 'password', label: <span className="row gap-4"><IconMail size={14} />Email & password</span> }, { value: 'otp', label: <span className="row gap-4"><IconDeviceMobile size={14} />Mobile OTP</span> }]} />}
          {loginWith === 'password' || !verif.sms ? (<>
            <Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} autoFocus /></Field>
            <Field label="Password"><input className="input" type="password" value={f.password} onChange={(e) => set('password', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit(async () => finish(await post('/api/auth/login', { email: f.email, password: f.password })))} /></Field>
            <button className="btn primary lg" disabled={busy || !f.email || !f.password} onClick={() => submit(async () => finish(await post('/api/auth/login', { email: f.email, password: f.password })))}>Log in</button>
            <div className="row between tiny muted"><a href="#/forgot">Forgot password?</a><span>New here? <a href="#/signup">Register your clinic</a></span></div>
          </>) : (<>
            <Field label="Mobile (+91)"><input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} autoFocus /></Field>
            {!otpSent ? <button className="btn primary lg" disabled={busy || !f.phone} onClick={() => submit(async () => setOtpSent(await post('/api/auth/code', { phone: f.phone, purpose: 'login' })))}>Send code</button> : (<>
              <div className="callout small">Code sent to +91 {otpSent.to}. {otpSent.devCode && <>No SMS provider is connected in this build, so here it is: <b className="mono">{otpSent.devCode}</b></>}</div>
              <Field label="6-digit code"><input className="input mono" value={f.code} onChange={(e) => set('code', e.target.value)} /></Field>
              <button className="btn primary lg" disabled={busy || f.code.length < 6} onClick={() => submit(async () => finish(await post('/api/auth/verify', { phone: f.phone, purpose: 'login', code: f.code })))}>Verify and log in</button>
            </>)}
          </>)}
          {!params.get('demo') && <div className="tiny muted" style={{ textAlign: 'center' }}>Just looking? <a href="#/login?demo=1">Try the demo clinic</a></div>}
        </>)}

        {mode === 'forgot' && (<>
          <div><h1>Reset password</h1><p className="muted">We will send a one-time code to your email{verif.sms ? ' or mobile' : ''}.</p></div>
          <Field label="Mobile or email"><input className="input" value={f.phone || f.email} onChange={(e) => (e.target.value.includes('@') ? setF({ ...f, email: e.target.value, phone: '' }) : setF({ ...f, phone: e.target.value, email: '' }))} autoFocus /></Field>
          {!otpSent ? <button className="btn primary lg" disabled={busy || !(f.phone || f.email)} onClick={() => submit(async () => setOtpSent(await post('/api/auth/code', { phone: f.phone || undefined, email: f.email || undefined, purpose: 'reset' })))}>Send code</button> : (<>
            <div className="callout small">Code sent. {otpSent.devCode && <>No SMS/email provider is connected in this build, so here it is: <b className="mono">{otpSent.devCode}</b></>}</div>
            <div className="grid two"><Field label="Code"><input className="input mono" value={f.code} onChange={(e) => set('code', e.target.value)} /></Field><Field label="New password"><input className="input" type="password" value={f.newPassword} onChange={(e) => set('newPassword', e.target.value)} /></Field></div>
            <button className="btn primary lg" disabled={busy || f.code.length < 6 || f.newPassword.length < 8} onClick={() => submit(async () => finish(await post('/api/auth/verify', { phone: f.phone || undefined, email: f.email || undefined, purpose: 'reset', code: f.code, newPassword: f.newPassword })))}>Set password and log in</button>
          </>)}
          <div className="tiny muted"><a href="#/login">Back to log in</a></div>
        </>)}

        {mode === 'invite' && (<>
          {!invite ? (!err && <div className="skeleton" />) : (<>
            <div><h1>Join {invite.clinic}</h1><p className="muted">{invite.invitedBy} invited you as <b>{invite.roleLabel}</b> ({invite.email}).</p></div>
            {invite.existingAccount ? <Field label="Your Clinovara password"><input className="input" type="password" value={f.password} onChange={(e) => set('password', e.target.value)} autoFocus /></Field> : (<div className="grid two">
              <Field label="Your name"><input className="input" value={f.name || invite.name || ''} onChange={(e) => set('name', e.target.value)} autoFocus /></Field>
              <Field label="Mobile (+91)"><input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
              <Field label="Choose a password" hint="At least 8 characters"><input className="input" type="password" value={f.password} onChange={(e) => set('password', e.target.value)} /></Field>
            </div>)}
            <button className="btn primary lg" disabled={busy || f.password.length < 8} onClick={() => submit(async () => finish(await post(`/api/auth/invite/${inviteToken}/accept`, { name: f.name || invite.name, phone: f.phone, password: f.password })))}>Accept and join</button>
          </>)}
        </>)}
      </div></div>
    </div>
  );
}
