import React, { useEffect, useState } from 'react';
import { IconCheck, IconArrowRight, IconArrowLeft, IconPlus, IconTrash, IconRocket, IconPencil, IconExternalLink, IconCopy } from '@tabler/icons-react';
import { INDIA } from '../lib/places.js';
import { get, put, post } from '../lib/api.js';
import { Field, useAction, useToast } from '../components/ui.jsx';
import { TeamInvites } from './Onboarding.jsx';
import Logo from '../components/Logo.jsx';
import { navigate } from '../App.jsx';

const STEPS = [
  { key: 'clinic', label: 'Clinic', title: 'Where is your clinic?', sub: 'Patients see this on reminders, the kiosk and receipts.', core: 'profile' },
  { key: 'hours', label: 'Hours', title: 'When are you open?', sub: 'The schedule and the AI front desk only offer slots inside these hours.', core: 'branches' },
  { key: 'dentists', label: 'Dentists', title: 'Who sees patients?', sub: 'Each dentist gets a column on the schedule.', core: 'team' },
  { key: 'services', label: 'Services', title: 'What do you offer?', sub: 'Pick your visit types and set a fee and duration for each.', core: 'services' },
  { key: 'review', label: 'Launch', title: 'Review and launch', sub: 'Everything below can be changed later in Settings.' },
];
const DAYS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];
const STATES = Object.keys(INDIA);
const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Dhaka', 'Asia/Kathmandu', 'Asia/Colombo', 'Europe/London', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Australia/Sydney'];
const SPECIALTIES = ['General dentist', 'Orthodontist', 'Endodontist', 'Pedodontist', 'Periodontist', 'Oral surgeon', 'Prosthodontist', 'Hygienist'];
const uid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const hm = (t) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`; };

const t12 = (t) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
/** "Monday to Friday, 9:00 AM to 7:00 PM; Saturday, 9:00 AM to 2:00 PM. Closed Sunday." from the weekly hours. */
function hoursSentence(hours) {
  const groups = [];
  for (const [d, name] of DAYS) {
    const h = hours[d]; if (!h) continue;
    const key = `${h[0]}-${h[1]}`; const last = groups[groups.length - 1];
    if (last && last.key === key && last.next === d) { last.to = name; last.next = DAYS[DAYS.findIndex(([x]) => x === d) + 1]?.[0]; } else groups.push({ key, from: name, to: name, h, next: DAYS[DAYS.findIndex(([x]) => x === d) + 1]?.[0] });
  }
  const closed = DAYS.filter(([d]) => !hours[d]).map(([, n]) => n);
  const open = groups.map((g) => `${g.from === g.to ? g.from : `${g.from} to ${g.to}`}, ${t12(g.h[0])} to ${t12(g.h[1])}`).join('; ');
  return open ? `We are open ${open}.${closed.length ? ` Closed ${closed.join(' and ')}.` : ''}` : '';
}

const TIPS = {
  clinic: 'Patients see this on appointment reminders, your website and receipts. Use the address exactly as it appears on Google Maps so people can find you.',
  hours: 'These hours decide which times patients can book online and when the front desk assistant offers appointments. Different hours for another branch can be set later.',
  dentists: 'Each dentist gets their own column on the schedule. The fee you enter here is what patients are quoted when they book.',
  services: 'These are the visit types patients choose from. The duration blocks that much time on the dentist\'s calendar, so be realistic.',
  review: 'Everything can be changed later in Settings. Launching switches on your clinic website, the kiosk and the waiting-room display.',
};
const STEP_MIN = { clinic: 3, hours: 2, dentists: 3, services: 3, review: 1 };
const TIME_OPTIONS = Array.from({ length: 76 }, (_, k) => { const m = 5 * 60 + k * 15; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; });
const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const PRESETS = [
  ['Mon to Fri', ['mon', 'tue', 'wed', 'thu', 'fri'], ['09:00', '18:00']],
  ['Mon to Sat', ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'], ['09:00', '19:00']],
  ['Every day', ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], ['09:00', '19:00']],
];
/** Opening and closing time as dropdowns: the same on every browser, 15-minute steps, and never empty. */
function TimeSelect({ value, onChange, label }) {
  const opts = TIME_OPTIONS.includes(value) ? TIME_OPTIONS : [...TIME_OPTIONS, value].sort();
  return <select className="input time-select" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>{opts.map((t) => <option key={t} value={t}>{hm(t)}</option>)}</select>;
}

/** Short guided setup: five screens, one decision each. Everything saves to the same settings the rest of the app reads. */
export default function Setup({ session }) {
  const { me, refresh } = session;
  const [ob, setOb] = useState(null);
  const [s, setS] = useState(null);
  const [i, setI] = useState(0);
  const [far, setFar] = useState(0); // furthest step reached, so ticks only appear for steps you have been through
  const welcomeKey = `clinovara:welcomed:${me.tenant.id}`;
  const [welcome, setWelcome] = useState(() => { try { return !localStorage.getItem(welcomeKey) || window.location.hash.includes('welcome=1'); } catch { return true; } });
  const [run, busy] = useAction();
  const toast = useToast();
  const load = async () => { const [o, st] = await Promise.all([get('/api/onboarding'), get('/api/settings')]); setOb(o); setS(st); return [o, st]; };
  useEffect(() => {
    load().then(([o, st]) => {
      const done = (k) => o.steps.find((x) => x.key === k)?.done;
      const first = STEPS.findIndex((x) => x.core && !done(x.core));
      setI(first < 0 ? 4 : first); setFar(first < 0 ? 4 : first);
    });
  }, []); // eslint-disable-line
  // Suggest the owner as the first dentist when that screen opens (not saved until you continue).
  useEffect(() => {
    if (s && STEPS[i]?.key === 'dentists' && !s.providers.length) setS({ ...s, providers: [{ id: uid('prov'), name: s.practice.ownerName || '', role: 'Dentist', specialty: 'General dentist', qualifications: 'BDS', councilRegNo: '', hprId: '', locationIds: s.locations.map((l) => l.id), consultationFee: 500 }] });
  }, [i, s?.providers?.length]); // eslint-disable-line
  if (!ob || !s) return <div className="setup"><div className="setup-body"><div className="skeleton" /></div></div>;

  if (welcome && (window.location.hash.includes('welcome=1') || !ob.completed)) {
    const start = () => { try { localStorage.setItem(welcomeKey, '1'); } catch { /* storage blocked: the welcome simply shows once per visit */ } setWelcome(false); if (window.location.hash.includes('welcome=1')) window.location.hash = '#/onboarding'; };
    return (
      <div className="ob">
        <aside className="ob-side">
          <div className="ob-brand"><div className="brand-mark"><Logo /></div><span>Clinovara</span></div>
          <div className="ob-hero"><h2>Your clinic is created.</h2><p>Four short screens and you are ready to take bookings, check patients in and see your day at a glance.</p></div>
          <ol className="ob-steps static">{STEPS.slice(0, 4).map((x, j) => <li key={x.key}><div><span className="ob-dot">{j + 1}</span><span>{x.sub.replace(/\.$/, '')}</span></div></li>)}</ol>
          <div className="ob-foot"><span>Free for 30 days. Trial runs until {new Date(ob.tenant.trialEndsAt).toLocaleDateString('en-IN')}.</span></div>
        </aside>
        <div className="ob-main center">
          <div className="setup-card col gap-16 welcome-card">
            <div><h1>Welcome, {me.user.name.replace(/^(dr|mr|mrs|ms)\.?\s+/i, '').split(' ')[0]}</h1><p className="muted">Your email and phone are verified. This takes about 10 minutes and your progress saves as you go, so you can stop and come back any time.</p></div>
            <div className="welcome-list">{[['Clinic address', 'Where patients find you'], ['Opening hours', 'What patients can book'], ['Your dentists', 'Who sees patients and their fees'], ['Services and fees', 'What you offer']].map(([t, d], j) => <div key={t}><span className="ob-dot lt">{j + 1}</span><div><b>{t}</b><span>{d}</span></div></div>)}</div>
            <div className="row gap-8"><button className="btn lg" onClick={() => { start(); navigate('#/'); }}>I'll do it later</button><button className="btn primary lg" style={{ flex: 1 }} onClick={start}>Start setup <IconArrowRight size={18} /></button></div>
          </div>
        </div>
      </div>
    );
  }
  const step = STEPS[i];
  const up = (p) => setS({ ...s, ...p });
  const pr = (k) => ({ value: s.practice[k] ?? '', onChange: (e) => up({ practice: { ...s.practice, [k]: e.target.value } }) });
  const prNum = (k) => ({ type: 'number', min: 0, value: s.practice[k] ?? '', onChange: (e) => up({ practice: { ...s.practice, [k]: e.target.value === '' ? '' : Number(e.target.value) } }) });
  const hours = s.practice.hours || {};
  const setDay = (d, v) => up({ practice: { ...s.practice, hours: { ...hours, [d]: v } } });
  const setProv = (idx, p) => up({ providers: s.providers.map((x, j) => (j === idx ? { ...x, ...p } : x)) });
  const setVt = (idx, p) => up({ visitTypes: s.visitTypes.map((x, j) => (j === idx ? { ...x, ...p } : x)) });

  /** What this screen needs before Continue lights up. */
  const problems = {
    clinic: [!s.practice.name?.trim() && 'Clinic name', !s.practice.address?.trim() && 'Street address', !s.practice.city?.trim() && 'City', !s.practice.state && 'State'],
    hours: [!Object.values(hours).some(Boolean) && 'At least one open day', ...DAYS.filter(([d]) => hours[d] && toMin(hours[d][1]) <= toMin(hours[d][0])).map(([, n]) => `Closing time after opening time on ${n}`)],
    dentists: [!s.providers.some((p) => p.role === 'Dentist' && p.name.trim().length > 3) && 'At least one dentist with a name', s.providers.some((p) => p.role === 'Dentist' && !(p.consultationFee > 0)) && 'A consultation fee for each dentist'],
    services: [s.visitTypes.length < 3 && 'At least three visit types', ['vt_cleaning', 'vt_newpatient', 'vt_urgent'].some((id) => s.visitTypes.find((v) => v.id === id && !(v.fee > 0))) && 'A fee for the new patient, cleaning and urgent visits'],
    review: [],
  }[step.key].filter(Boolean);

  /** Write this screen's choices to settings, deriving the fields other parts of the app expect. */
  const persist = async (draft = s) => {
    const d = { ...draft };
    d.locations = d.locations.map((l, idx) => ({ ...l, hours: { ...d.practice.hours }, ...(idx === 0 ? { address: d.practice.address || l.address, phone: l.phone || d.practice.phone } : {}) }));
    d.providers = d.providers.filter((p) => p.name.trim()).map((p) => ({ ...p, locationIds: p.locationIds?.length ? p.locationIds : d.locations.map((l) => l.id) }));
    // Keep the approved answers the AI and the website give in step with what the owner just entered.
    const say = (id, answer) => { if (answer) d.faqs = d.faqs.map((f) => (f.id === id ? { ...f, answer } : f)); };
    say('faq_hours', hoursSentence(d.practice.hours || {}));
    if (d.practice.address) say('faq_location', `We are at ${[d.practice.address, d.practice.city, d.practice.zip].filter(Boolean).join(', ')}.`);
    d.visitTypes = d.visitTypes.map((v) => ({ ...v, keywords: v.keywords?.length ? v.keywords : [v.name.toLowerCase()] }));
    const { integrations, tenant, ...rest } = d; void integrations; void tenant;
    if (step.key === 'clinic' || step.key === 'hours') delete rest.providers; // the suggested dentist is only saved once you have seen that screen
    await put('/api/settings', rest);
    await load();
  };
  const go = (n) => { setI(n); setFar((f) => Math.max(f, n)); window.scrollTo(0, 0); };
  const next = () => run(async () => { await persist(); go(Math.min(i + 1, STEPS.length - 1)); });
  const exit = () => run(async () => { await persist(); navigate('#/'); }, 'Saved. Pick up any time from the Finish setup banner.');
  const done = (k) => ob.steps.find((x) => x.key === k)?.done;
  const missingCore = STEPS.filter((x) => x.core && !done(x.core));
  const copy = (t) => { navigator.clipboard?.writeText(t); toast('Copied'); };

  const openDays = DAYS.filter(([d]) => hours[d]);
  const hoursSummary = hoursSentence(hours).replace(/^We are open /, '') || 'Not set';

  const left = STEPS.slice(i).reduce((n, x) => n + (STEP_MIN[x.key] || 0), 0);
  const goTo = (j) => (j <= i || missingCore.every((m) => STEPS.indexOf(m) >= j) ? go(j) : toast(`Finish "${STEPS[i].label}" first`));
  const onEnter = (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'file' && step.key !== 'review' && problems.length === 0 && !busy) { e.preventDefault(); next(); } };

  return (
    <div className="ob">
      <aside className="ob-side">
        <div className="ob-brand"><div className="brand-mark"><Logo /></div><span>Clinovara</span></div>
        <div className="ob-clinic"><span>Setting up</span><b>{me.tenant.name}</b></div>
        <ol className="ob-steps">
          {STEPS.map((x, j) => { const ok = (x.core ? done(x.core) : ob.completed) && (j < far || ob.completed); return (
            <li key={x.key}><button className={`${j === i ? 'current' : ''} ${ok && j !== i ? 'done' : ''}`} onClick={() => goTo(j)} aria-current={j === i ? 'step' : undefined}>
              <span className="ob-dot">{ok && j !== i ? <IconCheck size={14} stroke={3} /> : j + 1}</span><span>{x.label}</span>
            </button></li>); })}
        </ol>
        <div className="ob-tip"><b>Why we ask</b><p>{TIPS[step.key]}</p></div>
        <div className="ob-foot"><span>About {left} min left. Saved as you go.</span><button className="btn ghost sm" disabled={busy} onClick={exit}>Save and exit</button></div>
      </aside>
      <div className="ob-main" onKeyDown={onEnter}>
        <div className="ob-mobile"><span>Step {i + 1} of {STEPS.length}: {step.label}</span><button className="btn ghost sm" disabled={busy} onClick={exit}>Save and exit</button></div>
      <main className="setup-body">
        <div className="setup-head"><h1>{step.title}</h1><p>{step.sub}</p></div>

        {step.key === 'clinic' && <div className="setup-card col">
          <Field label="Clinic name"><input className="input" {...pr('name')} /></Field>
          <Field label="Street address" hint="As patients should find it on a map"><input className="input" placeholder="12, 100 Feet Road, Indiranagar" {...pr('address')} autoFocus /></Field>
          <div className="grid three">
            <Field label="City"><input className="input" {...pr('city')} /></Field>
            <Field label="State">{s.practice.country && s.practice.country !== 'India' ? <input className="input" {...pr('state')} /> : <select className="input" {...pr('state')}><option value="">Choose…</option>{STATES.map((x) => <option key={x}>{x}</option>)}</select>}</Field>
            <Field label="ZIP / PIN code"><input className="input" {...pr('zip')} /></Field>
          </div>
          <div className="grid two">
            <Field label="Clinic phone" hint="Prefilled from sign-up"><input className="input" {...pr('phone')} /></Field>
            <Field label="Email"><input className="input" {...pr('email')} /></Field>
          </div>
          <details className="setup-more">
            <summary>More details (optional)</summary>
            <div className="col" style={{ paddingTop: 12 }}>
              <div className="grid two">
                <Field label="Legal business name"><input className="input" {...pr('legalName')} /></Field>
                <Field label="Website"><input className="input" placeholder="https://" {...pr('website')} /></Field>
                <Field label="Dental council registration" hint="e.g. KSDC A-12345"><input className="input" {...pr('registrationNumber')} /></Field>
                <Field label="Clinic license / Clinical Establishments no."><input className="input" {...pr('clinicalEstablishmentNo')} /></Field>
                <Field label="Business registration number"><input className="input" {...pr('businessRegistrationNumber')} /></Field>
                <Field label="GSTIN" hint="Printed on receipts"><input className="input mono" {...pr('gstin')} /></Field>
                <Field label="Time zone"><select className="input" value={s.locale?.timezone || 'Asia/Kolkata'} onChange={(e) => up({ locale: { ...s.locale, timezone: e.target.value } })}>{TIMEZONES.map((z) => <option key={z}>{z}</option>)}</select></Field>
                <Field label="Number of locations"><input className="input" {...prNum('locationCount')} /></Field>
              </div>
              <Field label="Clinic logo" hint="PNG or JPG, up to 300 KB">
                <div className="row gap-12">{s.practice.logo && <img src={s.practice.logo} alt="Clinic logo" style={{ height: 44, borderRadius: 6 }} />}
                  <input type="file" accept="image/png,image/jpeg" onChange={(e) => { const file = e.target.files[0]; if (!file) return; if (file.size > 300 * 1024) return toast('Logo must be under 300 KB'); const r = new FileReader(); r.onload = () => up({ practice: { ...s.practice, logo: r.result } }); r.readAsDataURL(file); }} />
                  {s.practice.logo && <button className="btn sm ghost" onClick={() => up({ practice: { ...s.practice, logo: '' } })}>Remove</button>}</div>
              </Field>
            </div>
          </details>
        </div>}

        {step.key === 'hours' && <div className="setup-card col gap-16">
          <div>
            <div className="small strong" style={{ marginBottom: 8 }}>Quick start</div>
            <div className="row gap-6 wrap">{PRESETS.map(([label, days, def]) => <button key={label} className="btn sm" onClick={() => { const base = openDays[0] ? hours[openDays[0][0]] : def; up({ practice: { ...s.practice, hours: Object.fromEntries(DAYS.map(([d]) => [d, days.includes(d) ? [...base] : null])) } }); }}>{label}</button>)}</div>
          </div>
          <div className="col gap-6">
            {DAYS.map(([d, name]) => { const h = hours[d]; const bad = h && toMin(h[1]) <= toMin(h[0]); return (
              <div className={`hours-row ${h ? '' : 'closed'} ${bad ? 'bad' : ''}`} key={d}>
                <label className="switch"><input type="checkbox" checked={!!h} onChange={(e) => setDay(d, e.target.checked ? (openDays[0] ? [...hours[openDays[0][0]]] : ['09:00', '19:00']) : null)} /><i /><span className="strong small">{name}</span></label>
                {h ? <div className="row gap-8 wrap"><TimeSelect label={`${name} opens`} value={h[0]} onChange={(v) => setDay(d, [v, h[1]])} /><span className="muted small">to</span><TimeSelect label={`${name} closes`} value={h[1]} onChange={(v) => setDay(d, [h[0], v])} /><span className="tiny muted hrs">{bad ? 'Closing must be later' : `${Math.round((toMin(h[1]) - toMin(h[0])) / 6) / 10} h`}</span></div> : <span className="muted small">Closed</span>}
              </div>); })}
          </div>
          {openDays.length > 1 && <div className="row between wrap small"><span className="muted">Open {Math.round(openDays.reduce((n, [d]) => n + Math.max(0, toMin(hours[d][1]) - toMin(hours[d][0])), 0) / 60)} hours a week</span><button className="btn sm" onClick={() => { const f = hours[openDays[0][0]]; up({ practice: { ...s.practice, hours: Object.fromEntries(DAYS.map(([d]) => [d, hours[d] ? [...f] : null])) } }); }}>Copy {openDays[0][1]}'s hours to every open day</button></div>}
          <div className="divider" />
          <div className="row between wrap">
            <div><div className="small strong">Dental chairs</div><div className="tiny muted">How many patients you can treat at the same time</div></div>
            <div className="stepper"><button type="button" aria-label="Fewer chairs" onClick={() => up({ locations: s.locations.map((l, j) => (j === 0 ? { ...l, chairs: Math.max(1, (l.chairs || 1) - 1) } : l)) })}>-</button><b>{s.locations[0]?.chairs || 1}</b><button type="button" aria-label="More chairs" onClick={() => up({ locations: s.locations.map((l, j) => (j === 0 ? { ...l, chairs: Math.min(50, (l.chairs || 1) + 1) } : l)) })}>+</button></div>
          </div>
          <div className="tiny muted">National holidays are already marked closed. More branches, per-branch hours and extra holidays are in Settings.</div>
        </div>}

        {step.key === 'dentists' && <div className="col gap-16">
          {s.providers.map((p, idx) => <div className="setup-card col" key={p.id}>
            <div className="grid three">
              <Field label="Name"><input className="input" placeholder="Dr. Ananya Rao" value={p.name} onChange={(e) => setProv(idx, { name: e.target.value })} autoFocus={idx === 0} /></Field>
              <Field label="Specialty"><select className="input" value={p.specialty || 'General dentist'} onChange={(e) => setProv(idx, { specialty: e.target.value, role: e.target.value === 'Hygienist' ? 'Hygienist' : 'Dentist' })}>{SPECIALTIES.map((x) => <option key={x}>{x}</option>)}</select></Field>
              <Field label="Consultation fee (₹)"><input className="input" type="number" min="0" value={p.consultationFee || ''} onChange={(e) => setProv(idx, { consultationFee: Number(e.target.value) })} /></Field>
            </div>
            <div className="row between"><span className="tiny muted">Qualifications and council registration can be added later.</span>{s.providers.length > 1 && <button className="btn sm ghost" onClick={() => up({ providers: s.providers.filter((_, j) => j !== idx) })}><IconTrash size={14} />Remove</button>}</div>
          </div>)}
          <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => up({ providers: [...s.providers, { id: uid('prov'), name: '', role: 'Dentist', specialty: 'General dentist', qualifications: 'BDS', councilRegNo: '', hprId: '', locationIds: s.locations.map((l) => l.id), consultationFee: 500 }] })}><IconPlus size={16} />Add another dentist</button>
          <details className="setup-card setup-more">
            <summary>Invite your front desk and staff (optional)</summary>
            <div style={{ paddingTop: 12 }}><TeamInvites providers={s.providers.filter((p) => p.name.trim())} /></div>
          </details>
        </div>}

        {step.key === 'services' && <div className="col gap-16">
          <div className="setup-card col">
            <div className="vt-head tiny muted"><span>Visit type</span><span>Minutes</span><span>Fee (₹)</span><span /></div>
            {s.visitTypes.map((v, idx) => <div className="vt-row" key={v.id}>
              <input className="input" value={v.name} onChange={(e) => setVt(idx, { name: e.target.value })} />
              <input className="input" type="number" min="5" step="5" value={v.durationMin} onChange={(e) => setVt(idx, { durationMin: Number(e.target.value) })} />
              <input className="input" type="number" min="0" value={v.fee || ''} placeholder="0" onChange={(e) => setVt(idx, { fee: Number(e.target.value) })} />
              <button className="btn sm ghost" aria-label={`Remove ${v.name}`} onClick={() => up({ visitTypes: s.visitTypes.filter((_, j) => j !== idx) })}><IconTrash size={14} /></button>
            </div>)}
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => up({ visitTypes: [...s.visitTypes, { id: uid('vt'), name: 'New visit type', durationMin: 30, providerRole: 'Dentist', fee: 0, keywords: [] }] })}><IconPlus size={14} />Custom visit type</button>
          </div>
          {ob.presets.visitTypes.some((v) => !s.visitTypes.some((x) => x.id === v.id)) && <div className="col gap-6"><span className="small muted">Common dental services, one tap to add</span><div className="tag-list">{ob.presets.visitTypes.filter((v) => !s.visitTypes.some((x) => x.id === v.id)).map((v) => <button key={v.id} className="btn sm" onClick={() => up({ visitTypes: [...s.visitTypes, v] })}><IconPlus size={12} />{v.name}</button>)}</div></div>}
        </div>}

        {step.key === 'review' && <div className="col gap-16">
          <div className="setup-card review">
            {[
              [0, 'Clinic', `${s.practice.name} · ${[s.practice.address, s.practice.city].filter(Boolean).join(', ') || 'No address yet'}`, done('profile')],
              [1, 'Hours', `${hoursSummary} · ${s.locations[0]?.chairs || 1} chair${(s.locations[0]?.chairs || 1) > 1 ? 's' : ''}`, done('branches')],
              [2, 'Dentists', s.providers.filter((p) => p.name.trim()).map((p) => p.name).join(', ') || 'None yet', done('team')],
              [3, 'Services', `${s.visitTypes.length} visit types · ${s.visitTypes.slice(0, 3).map((v) => v.name).join(', ')}${s.visitTypes.length > 3 ? '…' : ''}`, done('services')],
            ].map(([n, label, text, ok]) => <div className="review-row" key={label}>
              <span className={`review-dot ${ok ? 'ok' : ''}`}>{ok ? <IconCheck size={14} stroke={3} /> : '!'}</span>
              <div className="grow"><div className="small strong">{label}</div><div className="small muted">{text}</div></div>
              <button className="btn sm ghost" onClick={() => go(n)}><IconPencil size={14} />Edit</button>
            </div>)}
          </div>
          <div className="setup-card col">
            <div className="small strong">Open it on your devices</div>
            <div className="grid three">
              {[['Reception kiosk', ob.kioskUrl, { kioskOpened: true }], ['Waiting-room display', ob.boardUrl, { boardOpened: true }], ['Patient chat', ob.chatUrl, null]].map(([label, url, mark]) => <div className="soft-tile" key={label}>
                <div className="small strong">{label}</div>
                <div className="row gap-6 mt-8"><a className="btn sm" href={url} target="_blank" rel="noreferrer" onClick={() => mark && post('/api/onboarding/mark', mark)}><IconExternalLink size={14} />Open</a><button className="btn sm ghost" onClick={() => copy(url)}><IconCopy size={14} />Copy link</button></div>
              </div>)}
            </div>
          </div>
          <button className="btn primary lg" disabled={busy || ob.completed || missingCore.length > 0} onClick={() => run(async () => { await post('/api/onboarding/complete'); await refresh(); navigate('#/'); }, `${me.tenant.name} is live`)}><IconRocket size={18} />{ob.completed ? 'Already live' : `Launch ${me.tenant.name}`}</button>
          {missingCore.length > 0 && <div className="tiny" style={{ color: 'var(--bad)' }}>Still needed before launch: {missingCore.map((m) => m.label).join(', ')}.</div>}
          <div className="setup-card col">
            <div className="small strong">Optional, whenever you are ready</div>
            <div className="tag-list">{ob.steps.filter((x) => !x.core).map((x) => <a key={x.key} className="btn sm" href={`#/onboarding?all=1&step=${x.key}`}>{x.done && <IconCheck size={12} />}{x.title}</a>)}</div>
          </div>
        </div>}

      </main>
      <div className="ob-bar">
        <div className="ob-bar-inner">
          <button className="btn lg" disabled={i === 0 || busy} onClick={() => go(i - 1)}><IconArrowLeft size={18} />Back</button>
          <span className="ob-bar-note">{problems.length > 0 ? `Still needed: ${problems.join(' · ')}` : step.key === 'review' ? '' : 'Looks good. Your answers are saved when you continue.'}</span>
          {step.key !== 'review' && <button className="btn primary lg" disabled={busy || problems.length > 0} onClick={next}>Save and continue <IconArrowRight size={18} /></button>}
        </div>
      </div>
      </div>
    </div>
  );
}
