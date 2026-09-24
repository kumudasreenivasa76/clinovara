import Logo from '../components/Logo.jsx';
import React, { useEffect, useState } from 'react';
import { IconDental, IconArrowRight, IconDeviceMobile, IconMail } from '@tabler/icons-react';
import { get, post } from '../lib/api.js';
import { Field, useAction, Seg } from '../components/ui.jsx';
import { navigate } from '../App.jsx';

export default function Auth({ mode, session, inviteToken }) {
  const [run, busy] = useAction();
  const [err, setErr] = useState('');
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '', clinicName: '', city: '', demo: false, code: '', newPassword: '' });
  const [otpSent, setOtpSent] = useState(null);
  const [loginWith, setLoginWith] = useState('password');
  const [invite, setInvite] = useState(null);
  const set = (k, v) => setF({ ...f, [k]: v });
  useEffect(() => { if (mode === 'invite' && inviteToken) get(`/api/auth/invite/${inviteToken}`).then(setInvite).catch((e) => setErr(e.message)); }, [mode, inviteToken]);
  const finish = (me) => { session.login(me); navigate(me.tenant?.onboarding?.completed === false && me.canManage ? '#/onboarding' : '#/dashboard'); };
  const submit = (fn) => run(async () => { setErr(''); try { await fn(); } catch (e) { setErr(e.message); } });
  const demo = (role) => submit(async () => finish(await post('/api/auth/demo', { role })));

  return (
    <div className="auth">
      <div className="auth-card">
        <a href="#/" className="row" style={{ color: 'inherit' }}><div className="brand-mark"><Logo /></div><div className="brand-name">Clinovara</div></a>
        {err && <div className="callout bad small">{err}</div>}

        {mode === 'signup' && (<>
          <div><h1>Register your clinic</h1><p className="muted">Free for 30 days. You will be the owner and can invite your team.</p></div>
          <div className="grid two">
            <Field label="Your name"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Dr. Ananya Rao" autoFocus /></Field>
            <Field label="Mobile (+91)"><input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="98450 12345" /></Field>
            <Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="Password" hint="At least 8 characters"><input className="input" type="password" value={f.password} onChange={(e) => set('password', e.target.value)} /></Field>
            <Field label="Clinic name"><input className="input" value={f.clinicName} onChange={(e) => set('clinicName', e.target.value)} placeholder="SmileCare Dental" /></Field>
            <Field label="City"><input className="input" value={f.city} onChange={(e) => set('city', e.target.value)} placeholder="Bengaluru" /></Field>
          </div>
          <label className="check small"><input type="checkbox" checked={f.demo} onChange={(e) => set('demo', e.target.checked)} />Start with sample data so I can explore (you can reset it later)</label>
          <button className="btn primary lg" disabled={busy || !f.name || !f.email || !f.password || !f.clinicName} onClick={() => submit(async () => finish(await post('/api/auth/register', f)))}>Create clinic <IconArrowRight size={18} /></button>
          <div className="tiny muted">By registering you agree to keep patient data in line with the Digital Personal Data Protection Act, 2023. Already have an account? <a href="#/login">Log in</a></div>
        </>)}

        {mode === 'login' && (<>
          <div><h1>Log in</h1><p className="muted">Welcome back.</p></div>
          {params.get('demo') && <div className="callout small col gap-6"><b>Try the demo clinic, SmileCare Dental (Bengaluru, 2 branches):</b><div className="row wrap gap-6"><button className="btn primary sm" disabled={busy} onClick={() => demo('owner')}>As the owner</button><button className="btn sm" disabled={busy} onClick={() => demo('front_desk')}>As front desk</button><button className="btn sm" disabled={busy} onClick={() => demo('dentist')}>As a dentist</button></div></div>}
          <Seg value={loginWith} onChange={setLoginWith} options={[{ value: 'password', label: <span className="row gap-4"><IconMail size={14} />Email & password</span> }, { value: 'otp', label: <span className="row gap-4"><IconDeviceMobile size={14} />Mobile OTP</span> }]} />
          {loginWith === 'password' ? (<>
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
          <div><h1>Reset password</h1><p className="muted">We will send a one-time code to your mobile or email.</p></div>
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
      </div>
    </div>
  );
}
