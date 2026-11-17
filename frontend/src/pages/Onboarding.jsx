import React, { useEffect, useState } from 'react';
import { IconCheck, IconCircle, IconArrowRight, IconArrowLeft, IconRocket, IconPlus, IconTrash, IconCopy, IconExternalLink, IconUpload, IconSparkles } from '@tabler/icons-react';
import { INDIA } from '../lib/places.js';
import { get, put, post } from '../lib/api.js';
import { Card, Body, Field, useAction, Pill, useToast } from '../components/ui.jsx';
import { fmtMoney } from '../lib/format.js';
import { navigate } from '../App.jsx';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Dhaka', 'Asia/Kathmandu', 'Asia/Colombo', 'Europe/London', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Australia/Sydney'];
const STATES = Object.keys(INDIA);

/** Guided setup. Each step edits the same settings the app uses; the checklist on the right is computed from real data. */
export default function Onboarding({ session }) {
  const { me, refresh } = session;
  const [ob, setOb] = useState(null);
  const [s, setS] = useState(null);
  const [i, setI] = useState(0);
  const [run, busy] = useAction();
  const toast = useToast();
  const load = async () => { const [o, st] = await Promise.all([get('/api/onboarding'), get('/api/settings')]); setOb(o); setS(st); return o; };
  useEffect(() => { load().then((o) => { const want = o.steps.findIndex((x) => x.key === new URLSearchParams(window.location.hash.split('?')[1] || '').get('step')); const first = o.steps.findIndex((x) => !x.done); setI(want >= 0 ? want : first < 0 ? o.steps.length - 1 : first); }); }, []); // eslint-disable-line
  if (!ob || !s) return <div className="main"><div className="skeleton" /></div>;
  const step = ob.steps[i];
  const up = (p) => setS({ ...s, ...p });
  const save = (extra = {}) => run(async () => { const { integrations, tenant, ...rest } = s; void integrations; void tenant; await put('/api/settings', { ...rest, ...extra }); await load(); }, 'Saved');
  const next = async () => { await save(); setI(Math.min(i + 1, ob.steps.length - 1)); window.scrollTo(0, 0); };
  const list = (key, idx, p) => up({ [key]: s[key].map((x, j) => (j === idx ? { ...x, ...p } : x)) });
  const remove = (key, idx) => up({ [key]: s[key].filter((_, j) => j !== idx) });
  const copy = (t) => { navigator.clipboard?.writeText(t); toast('Copied'); };

  return (
    <div className="onboard">
      <aside className="onboard-side">
        <div className="row" style={{ padding: '4px 8px 14px' }}><IconRocket size={20} className="muted" /><div><div className="strong">Set up {me.tenant.name}</div><div className="tiny muted">{ob.percent}% of essentials · trial until {new Date(ob.tenant.trialEndsAt).toLocaleDateString('en-IN')}</div></div></div>
        <div className="steps" style={{ margin: '0 8px 12px' }}>{ob.steps.filter((x) => x.core).map((x) => <span key={x.key} className={x.done ? 'done' : ''} />)}</div>
        {[['Essential', (x) => x.core], ['Finish later (optional)', (x) => !x.core]].map(([title, pick]) => <React.Fragment key={title}>
          <div className="tiny muted strong" style={{ padding: '10px 8px 4px', textTransform: 'uppercase', letterSpacing: '.04em' }}>{title}</div>
          {ob.steps.map((x, j) => pick(x) && <button key={x.key} className={`onboard-step ${j === i ? 'active' : ''}`} onClick={() => setI(j)}>{x.done ? <IconCheck size={16} style={{ color: 'var(--good)' }} /> : <IconCircle size={16} className="faint" />}<div><div className="small strong">{x.title} <span className="tiny muted">~{x.minutes} min</span></div><div className="tiny muted">{x.hint}</div></div></button>)}
        </React.Fragment>)}
        <div className="divider" />
        <a className="btn ghost sm" href="#/onboarding">Back to quick setup</a>
        <a className="btn ghost sm" href="#/dashboard" style={{ justifyContent: 'flex-start' }}>Skip to the app for now</a>
      </aside>
      <main className="onboard-main">
        <div className="page-head"><div><h1>{step.core ? `Step ${ob.steps.filter((x) => x.core).findIndex((x) => x.key === step.key) + 1} of ${ob.steps.filter((x) => x.core).length}: ` : ''}{step.title}</h1><p>{step.hint}</p></div><Pill tone={step.done ? 'good' : 'warn'}>{step.done ? 'Complete' : 'Needs attention'}</Pill></div>
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 280px' }}>
          <div className="col gap-16">
            {step.key === 'profile' && <Card><Body className="col">
              <div className="grid two">
                <Field label="Clinic name"><input className="input" value={s.practice.name} onChange={(e) => up({ practice: { ...s.practice, name: e.target.value } })} /></Field>
                <Field label="Tagline (optional)"><input className="input" value={s.practice.tagline || ''} onChange={(e) => up({ practice: { ...s.practice, tagline: e.target.value } })} /></Field>
                <Field label="Clinic phone"><input className="input" value={s.practice.phone} onChange={(e) => up({ practice: { ...s.practice, phone: e.target.value } })} placeholder="+91 80 …" /></Field>
                <Field label="WhatsApp number" hint="The number patients message; used for the WhatsApp Business API later"><input className="input" value={s.practice.whatsapp || ''} onChange={(e) => up({ practice: { ...s.practice, whatsapp: e.target.value } })} /></Field>
                <Field label="Email"><input className="input" value={s.practice.email} onChange={(e) => up({ practice: { ...s.practice, email: e.target.value } })} /></Field>
                <Field label="Website (optional)"><input className="input" value={s.practice.website || ''} onChange={(e) => up({ practice: { ...s.practice, website: e.target.value } })} /></Field>
                <Field label="City"><input className="input" value={s.practice.city || ''} onChange={(e) => up({ practice: { ...s.practice, city: e.target.value } })} /></Field>
                <Field label="State"><select className="input" value={s.practice.state || ''} onChange={(e) => up({ practice: { ...s.practice, state: e.target.value } })}><option value="">Choose…</option>{STATES.map((x) => <option key={x}>{x}</option>)}</select></Field>
              </div>
              <div className="divider" />
              <div className="small strong">Business details</div>
              <div className="grid three">
                <Field label="Legal business name"><input className="input" value={s.practice.legalName || ''} onChange={(e) => up({ practice: { ...s.practice, legalName: e.target.value } })} /></Field>
                <Field label="Clinic address"><input className="input" value={s.practice.address || ''} onChange={(e) => up({ practice: { ...s.practice, address: e.target.value } })} /></Field>
                <Field label="ZIP / postal code"><input className="input" value={s.practice.zip || ''} onChange={(e) => up({ practice: { ...s.practice, zip: e.target.value } })} /></Field>
                <Field label="Primary dentist name"><input className="input" value={s.practice.primaryDentist || ''} onChange={(e) => up({ practice: { ...s.practice, primaryDentist: e.target.value } })} /></Field>
                <Field label="Number of dentists"><input className="input" type="number" min="0" value={s.practice.dentistCount ?? ''} onChange={(e) => up({ practice: { ...s.practice, dentistCount: e.target.value === '' ? '' : Number(e.target.value) } })} /></Field>
                <Field label="Number of dental chairs"><input className="input" type="number" min="0" value={s.practice.chairCount ?? ''} onChange={(e) => up({ practice: { ...s.practice, chairCount: e.target.value === '' ? '' : Number(e.target.value) } })} /></Field>
                <Field label="Number of locations"><input className="input" type="number" min="1" value={s.practice.locationCount ?? ''} onChange={(e) => up({ practice: { ...s.practice, locationCount: e.target.value === '' ? '' : Number(e.target.value) } })} /></Field>
                <Field label="Time zone"><select className="input" value={s.locale?.timezone || 'Asia/Kolkata'} onChange={(e) => up({ locale: { ...s.locale, timezone: e.target.value } })}>{TIMEZONES.map((z) => <option key={z}>{z}</option>)}</select></Field>
                <Field label="Business registration number"><input className="input" value={s.practice.businessRegistrationNumber || ''} onChange={(e) => up({ practice: { ...s.practice, businessRegistrationNumber: e.target.value } })} /></Field>
              </div>
              <Field label="Clinic logo" hint="PNG or JPG, up to 300 KB. Working days and hours are set per branch in the next step.">
                <div className="row gap-12">{s.practice.logo && <img src={s.practice.logo} alt="Clinic logo" style={{ height: 48, borderRadius: 6 }} />}<input type="file" accept="image/png,image/jpeg" onChange={(e) => { const file = e.target.files[0]; if (!file) return; if (file.size > 300 * 1024) return toast('Logo must be under 300 KB'); const r = new FileReader(); r.onload = () => up({ practice: { ...s.practice, logo: r.result } }); r.readAsDataURL(file); }} />{s.practice.logo && <button className="btn sm ghost" onClick={() => up({ practice: { ...s.practice, logo: '' } })}>Remove</button>}</div>
              </Field>
              <div className="divider" />
              <div className="small strong">Registrations</div>
              <div className="grid three">
                <Field label="Dental council registration (clinic / lead dentist)" hint="e.g. KSDC A-12345"><input className="input" value={s.practice.registrationNumber || ''} onChange={(e) => up({ practice: { ...s.practice, registrationNumber: e.target.value } })} /></Field>
                <Field label="Clinical Establishments Act reg. no." hint="Where your state requires it"><input className="input" value={s.practice.clinicalEstablishmentNo || ''} onChange={(e) => up({ practice: { ...s.practice, clinicalEstablishmentNo: e.target.value } })} /></Field>
                <Field label="GSTIN (optional)" hint="Printed on receipts"><input className="input mono" value={s.practice.gstin || ''} onChange={(e) => up({ practice: { ...s.practice, gstin: e.target.value } })} /></Field>
              </div>
            </Body></Card>}

            {step.key === 'branches' && <>
              {s.locations.map((l, idx) => <Card key={l.id} title={l.name || 'Branch'} actions={s.locations.length > 1 && <button className="btn sm ghost" onClick={() => remove('locations', idx)}><IconTrash size={14} /></button>}><Body className="col">
                <div className="grid three">
                  <Field label="Branch name"><input className="input" value={l.name} onChange={(e) => list('locations', idx, { name: e.target.value })} /></Field>
                  <Field label="Phone"><input className="input" value={l.phone || ''} onChange={(e) => list('locations', idx, { phone: e.target.value })} /></Field>
                  <div className="row"><Field label="Chairs"><input className="input" type="number" style={{ width: 80 }} value={l.chairs || 1} onChange={(e) => list('locations', idx, { chairs: Number(e.target.value) })} /></Field><Field label="Kiosk code"><input className="input mono" style={{ width: 110 }} value={l.kioskCode || ''} onChange={(e) => list('locations', idx, { kioskCode: e.target.value.toUpperCase() })} /></Field></div>
                </div>
                <Field label="Address (as patients should see it)"><input className="input" value={l.address || ''} onChange={(e) => list('locations', idx, { address: e.target.value })} placeholder="12 100 Feet Road, Indiranagar, Bengaluru 560038" /></Field>
                <Field label="ABDM Health Facility Registry (HFR) ID — optional"><input className="input mono" value={l.hfrId || ''} onChange={(e) => list('locations', idx, { hfrId: e.target.value })} placeholder="IN29…" /></Field>
                <div className="small strong">Timings</div>
                {DAYS.map((d) => { const h = (l.hours || s.practice.hours)[d]; const hours = l.hours || s.practice.hours; return <div className="row" key={d}><span className="small" style={{ width: 90, textTransform: 'capitalize' }}>{d}</span><label className="check small"><input type="checkbox" checked={!!h} onChange={(e) => list('locations', idx, { hours: { ...hours, [d]: e.target.checked ? ['09:00', '19:00'] : null } })} />Open</label>{h && <><input className="input" type="time" style={{ width: 120 }} value={h[0]} onChange={(e) => list('locations', idx, { hours: { ...hours, [d]: [e.target.value, h[1]] } })} /><span className="muted">to</span><input className="input" type="time" style={{ width: 120 }} value={h[1]} onChange={(e) => list('locations', idx, { hours: { ...hours, [d]: [h[0], e.target.value] } })} /></>}</div>; })}
              </Body></Card>)}
              <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => up({ locations: [...s.locations, { id: `loc_${Date.now().toString(36)}`, name: 'New branch', address: '', phone: '', hours: s.practice.hours, chairs: 2, kioskCode: `B${s.locations.length + 1}` }] })}><IconPlus size={16} />Add another branch</button>
              <Card title="Holidays (clinic closed)"><Body className="col">
                <div className="tag-list">{(s.holidays || []).map((h, idx) => <span key={idx} className="pill outline">{h.date} · {h.name}<button className="btn ghost icon sm" style={{ padding: 0, marginLeft: 4 }} onClick={() => remove('holidays', idx)}><IconTrash size={11} /></button></span>)}</div>
                <HolidayAdd onAdd={(h) => up({ holidays: [...(s.holidays || []), h].sort((a, b) => a.date.localeCompare(b.date)) })} presets={ob.presets.holidays} />
                <div className="tiny muted">National holidays are pre-filled. Add Diwali, Holi, Ugadi, Eid, Pongal and local holidays for your state; the AI will not offer those days.</div>
              </Body></Card>
            </>}

            {step.key === 'team' && <>
              <Card title="Dentists & hygienists" actions={<button className="btn sm" onClick={() => up({ providers: [...s.providers, { id: `prov_${Date.now().toString(36)}`, name: 'Dr. ', role: 'Dentist', specialty: '', qualifications: 'BDS', councilRegNo: '', hprId: '', locationIds: [s.locations[0]?.id].filter(Boolean), consultationFee: 500 }] })}><IconPlus size={14} />Add</button>}><Body className="col gap-16">
                {s.providers.length === 0 && <div className="callout small">Add every dentist and hygienist who sees patients. Each gets a column on the schedule and a "Dentist's day" worklist.</div>}
                {s.providers.map((p, idx) => <div className="card soft" style={{ padding: 12 }} key={p.id}><div className="grid three">
                  <Field label="Name"><input className="input" value={p.name} onChange={(e) => list('providers', idx, { name: e.target.value })} /></Field>
                  <Field label="Role"><select className="input" value={p.role} onChange={(e) => list('providers', idx, { role: e.target.value })}><option>Dentist</option><option>Hygienist</option></select></Field>
                  <Field label="Specialty"><input className="input" value={p.specialty || ''} onChange={(e) => list('providers', idx, { specialty: e.target.value })} placeholder="General, Endodontist, Orthodontist, Pedodontist…" /></Field>
                  <Field label="Qualifications"><input className="input" value={p.qualifications || ''} onChange={(e) => list('providers', idx, { qualifications: e.target.value })} placeholder="BDS, MDS" /></Field>
                  <Field label="Dental council reg. no."><input className="input" value={p.councilRegNo || ''} onChange={(e) => list('providers', idx, { councilRegNo: e.target.value })} /></Field>
                  <Field label="ABDM HPR ID (optional)"><input className="input mono" value={p.hprId || ''} onChange={(e) => list('providers', idx, { hprId: e.target.value })} /></Field>
                  <Field label="Consultation fee (₹)"><input className="input" type="number" value={p.consultationFee || 0} onChange={(e) => list('providers', idx, { consultationFee: Number(e.target.value) })} /></Field>
                  <Field label="Works at"><div className="row wrap gap-6">{s.locations.map((l) => <label key={l.id} className="check small"><input type="checkbox" checked={(p.locationIds || []).includes(l.id)} onChange={(e) => list('providers', idx, { locationIds: e.target.checked ? [...(p.locationIds || []), l.id] : (p.locationIds || []).filter((x) => x !== l.id) })} />{l.name}</label>)}</div></Field>
                </div><div className="row mt-8" style={{ justifyContent: 'flex-end' }}><button className="btn sm ghost" onClick={() => remove('providers', idx)}><IconTrash size={14} />Remove</button></div></div>)}
              </Body></Card>
              <TeamInvites providers={s.providers} />
            </>}

            {step.key === 'services' && <Card title="Visit types" actions={<button className="btn sm" onClick={() => up({ visitTypes: [...s.visitTypes, { id: `vt_${Date.now().toString(36)}`, name: 'New visit type', durationMin: 30, providerRole: 'Dentist', fee: 0, keywords: [] }] })}><IconPlus size={14} />Add</button>}><Body className="col gap-16">
              <div className="callout small row between wrap"><span>Dental presets you can add with one tap:</span><div className="tag-list">{ob.presets.visitTypes.filter((v) => !s.visitTypes.some((x) => x.id === v.id)).map((v) => <button key={v.id} className="btn sm" onClick={() => up({ visitTypes: [...s.visitTypes, v] })}><IconPlus size={12} />{v.name}</button>)}</div></div>
              {s.visitTypes.map((v, idx) => <div className="card soft" style={{ padding: 12 }} key={v.id}><div className="grid two">
                <Field label="Name"><input className="input" value={v.name} onChange={(e) => list('visitTypes', idx, { name: e.target.value })} /></Field>
                <div className="row"><Field label="Minutes"><input className="input" type="number" style={{ width: 80 }} value={v.durationMin} onChange={(e) => list('visitTypes', idx, { durationMin: Number(e.target.value) })} /></Field><Field label="Fee (₹)"><input className="input" type="number" style={{ width: 100 }} value={v.fee || 0} onChange={(e) => list('visitTypes', idx, { fee: Number(e.target.value) })} /></Field><Field label="Who"><select className="input" value={v.providerRole || ''} onChange={(e) => list('visitTypes', idx, { providerRole: e.target.value })}><option value="">Any</option><option>Dentist</option><option>Hygienist</option></select></Field></div>
              </div><Field label="Words patients use (English / Hindi / Kannada / Hinglish, comma separated)"><input className="input" value={v.keywords.join(', ')} onChange={(e) => list('visitTypes', idx, { keywords: e.target.value.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean) })} /></Field><div className="row mt-8" style={{ justifyContent: 'flex-end' }}><button className="btn sm ghost" onClick={() => remove('visitTypes', idx)}><IconTrash size={14} />Remove</button></div></div>)}
            </Body></Card>}

            {step.key === 'payments' && <div className="grid two">
              <Card title="Payment modes"><Body className="col">
                <Field label="Modes offered at the desk (comma separated)"><input className="input" value={(s.paymentModes || []).join(', ')} onChange={(e) => up({ paymentModes: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></Field>
                <Field label="Payment & pricing answer the AI gives"><textarea className="input" style={{ minHeight: 120 }} value={s.faqs.find((f) => f.id === 'faq_payment')?.answer || ''} onChange={(e) => up({ faqs: s.faqs.map((f) => (f.id === 'faq_payment' ? { ...f, answer: e.target.value } : f)) })} /></Field>
                <div className="tiny muted">Mention your consultation and cleaning fees in ₹ so the AI can quote them.</div>
              </Body></Card>
              <Card title="Insurance & schemes you accept" actions={<button className="btn sm" onClick={() => up({ insuranceOptions: [...(s.insuranceOptions || []), { id: `ins_${Date.now().toString(36)}`, label: 'New scheme', examples: '' }] })}><IconPlus size={14} /></button>}><Body className="col">
                {(s.insuranceOptions || []).map((o, idx) => <div className="row" key={o.id}><input className="input" value={o.label} onChange={(e) => list('insuranceOptions', idx, { label: e.target.value })} /><input className="input" placeholder="Insurers / TPAs you are empanelled with" value={o.examples || ''} onChange={(e) => list('insuranceOptions', idx, { examples: e.target.value })} /><button className="btn sm ghost icon" disabled={o.id === 'self'} onClick={() => remove('insuranceOptions', idx)}><IconTrash size={14} /></button></div>)}
                <Field label="Insurance / cashless answer the AI gives"><textarea className="input" style={{ minHeight: 100 }} value={s.faqs.find((f) => f.id === 'faq_insurance')?.answer || ''} onChange={(e) => up({ faqs: s.faqs.map((f) => (f.id === 'faq_insurance' ? { ...f, answer: e.target.value } : f)) })} /></Field>
              </Body></Card>
            </div>}

            {step.key === 'languages' && <div className="grid two">
              <Card title="Languages & channel"><Body className="col">
                <Field label="Languages offered to patients"><div className="row wrap gap-6">{[['en', 'English'], ['hi', 'हिन्दी'], ['kn', 'ಕನ್ನಡ'], ['ta', 'தமிழ்'], ['te', 'తెలుగు'], ['mr', 'मराठी'], ['bn', 'বাংলা']].map(([code, name]) => { const on = (s.locale.languages || []).some((l) => l.code === code); return <button key={code} className={`btn sm ${on ? 'primary' : ''}`} onClick={() => up({ locale: { ...s.locale, languages: on ? s.locale.languages.filter((l) => l.code !== code) : [...s.locale.languages, { code, name }] } })}>{name}</button>; })}</div></Field>
                <div className="tiny muted">Kiosk and forms are translated for English, Hindi and Kannada today; other languages fall back to English on screen but can carry their own message templates.</div>
                <Field label="Default language"><select className="input" value={s.locale.defaultLanguage} onChange={(e) => up({ locale: { ...s.locale, defaultLanguage: e.target.value } })}>{s.locale.languages.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select></Field>
                <Field label="Default channel"><select className="input" value={s.locale.defaultChannel} onChange={(e) => up({ locale: { ...s.locale, defaultChannel: e.target.value } })}><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option></select></Field>
              </Body></Card>
              <Card title="Message templates"><Body className="col">
                <div className="small muted">Reminders, forms, tokens, recalls and post-visit check-ins are pre-written in English and Hindi. Review them now or later under Settings → Languages & templates. WhatsApp Business requires marketing templates to be approved by Meta; transactional reminders go through as session or utility messages.</div>
                {s.templates.slice(0, 4).map((t) => <div key={t.id} className="card soft" style={{ padding: 10 }}><div className="small strong">{t.name}</div><div className="tiny muted">{typeof t.body === 'string' ? t.body : t.body.en}</div></div>)}
              </Body></Card>
            </div>}

            {step.key === 'frontdesk' && <Card title="What the AI is allowed to say"><Body className="col gap-16">
              <div className="callout small">The AI front desk only answers from these approved answers. Anything clinical, about medicines, billing disputes, records or complaints is always handed to your team. Set <span className="mono">ANTHROPIC_API_KEY</span> on the server to use Claude; otherwise the built-in rule engine runs.</div>
              {s.faqs.map((f, idx) => <div className="card soft" style={{ padding: 12 }} key={f.id}><Field label={f.question}><textarea className="input" value={f.answer} onChange={(e) => list('faqs', idx, { answer: e.target.value })} /></Field></div>)}
              <Field label="Extra words that always hand a chat to staff (comma separated)"><input className="input" value={s.escalationKeywords.join(', ')} onChange={(e) => up({ escalationKeywords: e.target.value.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean) })} /></Field>
            </Body></Card>}

            {step.key === 'patients' && <PatientsStep onDone={load} />}

            {step.key === 'marketing' && <MarketingStep onChange={load} />}

            {step.key === 'integrations' && <Card title="Integrations (optional)"><Body className="col">
              <div className="small muted">Settings → Integrations shows which connections are live (email, SMS, WhatsApp, Claude AI) and what turns the others on, plus calendar feeds and webhooks. EHR and ABDM are tucked under Advanced for when you are ready. You can go live without any of these; messages stay in the outbox until a provider is connected.</div>
              <a className="btn" href="#/settings?tab=integrations" style={{ alignSelf: 'flex-start' }}>Open Integrations <IconExternalLink size={14} /></a>
            </Body></Card>}

            {step.key === 'launch' && <Card title="Go live"><Body className="col gap-16">
              <div className="grid two">
                <div className="card soft" style={{ padding: 12 }}><div className="small strong">Kiosk (tablet at reception)</div><div className="tiny muted mono" style={{ wordBreak: 'break-all' }}>{ob.kioskUrl}</div><div className="row gap-6 mt-8"><a className="btn sm" href={ob.kioskUrl} target="_blank" rel="noreferrer" onClick={() => post('/api/onboarding/mark', { kioskOpened: true }).then(load)}><IconExternalLink size={14} />Open</a><button className="btn sm ghost" onClick={() => copy(ob.kioskUrl)}><IconCopy size={14} />Copy</button></div></div>
                <div className="card soft" style={{ padding: 12 }}><div className="small strong">Waiting-room display (TV)</div><div className="tiny muted mono" style={{ wordBreak: 'break-all' }}>{ob.boardUrl}</div><div className="row gap-6 mt-8"><a className="btn sm" href={ob.boardUrl} target="_blank" rel="noreferrer" onClick={() => post('/api/onboarding/mark', { boardOpened: true }).then(load)}><IconExternalLink size={14} />Open</a><button className="btn sm ghost" onClick={() => copy(ob.boardUrl)}><IconCopy size={14} />Copy</button></div></div>
                <div className="card soft" style={{ padding: 12 }}><div className="small strong">Patient chat (website / WhatsApp preview)</div><div className="tiny muted mono" style={{ wordBreak: 'break-all' }}>{ob.chatUrl}</div><div className="row gap-6 mt-8"><a className="btn sm" href={ob.chatUrl} target="_blank" rel="noreferrer"><IconExternalLink size={14} />Open</a></div></div>
                <div className="card soft" style={{ padding: 12 }}><div className="small strong">Make a test booking</div><div className="tiny muted">Book yourself in from Schedule, then check in at the kiosk and watch the display update.</div><a className="btn sm mt-8" href="#/schedule">Open Schedule</a></div>
              </div>
              <div className="callout small">Before real patients: put the kiosk in the browser's kiosk/full-screen mode, set the display TV to the board URL, and share the WhatsApp number on Google Maps and your signboard. Under the DPDP Act, keep the consent text in Settings → Rules & kiosk current.</div>
              <button className="btn primary lg" disabled={busy || ob.completed} onClick={() => run(async () => { await post('/api/onboarding/complete'); await refresh(); navigate('#/'); }, 'Your clinic is live')}><IconRocket size={18} />{ob.completed ? 'Already live' : `Launch ${me.tenant.name}`}</button>
              {ob.percent < 100 && <div className="tiny muted">{ob.percent}% of the checklist is done. You can launch now and finish the optional steps later from the Finish setup banner.</div>}
            </Body></Card>}

            <div className="row between">
              <button className="btn" disabled={i === 0} onClick={() => setI(i - 1)}><IconArrowLeft size={16} />Back</button>
              <div className="row gap-6">{step.key !== 'launch' && <button className="btn ghost" onClick={() => setI(i + 1)}>Skip for now</button>}{step.key !== 'launch' && <button className="btn primary" disabled={busy} onClick={next}>Save and continue <IconArrowRight size={16} /></button>}</div>
            </div>
          </div>
          <div className="col gap-16">
            <Card title="Checklist"><div className="list">{step.items.map((it) => <div className="list-item" key={it.label} style={{ padding: '8px 16px' }}>{it.ok ? <IconCheck size={16} style={{ color: 'var(--good)' }} /> : <IconCircle size={16} className="faint" />}<span className="small">{it.label}</span></div>)}</div></Card>
            {step.key === 'profile' && <Card soft><Body className="tiny muted col gap-6"><b>Why we ask</b><span>Dental Council registration and, in most states, a Clinical Establishments Act registration are required to run a clinic; they appear on consent forms and receipts.</span><span>ABDM (Ayushman Bharat Digital Mission) HFR and HPR IDs let you link patient records to ABHA with consent.</span></Body></Card>}
            {step.key === 'frontdesk' && <Card soft><Body className="tiny muted col gap-6"><b>Try it</b><span>After saving, open the patient chat and ask "timings kya hai?" or "do you take Star Health cashless?"</span></Body></Card>}
          </div>
        </div>
      </main>
    </div>
  );
}

function HolidayAdd({ onAdd, presets }) {
  const [d, setD] = useState(''); const [n, setN] = useState('');
  return <div className="row wrap"><input className="input" type="date" style={{ width: 160 }} value={d} onChange={(e) => setD(e.target.value)} /><input className="input" style={{ width: 200 }} placeholder="Diwali, Ugadi, Eid…" value={n} onChange={(e) => setN(e.target.value)} /><button className="btn sm" disabled={!d || !n} onClick={() => { onAdd({ date: d, name: n }); setD(''); setN(''); }}><IconPlus size={14} />Add holiday</button><button className="btn sm ghost" onClick={() => presets.forEach(onAdd)}>Re-add national holidays</button></div>;
}

export function TeamInvites({ providers = [] }) {
  const [team, setTeam] = useState(null);
  const [f, setF] = useState({ name: '', email: '', role: 'front_desk', providerId: '' });
  const [link, setLink] = useState('');
  const [run, busy] = useAction();
  const toast = useToast();
  const load = () => get('/api/team').then(setTeam).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!team) return null;
  return (
    <Card title="Staff logins"><Body className="col">
      <div className="small muted">Invite your front desk, dentists and hygienists. Each gets their own login and only sees what their role needs. Owners and admins approve settings and marketing.</div>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1.4fr 1fr 1fr auto' }}>
        <input className="input" placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className="input" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{team.roles.filter((r) => r.id !== 'owner').map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
        <select className="input" value={f.providerId} onChange={(e) => setF({ ...f, providerId: e.target.value })}><option value="">Not a provider</option>{providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <button className="btn primary" disabled={busy || !f.email} onClick={() => run(async () => { const r = await post('/api/team/invites', f); setLink(r.link); setF({ name: '', email: '', role: 'front_desk', providerId: '' }); load(); }, 'Invitation created')}><IconPlus size={14} />Invite</button>
      </div>
      {link && <div className="callout small">No email provider is connected, so share this link on WhatsApp: <span className="mono" style={{ wordBreak: 'break-all' }}>{link}</span> <button className="btn sm ghost" onClick={() => { navigator.clipboard?.writeText(link); toast('Copied'); }}><IconCopy size={12} />Copy</button></div>}
      <div className="list card soft">
        {team.members.map((m) => <div className="list-item" key={m.id} style={{ padding: '8px 12px' }}><div className="grow small"><b>{m.user.name}</b> <span className="muted">{m.user.email}</span></div><Pill tone={m.role === 'owner' ? 'accent' : 'outline'}>{m.roleLabel}</Pill></div>)}
        {team.invites.map((inv) => <div className="list-item" key={inv.id} style={{ padding: '8px 12px' }}><div className="grow small"><b>{inv.name || inv.email}</b> <span className="muted">{inv.email} · invited</span></div><Pill tone="warn">{inv.roleLabel} · pending</Pill><button className="btn sm ghost" onClick={() => { navigator.clipboard?.writeText(inv.link); toast('Link copied'); }}><IconCopy size={12} /></button></div>)}
      </div>
    </Body></Card>
  );
}

function PatientsStep({ onDone }) {
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState(null);
  const [count, setCount] = useState(null);
  const [run, busy] = useAction();
  useEffect(() => { get('/api/patients').then((p) => setCount(p.length)).catch(() => {}); }, [result]);
  return (
    <Card title="Bring your patients"><Body className="col">
      <div className="small muted">{count === null ? '' : `${count} patients on file. `}Export a CSV from your current software (Dentee, Carestack, Practo, Excel) and drop it here. We recognise name, mobile, DOB (dd/mm/yyyy), gender, ABHA, insurer, policy number, branch, language and notes. Existing patients are updated, not duplicated.</div>
      <label className="btn" style={{ alignSelf: 'flex-start' }}><IconUpload size={16} />Choose CSV file<input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) f.text().then(setCsv); }} /></label>
      <textarea className="input mono" style={{ minHeight: 120 }} placeholder={'Name,Mobile,DOB,Insurer,Policy no\nRavi Kumar,9900011122,15/08/1985,Star Health,SH-1'} value={csv} onChange={(e) => setCsv(e.target.value)} />
      <div className="row"><button className="btn primary" disabled={busy || !csv.trim()} onClick={() => run(async () => { const r = await post('/api/patients/import', { csv }); setResult(r); await onDone(); }, 'Import finished')}><IconUpload size={16} />Import</button><a className="btn ghost" href="#/patients">Or add patients one by one</a></div>
      {result && <div className="callout small"><b>{result.created}</b> created, <b>{result.updated}</b> updated{result.errors.length ? `, ${result.errors.length} skipped` : ''}.</div>}
      <div className="tiny muted">Patients imported this way are marked as opted in to reminders (transactional). Marketing messages need their opt-in, captured on the consent form.</div>
    </Body></Card>
  );
}

function MarketingStep({ onChange }) {
  const [m, setM] = useState(null);
  const [run, busy] = useAction();
  const load = () => get('/api/marketing').then(setM).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!m) return <div className="skeleton" />;
  const st = m.settings;
  const save = (p) => run(async () => { await put('/api/marketing/settings', p); await load(); await onChange(); }, 'Saved');
  return (
    <div className="col gap-16">
      <Card title="Thank-yous & reviews"><Body className="col">
        <Field label="Google review link" hint="Google Business Profile → Get more reviews → copy link"><input className="input mono" value={st.googleReviewUrl || ''} onChange={(e) => setM({ ...m, settings: { ...st, googleReviewUrl: e.target.value } })} onBlur={() => save({ googleReviewUrl: st.googleReviewUrl })} placeholder="https://g.page/r/…/review" /></Field>
        <div className="grid two">
          <div className="card soft" style={{ padding: 12 }}><label className="check small"><input type="checkbox" checked={!!st.autoThankYou?.enabled} onChange={(e) => save({ autoThankYou: { enabled: e.target.checked } })} />Draft a thank-you after every completed visit</label><div className="tiny muted mt-8">Waits {st.autoThankYou?.delayMinutes || 60} minutes, then sends once approved.</div></div>
          <div className="card soft" style={{ padding: 12 }}><label className="check small"><input type="checkbox" checked={!!st.autoReview?.enabled} onChange={(e) => save({ autoReview: { enabled: e.target.checked } })} />Ask for a Google review after visits</label><div className="tiny muted mt-8">Needs the review link above. Waits {st.autoReview?.delayHours || 4} hours.</div></div>
        </div>
        <Field label="Who approves each message?"><div className="row wrap gap-6"><button className={`btn sm ${st.autoThankYou?.mode !== 'auto' ? 'primary' : ''}`} onClick={() => save({ autoThankYou: { mode: 'queue' }, autoReview: { mode: 'queue' } })}>An owner/admin approves every message (recommended to start)</button><button className={`btn sm ${st.autoThankYou?.mode === 'auto' ? 'primary' : ''}`} onClick={() => save({ autoThankYou: { mode: 'auto' }, autoReview: { mode: 'auto' } })}>Send automatically using the approved template</button></div></Field>
      </Body></Card>
      <Card title="AI prompts (approve before use)"><Body className="col">
        <div className="small muted">These briefs tell the AI how to write. Read each one; approve the ones you are happy with. The AI cannot use a prompt that has not been approved by an owner or admin.</div>
        {m.prompts.map((p) => <div className="row start card soft" style={{ padding: 10 }} key={p.id}><div className="grow"><div className="small strong">{p.name}</div><div className="tiny muted">{p.body}</div></div>{p.status === 'approved' ? <Pill tone="good"><IconCheck size={12} />Approved{p.approvedBy ? ` · ${p.approvedBy}` : ''}</Pill> : <button className="btn sm primary" disabled={busy || !m.canApprove} onClick={() => run(async () => { await post(`/api/marketing/prompts/${p.id}/approve`); await load(); await onChange(); }, 'Prompt approved')}><IconSparkles size={14} />Approve</button>}</div>)}
        <a className="btn ghost sm" href="#/marketing" style={{ alignSelf: 'flex-start' }}>Edit prompts in Marketing <IconExternalLink size={12} /></a>
      </Body></Card>
    </div>
  );
}
