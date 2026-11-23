import React, { useEffect, useState } from 'react';
import { brandVars, BrandLogo, fileToLogo, logoColors, monogram, BRAND_PRESETS, DEFAULT_BRAND, readableOnWhite } from '../lib/brand.jsx';
import { passwordOk } from '../lib/password.js';
import { IconPlus, IconTrash, IconDownload, IconUpload, IconRefreshAlert, IconDeviceFloppy, IconKey, IconWebhook, IconPlugConnected, IconCopy, IconSend, IconLock, IconPhoneCall, IconLanguage, IconPlayerPlay, IconCheck } from '@tabler/icons-react';
import { get, put, post, patch, del, downloadFile } from '../lib/api.js';
import { TeamInvites } from './Onboarding.jsx';
import { Card, Body, Field, useAction, Seg, Pill, Empty, useToast } from '../components/ui.jsx';
import { ago } from '../lib/format.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABEL = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

export default function Settings({ hash, me, session }) {
  const [s, setS] = useState(null);
  const [est, setEst] = useState(null);
  useEffect(() => { get('/api/estimates/visit-types').then(setEst).catch(() => {}); }, []);
  const [tab, setTab] = useState(new URLSearchParams((hash || '').split('?')[1] || '').get('tab') || 'practice');
  // A link such as #/settings?tab=team must switch the tab even when Settings is already open.
  useEffect(() => { const t = new URLSearchParams((hash || '').split('?')[1] || '').get('tab'); if (t) setTab(t); }, [hash]);
  const [run, busy] = useAction();
  const load = () => get('/api/settings').then(setS);
  useEffect(() => { load(); }, []);
  if (!s) return <div className="skeleton" />;
  const save = () => run(async () => { const { integrations, tenant, ...rest } = s; void integrations; void tenant; const next = await put('/api/settings', rest); setS(next); }, 'Settings saved');
  const up = (patchObj) => setS({ ...s, ...patchObj });
  const list = (key, idx, p) => up({ [key]: s[key].map((x, i) => (i === idx ? { ...x, ...p } : x)) });
  const remove = (key, idx) => up({ [key]: s[key].filter((_, i) => i !== idx) });
  const Hours = ({ hours, onChange }) => DAYS.map((d) => { const h = hours[d]; return (
    <div className="row" key={d}><span className="small" style={{ width: 90 }}>{DAY_LABEL[d]}</span><label className="check small"><input type="checkbox" checked={!!h} onChange={(e) => onChange({ ...hours, [d]: e.target.checked ? ['09:00', '19:00'] : null })} />Open</label>{h && <><input className="input" type="time" style={{ width: 120 }} value={h[0]} onChange={(e) => onChange({ ...hours, [d]: [e.target.value, h[1]] })} /><span className="muted">to</span><input className="input" type="time" style={{ width: 120 }} value={h[1]} onChange={(e) => onChange({ ...hours, [d]: [h[0], e.target.value] })} /></>}</div>
  ); });

  return (
    <>
      <div className="page-head">
        <div><h1>Settings</h1><p>Everything the AI front desk is allowed to say and do, your branches and dentists, prices, schemes, languages, and integrations.</p></div>
        {!['integrations', 'data', 'team', 'account', 'branding'].includes(tab) && <button className="btn primary" disabled={busy} onClick={save}><IconDeviceFloppy size={16} />Save changes</button>}
      </div>
      <Seg value={tab} onChange={setTab} options={[{ value: 'practice', label: 'Practice' }, { value: 'branding', label: 'Branding' }, { value: 'branches', label: 'Branches' }, { value: 'visits', label: 'Visit types & dentists' }, { value: 'procedures', label: 'Procedures & fees' }, { value: 'faqs', label: 'Approved FAQs' }, { value: 'payments', label: 'Payments & schemes' }, { value: 'languages', label: 'Languages & templates' }, { value: 'rules', label: 'Rules & kiosk' }, { value: 'assistant', label: 'Virtual assistant' }, { value: 'team', label: 'Team' }, { value: 'integrations', label: 'Integrations' }, { value: 'data', label: 'Data' }, { value: 'account', label: 'My account' }]} />
      <div className="mt-16">
        {tab === 'branding' && <BrandingTab s={s} up={up} slug={me?.tenant?.slug} />}
        {tab === 'practice' && (
          <div className="grid two">
            <Card title="Practice"><Body className="col">
              <Field label="Name"><input className="input" value={s.practice.name} onChange={(e) => up({ practice: { ...s.practice, name: e.target.value } })} /></Field>
              <Field label="Tagline"><input className="input" value={s.practice.tagline || ''} onChange={(e) => up({ practice: { ...s.practice, tagline: e.target.value } })} /></Field>
              <Field label="Phone"><input className="input" value={s.practice.phone} onChange={(e) => up({ practice: { ...s.practice, phone: e.target.value } })} /></Field>
              <Field label="WhatsApp number"><input className="input" value={s.practice.whatsapp || ''} onChange={(e) => up({ practice: { ...s.practice, whatsapp: e.target.value } })} /></Field>
              <Field label="Email"><input className="input" value={s.practice.email} onChange={(e) => up({ practice: { ...s.practice, email: e.target.value } })} /></Field>
              <Field label="Registration number (state dental council / clinic licence)"><input className="input" value={s.practice.registrationNumber || ''} onChange={(e) => up({ practice: { ...s.practice, registrationNumber: e.target.value } })} /></Field>
              <Field label="Scheduling grid (minutes)"><input className="input" type="number" value={s.practice.slotMinutes} onChange={(e) => up({ practice: { ...s.practice, slotMinutes: Number(e.target.value) || 15 } })} /></Field>
            </Body></Card>
            <Card title="Booking rules (online website, AI and desk)"><Body className="col">
              {(() => { const b = { bufferMin: 0, minLeadHours: 0, maxAdvanceDays: 60, onlineBooking: true, showFees: true, ...(s.practice.booking || {}) }; const set = (k, v) => up({ practice: { ...s.practice, booking: { ...b, [k]: v } } }); return (<>
                <label className="check small"><input type="checkbox" checked={b.onlineBooking} onChange={(e) => set('onlineBooking', e.target.checked)} />Patients can book on the clinic website</label>
                <label className="check small"><input type="checkbox" checked={b.showFees} onChange={(e) => set('showFees', e.target.checked)} />Show fees on the website</label>
                <Field label="Gap between appointments (minutes)" hint="Cleaning/turnaround time kept free after each visit"><input className="input" type="number" min="0" style={{ width: 100 }} value={b.bufferMin} onChange={(e) => set('bufferMin', Number(e.target.value) || 0)} /></Field>
                <Field label="Earliest online booking (hours from now)"><input className="input" type="number" min="0" style={{ width: 100 }} value={b.minLeadHours} onChange={(e) => set('minLeadHours', Number(e.target.value) || 0)} /></Field>
                <Field label="Furthest online booking (days ahead)"><input className="input" type="number" min="1" style={{ width: 100 }} value={b.maxAdvanceDays} onChange={(e) => set('maxAdvanceDays', Number(e.target.value) || 60)} /></Field>
                <div className="tiny muted">Website link: <span className="mono">#/book?t=&lt;your clinic code&gt;</span> (also in the sidebar under Patient-facing). Gap and per-dentist timings also apply to desk and AI bookings.</div>
              </>); })()}
            </Body></Card>
            <Card title="Default hours (branches can override)"><Body className="col"><Hours hours={s.practice.hours} onChange={(h) => up({ practice: { ...s.practice, hours: h } })} /></Body></Card>
          </div>
        )}
        {tab === 'branches' && (
          <Card title="Branches" actions={<button className="btn sm" onClick={() => up({ locations: [...s.locations, { id: `loc_${Date.now().toString(36)}`, name: 'New branch', address: '', phone: '', hours: s.practice.hours, chairs: 2, kioskCode: `K${s.locations.length + 1}` }] })}><IconPlus size={14} />Add branch</button>}>
            <Body className="col gap-16">
              <div className="callout small">One clinic or a chain: each branch has its own hours, chairs, kiosk code and token series. Dentists can work at several branches; the schedule never double-books them across branches.</div>
              {s.locations.map((l, i) => (
                <div className="card soft" style={{ padding: 12 }} key={l.id}>
                  <div className="grid three">
                    <Field label="Name"><input className="input" value={l.name} onChange={(e) => list('locations', i, { name: e.target.value })} /></Field>
                    <Field label="Phone"><input className="input" value={l.phone || ''} onChange={(e) => list('locations', i, { phone: e.target.value })} /></Field>
                    <div className="row"><Field label="Chairs"><input className="input" type="number" style={{ width: 80 }} value={l.chairs || 1} onChange={(e) => list('locations', i, { chairs: Number(e.target.value) })} /></Field><Field label="Kiosk code" hint={`Open #/kiosk?code=${l.kioskCode || ''} on the kiosk`}><input className="input mono" style={{ width: 110 }} value={l.kioskCode || ''} onChange={(e) => list('locations', i, { kioskCode: e.target.value.toUpperCase() })} /></Field></div>
                  </div>
                  <Field label="Address"><input className="input" value={l.address || ''} onChange={(e) => list('locations', i, { address: e.target.value })} /></Field>
                  <Field label="ABDM HFR ID (optional)"><input className="input mono" value={l.hfrId || ''} onChange={(e) => list('locations', i, { hfrId: e.target.value })} /></Field>
                  <details className="mt-8"><summary className="small muted" style={{ cursor: 'pointer' }}>Hours for this branch</summary><div className="col mt-8"><Hours hours={l.hours || s.practice.hours} onChange={(h) => list('locations', i, { hours: h })} /></div></details>
                  <div className="row mt-8" style={{ justifyContent: 'flex-end' }}><button className="btn sm ghost" disabled={s.locations.length === 1} onClick={() => remove('locations', i)}><IconTrash size={14} />Remove</button></div>
                </div>
              ))}
            </Body>
          </Card>
        )}
        {tab === 'branches' && (
          <Card title="Holidays (clinic closed)" className="mt-16"><Body className="col">
            <div className="tag-list">{(s.holidays || []).map((h, i) => <span key={i} className="pill outline">{h.date} · {h.name}<button className="btn ghost icon sm" style={{ padding: 0, marginLeft: 4 }} onClick={() => remove('holidays', i)}><IconTrash size={11} /></button></span>)}</div>
            <HolidayRow onAdd={(h) => up({ holidays: [...(s.holidays || []), h].sort((a, b) => a.date.localeCompare(b.date)) })} />
          </Body></Card>
        )}
        {tab === 'visits' && (
          <div className="grid two">
            <Card title="Visit types" actions={<button className="btn sm" onClick={() => up({ visitTypes: [...s.visitTypes, { id: `vt_${Date.now().toString(36)}`, name: 'New visit type', durationMin: 30, providerRole: 'Dentist', fee: 0, keywords: [] }] })}><IconPlus size={14} />Add</button>}>
              <Body className="col gap-16">
                {s.visitTypes.map((v, i) => (
                  <div className="card soft" style={{ padding: 12 }} key={v.id}>
                    <div className="grid two">
                      <Field label="Name"><input className="input" value={v.name} onChange={(e) => list('visitTypes', i, { name: e.target.value })} /></Field>
                      <div className="row"><Field label="Minutes"><input className="input" type="number" style={{ width: 80 }} value={v.durationMin} onChange={(e) => list('visitTypes', i, { durationMin: Number(e.target.value) })} /></Field><Field label={`Fee (${s.locale?.currencySymbol || '₹'})`}><input className="input" type="number" style={{ width: 100 }} value={v.fee || 0} onChange={(e) => list('visitTypes', i, { fee: Number(e.target.value) })} /></Field><Field label="Who"><select className="input" value={v.providerRole || ''} onChange={(e) => list('visitTypes', i, { providerRole: e.target.value })}><option value="">Any</option><option>Dentist</option><option>Hygienist</option></select></Field></div>
                    </div>
                    {(() => { const sug = est?.suggestions?.find((x) => x.visitTypeId === v.id); return sug ? <div className={`callout small ${Math.abs(sug.delta) >= 10 ? 'warn' : ''}`}><b>AI estimate: {sug.suggested} min</b> <span className="muted">({sug.confidence} confidence)</span> — {sug.basis} {sug.action}{Math.abs(sug.delta) >= 5 && <button className="btn sm" style={{ marginLeft: 8 }} onClick={() => list('visitTypes', i, { durationMin: sug.suggested })}>Use {sug.suggested} min</button>}</div> : null; })()}
                    <Field label="Words patients use (English, Hindi, Kannada, Hinglish — comma separated)" hint="The AI maps these to this visit type."><input className="input" value={v.keywords.join(', ')} onChange={(e) => list('visitTypes', i, { keywords: e.target.value.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean) })} /></Field>
                    <label className="check small mt-8"><input type="checkbox" checked={v.onlineBookable !== false} onChange={(e) => list('visitTypes', i, { onlineBookable: e.target.checked })} />Patients can book this on the website</label>
                    <div className="row mt-8" style={{ justifyContent: 'flex-end' }}><button className="btn sm ghost" onClick={() => remove('visitTypes', i)}><IconTrash size={14} />Remove</button></div>
                  </div>
                ))}
              </Body>
            </Card>
            <Card title="Dentists & hygienists" actions={<button className="btn sm" onClick={() => up({ providers: [...s.providers, { id: `prov_${Date.now().toString(36)}`, name: 'Dr. New', role: 'Dentist', specialty: '', qualifications: '', locationIds: [s.locations[0]?.id].filter(Boolean), consultationFee: 500 }] })}><IconPlus size={14} />Add</button>}>
              <Body className="col gap-16">
                {s.providers.map((p, i) => (
                  <div className="card soft" style={{ padding: 12 }} key={p.id}>
                    <div className="grid two">
                      <Field label="Name"><input className="input" value={p.name} onChange={(e) => list('providers', i, { name: e.target.value })} /></Field>
                      <Field label="Role"><select className="input" value={p.role} onChange={(e) => list('providers', i, { role: e.target.value })}><option>Dentist</option><option>Hygienist</option></select></Field>
                      <Field label="Specialty"><input className="input" value={p.specialty || ''} onChange={(e) => list('providers', i, { specialty: e.target.value })} placeholder="Endodontist, Orthodontist, Oral surgeon…" /></Field>
                      <Field label="Qualifications"><input className="input" value={p.qualifications || ''} onChange={(e) => list('providers', i, { qualifications: e.target.value })} placeholder="BDS, MDS" /></Field>
                      <Field label="Dentist's share of fees collected (%)" hint="Used for the Earnings tab; the rest is the clinic's"><input className="input" type="number" min="0" max="100" value={p.revenueSharePct ?? 100} onChange={(e) => list('providers', i, { revenueSharePct: Math.min(100, Math.max(0, Number(e.target.value))) })} /></Field>
                      <Field label={`Consultation fee (${s.locale?.currencySymbol || '₹'})`}><input className="input" type="number" value={p.consultationFee || 0} onChange={(e) => list('providers', i, { consultationFee: Number(e.target.value) })} /></Field>
                      <Field label="Works at"><div className="row wrap gap-6">{s.locations.map((l) => <label key={l.id} className="check small"><input type="checkbox" checked={(p.locationIds || []).includes(l.id)} onChange={(e) => list('providers', i, { locationIds: e.target.checked ? [...(p.locationIds || []), l.id] : (p.locationIds || []).filter((x) => x !== l.id) })} />{l.name}</label>)}</div></Field>
                    </div>
                    <details className="mt-8"><summary className="small muted" style={{ cursor: 'pointer' }}>Working days &amp; appointment length for {p.name}</summary><div className="col mt-8">
                      <div className="tiny muted">Narrows the branch hours for this person. Leave a day unticked for a day off.</div>
                      <Hours hours={DAYS.reduce((o, d) => ({ ...o, [d]: p.hours ? (p.hours[d] ?? null) : (s.practice.hours[d] || null) }), {})} onChange={(h) => list('providers', i, { hours: h })} />
                      <div className="row"><Field label="Slot step (minutes)" hint="Blank = clinic grid"><input className="input" type="number" min="5" style={{ width: 90 }} value={p.slotMinutes || ''} onChange={(e) => list('providers', i, { slotMinutes: Number(e.target.value) || undefined })} /></Field>{p.hours && <button className="btn sm ghost" onClick={() => list('providers', i, { hours: undefined })}>Use branch hours</button>}</div>
                    </div></details>
                    <details className="mt-8"><summary className="small muted" style={{ cursor: 'pointer' }}>Fee per visit type for {p.name}</summary><div className="col mt-8">
                      <div className="tiny muted">Blank = use the visit type's fee (or the consultation fee when that is 0).</div>
                      {s.visitTypes.filter((v) => !v.providerRole || v.providerRole === p.role).map((v) => <div className="row" key={v.id}><span className="small" style={{ flex: 1 }}>{v.name} <span className="muted">({v.fee ? `${s.locale?.currencySymbol || '₹'}${v.fee}` : 'consultation fee'})</span></span><input className="input" type="number" min="0" style={{ width: 110 }} placeholder="default" value={p.feeOverrides?.[v.id] ?? ''} onChange={(e) => { const fo = { ...(p.feeOverrides || {}) }; if (e.target.value === '') delete fo[v.id]; else fo[v.id] = Number(e.target.value); list('providers', i, { feeOverrides: fo }); }} /></div>)}
                    </div></details>
                    <div className="row mt-8" style={{ justifyContent: 'flex-end' }}><button className="btn sm ghost" onClick={() => remove('providers', i)}><IconTrash size={14} />Remove</button></div>
                  </div>
                ))}
              </Body>
            </Card>
          </div>
        )}
        {tab === 'procedures' && <ProceduresTab s={s} up={up} list={list} remove={remove} />}
        {tab === 'faqs' && (
          <Card title="Approved FAQs" actions={<button className="btn sm" onClick={() => up({ faqs: [...s.faqs, { id: `faq_${Date.now().toString(36)}`, question: '', answer: '', keywords: [] }] })}><IconPlus size={14} />Add FAQ</button>}>
            <Body className="col gap-16">
              <div className="callout small">The AI only answers with these. Anything clinical, about medicines, billing disputes, records, or complaints is handed to staff regardless of what is here. Trigger words can be in English, Hindi, Kannada or Hinglish.</div>
              {s.faqs.map((f, i) => (
                <div className="card soft" style={{ padding: 12 }} key={f.id}>
                  <Field label="Question"><input className="input" value={f.question} onChange={(e) => list('faqs', i, { question: e.target.value })} /></Field>
                  <Field label="Approved answer"><textarea className="input" value={f.answer} onChange={(e) => list('faqs', i, { answer: e.target.value })} /></Field>
                  <Field label="Trigger words (comma separated)"><input className="input" value={(f.keywords || []).join(', ')} onChange={(e) => list('faqs', i, { keywords: e.target.value.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean) })} /></Field>
                  <div className="row mt-8" style={{ justifyContent: 'flex-end' }}><button className="btn sm ghost" onClick={() => remove('faqs', i)}><IconTrash size={14} />Remove</button></div>
                </div>
              ))}
              <Field label="Extra words that always send a conversation to staff (comma separated)"><input className="input" value={s.escalationKeywords.join(', ')} onChange={(e) => up({ escalationKeywords: e.target.value.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean) })} /></Field>
            </Body>
          </Card>
        )}
        {tab === 'payments' && (
          <div className="grid two">
            <Card title="Payment modes"><Body className="col">
              <Field label="Modes offered at the desk (comma separated)"><input className="input" value={(s.paymentModes || []).join(', ')} onChange={(e) => up({ paymentModes: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></Field>
              <Field label="Currency symbol"><input className="input" style={{ width: 80 }} value={s.locale?.currencySymbol || '₹'} onChange={(e) => up({ locale: { ...s.locale, currencySymbol: e.target.value } })} /></Field>
              <Field label="Receipt number prefix"><input className="input" style={{ width: 120 }} value={s.billing?.receiptPrefix ?? 'RCP'} onChange={(e) => up({ billing: { ...s.billing, receiptPrefix: e.target.value } })} /></Field>
              <Field label="GST on receipts (% included in the amount; 0 = none shown)"><input className="input" type="number" min="0" max="28" style={{ width: 100 }} value={s.billing?.gstRate ?? 0} onChange={(e) => up({ billing: { ...s.billing, gstRate: e.target.value } })} /></Field>
              <Field label="Receipt footer"><input className="input" value={s.billing?.footer ?? ''} onChange={(e) => up({ billing: { ...s.billing, footer: e.target.value } })} /></Field>
              <div className="tiny muted">Receipts are numbered "{s.billing?.receiptPrefix || 'RCP'}/FY/0001" per Indian financial year and never reused. Whether GST applies to your services is a question for your accountant — leave 0 if unsure.</div>
              <div className="tiny muted">Fees come from the visit type, or the dentist's consultation fee when the visit type has none. Procedures use the treatment-plan estimate.</div>
            </Body></Card>
            <Card title="Insurance & schemes accepted" actions={<button className="btn sm" onClick={() => up({ insuranceOptions: [...(s.insuranceOptions || []), { id: `ins_${Date.now().toString(36)}`, label: 'New scheme', examples: '' }] })}><IconPlus size={14} />Add</button>}><Body className="col">
              {(s.insuranceOptions || []).map((o, i) => <div className="row" key={o.id}><input className="input" value={o.label} onChange={(e) => list('insuranceOptions', i, { label: e.target.value })} /><input className="input" placeholder="Examples shown to patients" value={o.examples || ''} onChange={(e) => list('insuranceOptions', i, { examples: e.target.value })} /><button className="btn sm ghost icon" disabled={o.id === 'self'} onClick={() => remove('insuranceOptions', i)}><IconTrash size={14} /></button></div>)}
              <div className="tiny muted">Shown on the pre-visit form and the kiosk. Empanelment details for the AI go in the insurance FAQ.</div>
            </Body></Card>
          </div>
        )}
        {tab === 'languages' && <LanguagesTab s={s} up={up} list={list} />}
        {tab === 'rules' && (
          <div className="grid two">
            <Card title="Scheduling & outreach rules"><Body className="col">
              <Field label="Cancellation notice (hours)"><input className="input" type="number" value={s.rules.cancelNoticeHours} onChange={(e) => up({ rules: { ...s.rules, cancelNoticeHours: Number(e.target.value) } })} /></Field>
              <Field label="Reminder times (hours before, comma separated)"><input className="input" value={s.rules.reminderHoursBefore.join(', ')} onChange={(e) => up({ rules: { ...s.rules, reminderHoursBefore: e.target.value.split(',').map((x) => Number(x.trim())).filter((n) => n > 0) } })} /></Field>
              <label className="check small"><input type="checkbox" checked={s.rules.waitlistAutoOffer} onChange={(e) => up({ rules: { ...s.rules, waitlistAutoOffer: e.target.checked } })} />Offer cancelled slots to the waitlist automatically</label>
              <Field label="Recall interval (months)"><input className="input" type="number" value={s.rules.recallIntervalMonths} onChange={(e) => up({ rules: { ...s.rules, recallIntervalMonths: Number(e.target.value) } })} /></Field>
              <Field label="Count an inquiry as unanswered after (minutes)"><input className="input" type="number" value={s.rules.unansweredMinutes} onChange={(e) => up({ rules: { ...s.rules, unansweredMinutes: Number(e.target.value) } })} /></Field>
              <label className="check small"><input type="checkbox" checked={s.rules.tokensPerLocation !== false} onChange={(e) => up({ rules: { ...s.rules, tokensPerLocation: e.target.checked } })} />Separate token series per branch (A01…, B01…)</label>
            </Body></Card>
            <Card title="After hours & missed appointments"><Body className="col">
              <label className="check small"><input type="checkbox" checked={s.afterHours?.enabled !== false} onChange={(e) => up({ afterHours: { ...(s.afterHours || {}), enabled: e.target.checked } })} />AI answers after hours (books, and takes messages for a morning callback)</label>
              <Field label="After-hours notice (English)" hint="{{opens}} becomes the next opening time"><textarea className="input" value={s.afterHours?.message?.en || ''} onChange={(e) => up({ afterHours: { ...(s.afterHours || {}), message: { ...(s.afterHours?.message || {}), en: e.target.value } } })} /></Field>
              <Field label="After-hours notice (Hindi)"><textarea className="input" value={s.afterHours?.message?.hi || ''} onChange={(e) => up({ afterHours: { ...(s.afterHours || {}), message: { ...(s.afterHours?.message || {}), hi: e.target.value } } })} /></Field>
              <Field label="Emergency line"><input className="input" value={s.afterHours?.emergency || ''} onChange={(e) => up({ afterHours: { ...(s.afterHours || {}), emergency: e.target.value } })} /></Field>
              <Field label="Mark as no-show after (minutes past start, if not checked in)" hint="The patient is messaged to rebook and a callback is created"><input className="input" type="number" value={s.rules.noShowAfterMinutes ?? 20} onChange={(e) => up({ rules: { ...s.rules, noShowAfterMinutes: Number(e.target.value) } })} /></Field>
            </Body></Card>
            <Card title="Kiosk & consent"><Body className="col">
              <Field label="Kiosk privacy reset after inactivity (seconds)" hint="The session ends and the screen clears so the next patient never sees the previous one's details."><input className="input" type="number" value={s.rules.kioskResetSeconds} onChange={(e) => up({ rules: { ...s.rules, kioskResetSeconds: Number(e.target.value) } })} /></Field>
              <Field label="Consent text shown on forms and at the kiosk" hint="Includes DPDP Act 2023 and ABDM consent wording by default."><textarea className="input" style={{ minHeight: 160 }} value={s.consentText} onChange={(e) => up({ consentText: e.target.value })} /></Field>
            </Body></Card>
          </div>
        )}
        {tab === 'assistant' && <AssistantTab s={s} up={up} />}
        {tab === 'team' && <><TeamInvites providers={s.providers} /><div className="mt-16"><RolesMatrix /></div></>}
        {tab === 'account' && <AccountTab me={me} session={session} />}
        {tab === 'integrations' && <IntegrationsTab />}
        {tab === 'data' && <DataTab reload={load} />}
      </div>
    </>
  );
}

function LanguagesTab({ s, up, list }) {
  const langs = s.locale?.languages || [];
  const [lang, setLang] = useState('en');
  return (
    <div className="grid two">
      <Card title="Languages & channel"><Body className="col">
        <div className="callout small">Patients pick a language on the kiosk and the form. Templates below are sent in the patient's preferred language when a translation exists, otherwise in the default language.</div>
        <Field label="Languages offered (code: name, comma separated)"><input className="input" value={langs.map((l) => `${l.code}: ${l.name}`).join(', ')} onChange={(e) => up({ locale: { ...s.locale, languages: e.target.value.split(',').map((x) => { const [code, ...rest] = x.split(':'); return { code: code.trim(), name: rest.join(':').trim() || code.trim() }; }).filter((l) => l.code) } })} /></Field>
        <Field label="Default language"><select className="input" value={s.locale?.defaultLanguage || 'en'} onChange={(e) => up({ locale: { ...s.locale, defaultLanguage: e.target.value } })}>{langs.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select></Field>
        <Field label="Default channel for outbound messages"><select className="input" value={s.locale?.defaultChannel || 'whatsapp'} onChange={(e) => up({ locale: { ...s.locale, defaultChannel: e.target.value } })}><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option></select></Field>
        <Field label="Country code for mobiles"><input className="input" style={{ width: 90 }} value={s.locale?.phoneCountryCode || '91'} onChange={(e) => up({ locale: { ...s.locale, phoneCountryCode: e.target.value.replace(/\D/g, '') } })} /></Field>
      </Body></Card>
      <Card title="Message templates" actions={<Seg value={lang} onChange={setLang} options={langs.map((l) => ({ value: l.code, label: l.name }))} />}>
        <Body className="col gap-16">
          <div className="tiny muted">Placeholders: {'{{firstName}} {{practice}} {{visitType}} {{provider}} {{location}} {{when}} {{time}} {{formsLink}} {{treatment}} {{token}}'}</div>
          {s.templates.map((t, i) => { const body = typeof t.body === 'string' ? { en: t.body } : t.body; return (
            <div key={t.id} className="col gap-4">
              <div className="row between"><span className="small strong">{t.name}</span><Pill tone={body[lang] ? 'good' : 'warn'}>{body[lang] ? 'Translated' : `Falls back to ${(langs.find((l) => l.code === (s.locale?.defaultLanguage || 'en')) || {}).name || 'default'}`}</Pill></div>
              <textarea className="input" style={{ minHeight: 64 }} value={body[lang] || ''} placeholder={body.en} onChange={(e) => list('templates', i, { body: { ...body, [lang]: e.target.value } })} />
            </div>
          ); })}
        </Body>
      </Card>
    </div>
  );
}

function IntegrationsTab() {
  const [cfg, setCfg] = useState(null);
  const [feeds, setFeeds] = useState(null);
  const [outbox, setOutbox] = useState(null);
  const loadFeeds = () => get('/api/calendar/feeds').then(setFeeds).catch(() => {});
  const loadOutbox = () => get('/api/integrations/ehr-outbox').then(setOutbox).catch(() => {});
  useEffect(() => { loadFeeds(); loadOutbox(); }, []);
  const [newKey, setNewKey] = useState(null);
  const [hook, setHook] = useState({ name: '', url: '', events: [] });
  const [run, busy] = useAction();
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const load = () => get('/api/integrations').then(setCfg).catch(() => {});
  useEffect(() => { load(); get('/api/integrations/status').then(setStatus).catch(() => {}); }, []);
  if (!cfg) return <div className="skeleton" />;
  const base = `${window.location.origin}/api/fhir`;
  const copy = (t) => { navigator.clipboard?.writeText(t); toast('Copied'); };
  return (
    <div className="col gap-16">
      <StatusBoard status={status} cfg={cfg} />
      <ConnectCards status={status} />
      <VoiceCard />
      <Card title="Calendar feeds (Google, Outlook, Apple)" actions={<div className="row gap-6">{feeds?.enabled && <button className="btn sm ghost" onClick={() => run(async () => { await post('/api/calendar/key', { disable: true }); loadFeeds(); }, 'Feeds disabled')}>Disable</button>}<button className="btn sm" disabled={busy} onClick={() => run(async () => { await post('/api/calendar/key'); loadFeeds(); }, feeds?.enabled ? 'Feed links rotated' : 'Feeds enabled')}>{feeds?.enabled ? 'Rotate links' : 'Enable feeds'}</button></div>}>
        <Body className="col">
          <div className="small muted">Each dentist gets a private subscription link. In Google Calendar: Other calendars → + → From URL. In Outlook: Add calendar → Subscribe from web. On iPhone: Settings → Calendar → Accounts → Add subscribed calendar. Appointments and leave blocks appear within 15 minutes; patients get add-to-calendar links in their confirmations.</div>
          {feeds?.enabled ? <div className="list card soft">{feeds.feeds.map((f) => <div className="list-item" key={f.providerId} style={{ padding: '8px 12px' }}><div className="grow"><div className="small strong">{f.name}</div><div className="tiny mono muted" style={{ wordBreak: 'break-all' }}>{f.url}</div></div><button className="btn sm ghost" onClick={() => copy(f.url)}><IconCopy size={12} />Copy</button></div>)}</div> : <div className="tiny muted">Feeds are off. Enable them to get a link per dentist. Anyone with a link can read that dentist's schedule, so rotate the links if one leaks.</div>}
        </Body>
      </Card>
      <Card title={<span className="row gap-6"><IconWebhook size={16} />Webhooks</span>}>
        <Body className="col gap-16">
          <div className="small muted">Push events to your EHR, billing, or analytics system in real time. Each delivery is a JSON POST signed with HMAC-SHA256 in the <span className="mono">x-clinovara-signature</span> header.</div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 2fr auto' }}>
            <input className="input" placeholder="Name" value={hook.name} onChange={(e) => setHook({ ...hook, name: e.target.value })} />
            <input className="input mono" placeholder="https://your-system.example/clinovara" value={hook.url} onChange={(e) => setHook({ ...hook, url: e.target.value })} />
            <button className="btn primary" disabled={busy || !hook.url} onClick={() => run(async () => { await post('/api/integrations/webhooks', hook); setHook({ name: '', url: '', events: [] }); load(); }, 'Webhook added')}><IconPlus size={16} />Add</button>
          </div>
          <div className="tag-list">{cfg.events.filter((e) => e !== 'test.ping').map((e) => <button key={e} className={`btn sm ${hook.events.includes(e) ? 'primary' : ''}`} onClick={() => setHook({ ...hook, events: hook.events.includes(e) ? hook.events.filter((x) => x !== e) : [...hook.events, e] })}>{e}</button>)}<span className="tiny muted">No selection = all events</span></div>
          <div className="list card soft">
            {cfg.webhooks.map((w) => <div className="list-item" key={w.id}><div className="grow"><div className="small strong">{w.name || w.url}</div><div className="tiny muted mono">{w.url}</div><div className="tag-list mt-8" style={{ marginTop: 4 }}>{(w.events.length ? w.events : ['all events']).map((e) => <span key={e} className="pill outline" style={{ fontSize: 11 }}>{e}</span>)}</div></div><Pill tone={w.active ? 'good' : ''}>{w.active ? 'Active' : 'Paused'}</Pill><button className="btn sm" onClick={() => run(async () => { const r = await post(`/api/integrations/webhooks/${w.id}/test`); load(); return r; }, 'Test sent')}><IconSend size={13} />Test</button><button className="btn sm ghost" onClick={() => run(async () => { await patch(`/api/integrations/webhooks/${w.id}`, { active: !w.active }); load(); })}>{w.active ? 'Pause' : 'Resume'}</button><button className="btn sm ghost icon" onClick={() => run(async () => { await del(`/api/integrations/webhooks/${w.id}`); load(); }, 'Removed')}><IconTrash size={14} /></button></div>)}
            {cfg.webhooks.length === 0 && <Empty>No webhooks yet.</Empty>}
          </div>
          {cfg.log.length > 0 && <div><div className="small strong mb-8">Recent deliveries</div><table className="table"><thead><tr><th>Event</th><th>URL</th><th>Status</th><th>When</th></tr></thead><tbody>{cfg.log.slice(0, 10).map((l) => <tr key={l.id}><td className="mono small">{l.event}</td><td className="tiny muted truncate" style={{ maxWidth: 260 }}>{l.url}</td><td><Pill tone={l.status === 'delivered' ? 'good' : l.status === 'failed' ? 'bad' : ''}>{l.status}{l.responseCode ? ` ${l.responseCode}` : ''}{l.error ? ` · ${l.error}` : ''}</Pill></td><td className="tiny muted">{ago(l.at)}</td></tr>)}</tbody></table></div>}
        </Body>
      </Card>
      <details className="setup-card setup-more">
        <summary>Advanced: EHR, FHIR and ABDM (connect these when you are ready)</summary>
        <div className="col gap-16" style={{ paddingTop: 14 }}>
      <div className="grid two">
        <Card title={<span className="row gap-6"><IconKey size={16} />API access (FHIR R4)</span>}><Body className="col">
          <div className="small">Any EHR, HMIS or practice-management system can read and write Clinovara data over standard FHIR R4. Base URL: <span className="mono">{base}</span> <button className="btn sm ghost icon" onClick={() => copy(base)}><IconCopy size={12} /></button></div>
          <div className="tag-list">{['Patient', 'Practitioner', 'Location', 'Appointment', 'Encounter', 'Consent', 'QuestionnaireResponse', 'CarePlan', 'Communication'].map((r) => <a key={r} className="pill outline" href={`${base}/${r}`} target="_blank" rel="noreferrer">{r}</a>)}<a className="pill accent" href={`${base}/Bundle`} target="_blank" rel="noreferrer">Full Bundle export</a><a className="pill outline" href={`${base}/metadata`} target="_blank" rel="noreferrer">CapabilityStatement</a></div>
          <div className="tiny muted">Writes: POST /Patient (create or update by ABHA, id or mobile+DOB) and POST /Appointment. ABHA IDs are exported as NDHM identifiers, so ABDM HIP/HIU flows can map directly. Patient records include the {'{$everything}'} operation.</div>
          <div className="divider" />
          <div className="row between"><div className="small">API key: {cfg.hasApiKey ? <span className="mono">{cfg.apiKey}</span> : <Pill tone="warn">Not set — endpoints are open on this network</Pill>}</div><div className="row gap-6"><button className="btn sm" disabled={busy} onClick={() => run(async () => { const r = await post('/api/integrations/api-key'); setNewKey(r.apiKey); load(); }, 'New key generated')}>{cfg.hasApiKey ? 'Rotate key' : 'Generate key'}</button>{cfg.hasApiKey && <button className="btn sm ghost" onClick={() => run(async () => { await del('/api/integrations/api-key'); setNewKey(null); load(); }, 'Key removed')}>Remove</button>}</div></div>
          {newKey && <div className="callout small"><b>Copy this key now — it is shown once.</b><div className="row mt-8"><code className="mono" style={{ wordBreak: 'break-all' }}>{newKey}</code><button className="btn sm ghost icon" onClick={() => copy(newKey)}><IconCopy size={12} /></button></div><div className="tiny muted mt-8">Send it as the <span className="mono">x-api-key</span> header (or Bearer token) on every /api/fhir request.</div></div>}
        </Body></Card>
        <Card title={<span className="row gap-6"><IconPlugConnected size={16} />Connected systems</span>}><Body className="col">
          <Field label="EHR / practice software name"><input className="input" value={cfg.ehr?.name || ''} onChange={(e) => setCfg({ ...cfg, ehr: { ...cfg.ehr, name: e.target.value } })} placeholder="e.g. Dentee, Carestack, Practo Ray, custom HMIS" /></Field>
          <Field label="Their FHIR base URL (for future two-way sync)"><input className="input mono" value={cfg.ehr?.fhirBaseUrl || ''} onChange={(e) => setCfg({ ...cfg, ehr: { ...cfg.ehr, fhirBaseUrl: e.target.value } })} placeholder="https://ehr.example/fhir" /></Field>
          <div className="divider" />
          <Field label="Messaging provider"><select className="input" value={cfg.messaging?.provider || 'none'} onChange={(e) => setCfg({ ...cfg, messaging: { ...cfg.messaging, provider: e.target.value } })}><option value="none">None (messages stay in the outbox)</option><option value="whatsapp_cloud">WhatsApp Business — Meta Cloud API</option><option value="gupshup">WhatsApp — Gupshup</option><option value="interakt">WhatsApp — Interakt</option><option value="msg91">SMS — MSG91</option><option value="kaleyra">SMS — Kaleyra</option><option value="twilio">Twilio</option></select></Field>
          <Field label="Sender ID / phone number ID"><input className="input" value={cfg.messaging?.senderId || ''} onChange={(e) => setCfg({ ...cfg, messaging: { ...cfg.messaging, senderId: e.target.value } })} /></Field>
          <div className="divider" />
          <label className="check small"><input type="checkbox" checked={!!cfg.abdm?.enabled} onChange={(e) => setCfg({ ...cfg, abdm: { ...cfg.abdm, enabled: e.target.checked } })} />Registered as an ABDM Health Information Provider (HIP)</label>
          <div className="grid two"><Field label="HIP ID"><input className="input mono" value={cfg.abdm?.hipId || ''} onChange={(e) => setCfg({ ...cfg, abdm: { ...cfg.abdm, hipId: e.target.value } })} /></Field><Field label="HIP name"><input className="input" value={cfg.abdm?.hipName || ''} onChange={(e) => setCfg({ ...cfg, abdm: { ...cfg.abdm, hipName: e.target.value } })} /></Field></div>
          <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={() => run(async () => { await put('/api/integrations/config', { ehr: cfg.ehr, messaging: cfg.messaging, abdm: cfg.abdm }); load(); }, 'Integration settings saved')}><IconDeviceFloppy size={16} />Save</button>
          <div className="tiny muted">These settings are stored for the connector; sending through the provider and ABDM consent-manager flows are not wired in this build. Messages are recorded in the outbox until they are.</div>
        </Body></Card>
      </div>
      <Card title={<span className="row gap-6"><IconPlugConnected size={16} />EHR record queue</span>}>
        <Body className="col gap-16">
          <div className="small muted">Visit summaries and closed cases dentists send to the EHR, as a FHIR bundle (Patient, Encounter, CarePlan, and a visit summary document). Without an EHR base URL above, records queue here until one is connected.</div>
          <div className="list card soft">
            {(outbox || []).map((e) => (
              <div className="list-item" key={e.id}>
                <div className="grow small"><b>{e.reason || 'Export'}</b><span className="tiny muted"> · {e.resources?.join(', ')}{e.ehrName ? ` · ${e.ehrName}` : ''}</span><div className="tiny faint">{ago(e.at)}</div></div>
                <Pill tone={e.status === 'sent' ? 'good' : e.status === 'failed' ? 'bad' : e.status === 'sending' ? 'accent' : 'outline'}>{{ sent: 'Sent', failed: 'Failed', sending: 'Sending…', queued: 'Queued' }[e.status] || e.status}{e.responseCode ? ` ${e.responseCode}` : ''}</Pill>
                {e.status !== 'sent' && <button className="btn sm ghost" onClick={() => run(async () => { await post(`/api/integrations/ehr-outbox/${e.id}/resend`); loadOutbox(); }, 'Resent')}><IconSend size={13} />Resend</button>}
              </div>
            ))}
            {outbox && outbox.length === 0 && <Empty>Nothing sent yet. This fills up as dentists finish visits and close cases.</Empty>}
          </div>
        </Body>
      </Card>
        </div>
      </details>
    </div>
  );
}

function HolidayRow({ onAdd }) {
  const [d, setD] = useState(''); const [n, setN] = useState('');
  return <div className="row wrap"><input className="input" type="date" style={{ width: 160 }} value={d} onChange={(e) => setD(e.target.value)} /><input className="input" style={{ width: 220 }} placeholder="Diwali, Ugadi, Eid, Pongal…" value={n} onChange={(e) => setN(e.target.value)} /><button className="btn sm" disabled={!d || !n} onClick={() => { onAdd({ date: d, name: n }); setD(''); setN(''); }}><IconPlus size={14} />Add</button></div>;
}

function AccountTab({ me, session }) {
  const [f, setF] = useState({ name: me?.user?.name || '', phone: me?.user?.phone || '', currentPassword: '', newPassword: '' });
  const [run, busy] = useAction();
  return (
    <div className="grid two">
      <Card title="Profile"><Body className="col">
        <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Mobile (+91)"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Email"><input className="input" value={me?.user?.email || ''} disabled /></Field>
        <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={() => run(async () => { await patch('/api/auth/me', { name: f.name, phone: f.phone }); await session.refresh(); }, 'Profile saved')}><IconDeviceFloppy size={16} />Save</button>
      </Body></Card>
      <Card title="Password"><Body className="col">
        <Field label="Current password"><input className="input" type="password" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} /></Field>
        <Field label="New password" hint="8+ characters with an uppercase letter, a lowercase letter, a number and a special character"><input className="input" type="password" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} /></Field>
        <button className="btn" style={{ alignSelf: 'flex-start' }} disabled={busy || !passwordOk(f.newPassword)} onClick={() => run(async () => { await patch('/api/auth/me', { currentPassword: f.currentPassword, newPassword: f.newPassword }); setF({ ...f, currentPassword: '', newPassword: '' }); }, 'Password changed')}>Change password</button>
        <div className="tiny muted">Your clinics: {me?.memberships?.map((m) => `${m.name} (${m.role.replace('_', ' ')})`).join(', ')}</div>
      </Body></Card>
    </div>
  );
}

function DataTab({ reload }) {
  const [run] = useAction();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="grid two">
      <Card title="Backup & migration"><Body className="col">
        <p className="small muted">Data lives in a JSON file on the backend. Export it for a backup, import a backup to replace everything, or export a FHIR Bundle to move to another system.</p>
        <div className="row wrap"><button className="btn" onClick={() => run(() => downloadFile('/api/admin/export'), null)}><IconDownload size={16} />Export JSON</button>
          <label className="btn"><IconUpload size={16} />Import JSON<input type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; f.text().then((t) => run(async () => { await post('/api/admin/import', JSON.parse(t)); reload(); }, 'Imported')); }} /></label>
          <button className="btn" onClick={() => run(() => downloadFile('/api/fhir/Bundle', `clinovara-fhir-bundle-${new Date().toISOString().slice(0, 10)}.json`), null)}><IconDownload size={16} />Export FHIR Bundle</button>
          <button className="btn" onClick={() => run(() => downloadFile('/api/patients/export.csv'), null)}><IconDownload size={16} />Patients CSV</button></div>
        <div className="tiny muted">Under the DPDP Act 2023 patients may ask for their data or its deletion; the patient record and FHIR $everything give you everything held about them.</div>
      </Body></Card>
      <Card title="Demo data"><Body className="col">
        <p className="small muted">Reset replaces all data with the SmileCare Dental demo set (two branches in Bengaluru, patients, today's appointments, conversations, plans). Integration settings are kept.</p>
        {!confirm ? <button className="btn danger" onClick={() => setConfirm(true)}><IconRefreshAlert size={16} />Reset to demo data</button> : <div className="row"><button className="btn danger" onClick={() => run(async () => { await post('/api/admin/reset'); setConfirm(false); reload(); }, 'Demo data restored')}>Yes, replace everything</button><button className="btn ghost" onClick={() => setConfirm(false)}>Cancel</button></div>}
      </Body></Card>
    </div>
  );
}

const CATEGORIES = ['Diagnosis', 'Preventive', 'Restorative', 'Endodontics', 'Prosthodontics', 'Cosmetic', 'Oral surgery', 'Implants', 'Orthodontics', 'Appliances', 'Pediatric', 'Periodontics', 'General'];

/** The clinic's fixed procedure and fee catalogue. Dentists pick from this list; how much room they have to change a price is set by the fee policy below. */
function ProceduresTab({ s, up, list, remove }) {
  const fees = s.fees || { mode: 'fixed', allowCustom: true, noteOnChange: true, quoteToPatients: true, quoteNote: '' };
  const setFees = (patchObj) => up({ fees: { ...fees, ...patchObj } });
  const sym = s.locale?.currencySymbol || '₹';
  const [cat, setCat] = useState('all');
  const [run, busy] = useAction();
  const [importReport, setImportReport] = useState(null);
  const procs = s.procedures || [];
  const shown = cat === 'all' ? procs : procs.filter((p) => p.category === cat);
  const importCsv = (file) => run(async () => {
    const csv = await file.text();
    const r = await post('/api/settings/procedures/import', { csv });
    up({ procedures: r.procedures }); // merge the imported catalogue only; any other unsaved edits on this page are kept
    setImportReport(r);
  }, 'Procedures imported');
  return (
    <div className="col gap-16">
      <Card title={<span className="row gap-6"><IconLock size={16} />Fee policy</span>}>
        <Body className="col">
          <div className="small muted">This decides how much room a dentist has when they recommend treatment during a visit. It applies to every procedure below.</div>
          <div className="row wrap gap-6">
            {[['fixed', 'Fixed the price below is used, always'], ['range', 'Range the dentist may quote between the min and max fee'], ['flexible', 'Flexible the dentist may quote any fee, with a note']].map(([v, l]) => (
              <button key={v} className={`btn ${fees.mode === v ? 'primary' : ''}`} onClick={() => setFees({ mode: v })}>{l}</button>
            ))}
          </div>
          <label className="check small"><input type="checkbox" checked={fees.allowCustom !== false} onChange={(e) => setFees({ allowCustom: e.target.checked })} />Dentists may add a procedure that is not in this list (with a note and a fee)</label>
          <label className="check small"><input type="checkbox" checked={fees.noteOnChange !== false} onChange={(e) => setFees({ noteOnChange: e.target.checked })} />Require a short note whenever a fee is changed from the catalogue price</label>
          <label className="check small"><input type="checkbox" checked={fees.quoteToPatients !== false} onChange={(e) => setFees({ quoteToPatients: e.target.checked })} />Let the AI front desk quote these fees to patients who ask how much something costs</label>
          <Field label="Note shown with any AI quote"><input className="input" value={fees.quoteNote || ''} onChange={(e) => setFees({ quoteNote: e.target.value })} /></Field>
        </Body>
      </Card>
      <Card title="Procedures & fees" actions={<div className="row gap-6">
        <select className="input sm" style={{ width: 160 }} value={cat} onChange={(e) => setCat(e.target.value)}><option value="all">All categories</option>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <button className="btn sm" disabled={busy} onClick={() => run(() => downloadFile('/api/settings/procedures/export.csv'))}><IconDownload size={14} />Export CSV</button>
        <label className="btn sm"><IconUpload size={14} />Import CSV<input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = ''; }} /></label>
        <button className="btn sm" onClick={() => up({ procedures: [...procs, { id: `pr_new_${Date.now().toString(36)}`, name: 'New procedure', category: cat === 'all' ? 'General' : cat, fee: 0, minFee: '', maxFee: '', durationMin: 30, keywords: [], aftercareId: null, quote: true, active: true }] })}><IconPlus size={14} />Add procedure</button>
      </div>}>
        {importReport && <div className={`callout small ${importReport.errors.length ? 'warn' : 'good'}`} style={{ margin: '12px 16px 0' }}>
          Imported: {importReport.created} added, {importReport.updated} updated{importReport.errors.length ? `, ${importReport.errors.length} skipped` : ''}.
          {importReport.errors.length > 0 && <div className="tiny mt-8">{importReport.errors.slice(0, 5).join(' · ')}{importReport.errors.length > 5 ? ` · +${importReport.errors.length - 5} more` : ''}</div>}
          <div className="tiny muted mt-8">Remember to click <b>Save changes</b> at the top to keep this.</div>
        </div>}
        <div className="tiny muted" style={{ padding: '12px 16px 0' }}>Export to edit fees for many procedures at once in a spreadsheet, then import the file back. Import matches rows by id, then by name; anything new is added. Columns: id, name, category, fee, minFee, maxFee, durationMin, keywords, aftercareId, quote, active.</div>
        <table className="table">
          <thead><tr><th>Procedure</th><th>Category</th><th>{fees.mode === 'fixed' ? 'Fee' : 'Fee (default)'}</th>{fees.mode !== 'fixed' && <><th>Min</th><th>Max</th></>}<th>Minutes</th><th>Words patients use</th><th /></tr></thead>
          <tbody>
            {procs.map((p, i) => { if (cat !== 'all' && p.category !== cat) return null; return (
              <tr key={p.id}>
                <td><input className="input" style={{ minWidth: 200 }} value={p.name} onChange={(e) => list('procedures', i, { name: e.target.value })} /></td>
                <td><select className="input" style={{ width: 140 }} value={p.category} onChange={(e) => list('procedures', i, { category: e.target.value })}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></td>
                <td><div className="row gap-4"><span className="tiny muted">{sym}</span><input className="input" type="number" style={{ width: 90 }} value={p.fee} onChange={(e) => list('procedures', i, { fee: Number(e.target.value) })} /></div></td>
                {fees.mode !== 'fixed' && <>
                  <td><input className="input" type="number" style={{ width: 80 }} value={p.minFee ?? ''} onChange={(e) => list('procedures', i, { minFee: e.target.value === '' ? '' : Number(e.target.value) })} /></td>
                  <td><input className="input" type="number" style={{ width: 80 }} value={p.maxFee ?? ''} onChange={(e) => list('procedures', i, { maxFee: e.target.value === '' ? '' : Number(e.target.value) })} /></td>
                </>}
                <td><input className="input" type="number" style={{ width: 70 }} value={p.durationMin} onChange={(e) => list('procedures', i, { durationMin: Number(e.target.value) })} /></td>
                <td><input className="input" style={{ minWidth: 180 }} value={(p.keywords || []).join(', ')} onChange={(e) => list('procedures', i, { keywords: e.target.value.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean) })} /></td>
                <td><button className="btn sm ghost icon" onClick={() => remove('procedures', i)}><IconTrash size={14} /></button></td>
              </tr>
            ); })}
          </tbody>
        </table>
        {shown.length === 0 && <Empty>No procedures in this category yet.</Empty>}
      </Card>
      <div className="tiny muted">Dentists pick from this list when they finish a visit. Fees shown here also drive the AI front desk price answers and what the front desk quotes at the counter.</div>
    </div>
  );
}

/** Virtual assistant that answers calls, mainly after hours: enable it, decide when it answers, and try a call in any language. */
function AssistantTab({ s, up }) {
  const assistant = s.assistant || { enabled: true, answerWhen: 'closed', takeNotes: true };
  const setAssistant = (patchObj) => up({ assistant: { ...assistant, ...patchObj } });
  const [langs, setLangs] = useState(null);
  useEffect(() => { get('/api/calls/languages').then(setLangs).catch(() => {}); }, []);
  return (
    <div className="grid two">
      <Card title={<span className="row gap-6"><IconPhoneCall size={16} />Virtual assistant for calls</span>}>
        <Body className="col">
          <div className="small muted">Answers the phone, mainly after hours and at night: books, reschedules, cancels, and shares hours, address and fees. It never gives clinical advice, any symptom, medicine or diagnosis question is written down for the dentist, with the emergency line read out when needed.</div>
          <label className="check small"><input type="checkbox" checked={assistant.enabled !== false} onChange={(e) => setAssistant({ enabled: e.target.checked })} />Turn on the virtual assistant</label>
          <Field label="Answers calls"><select className="input" value={assistant.answerWhen || 'closed'} onChange={(e) => setAssistant({ answerWhen: e.target.value })} disabled={!assistant.enabled}><option value="closed">Only when the clinic is closed (after hours, nights, Sundays)</option><option value="always">Any time nobody at the front desk picks up</option></select></Field>
          <label className="check small"><input type="checkbox" checked={assistant.takeNotes !== false} onChange={(e) => setAssistant({ takeNotes: e.target.checked })} disabled={!assistant.enabled} />Write a summary and add a callback for anything it cannot finish</label>
          <div className="callout small">Connect your phone system to <span className="mono">POST /api/calls</span> to start a call, <span className="mono">/api/calls/:id/messages</span> for each caller turn, and <span className="mono">/api/calls/:id/end</span> to finish, the same shape as a WhatsApp message, so the booking rules are identical.</div>
        </Body>
      </Card>
      <Card title={<span className="row gap-6"><IconLanguage size={16} />Languages</span>}>
        <Body className="col">
          <div className="small muted">The assistant recognises the caller's language automatically, by script, or from common words when they type in Roman letters (Hinglish, Kanglish, Tanglish and similar). It replies in that language.</div>
          <div className="tag-list">{(langs || []).map((l) => <span key={l.code} className="pill outline">{l.native !== l.name ? `${l.name} (${l.native})` : l.name}</span>)}</div>
          {!langs && <div className="skeleton" style={{ height: 60 }} />}
          <div className="tiny muted">All 22 scheduled languages of India plus English are covered. A language without a built-in phrase set falls back to Hindi and English until Claude is connected, which then replies fluently in the caller's own language.</div>
        </Body>
      </Card>
      <TryACall enabled={assistant.enabled !== false} />
    </div>
  );
}

function TryACall({ enabled }) {
  const [call, setCall] = useState(null);
  const [transcript, setTranscript] = useState([]);
  const [text, setText] = useState('');
  const [phone, setPhone] = useState('98450 11002');
  const [run, busy] = useAction();
  const start = () => run(async () => {
    const r = await post('/api/calls', { phone, contactName: 'Test caller' });
    setCall(r.call); setTranscript([{ from: 'assistant', text: r.say }]);
  });
  const send = () => { if (!text.trim() || !call) return; const t = text; setText(''); run(async () => { setTranscript((x) => [...x, { from: 'caller', text: t }]); const r = await post(`/api/calls/${call.id}/messages`, { text: t }); setTranscript((x) => [...x, { from: 'assistant', text: r.say }]); }); };
  const end = () => run(async () => { const r = await post(`/api/calls/${call.id}/end`, {}); setTranscript((x) => [...x, { from: 'assistant', text: r.say }]); setCall(null); });
  return (
    <Card title={<span className="row gap-6"><IconPlayerPlay size={16} />Try a call</span>}>
      <Body className="col">
        <div className="small muted">Type as a patient calling in any language, Hindi, Kannada, Tamil, Hinglish, whatever your patients actually use, and see exactly what the assistant would say, including when it hands something to the dentist.</div>
        {!call ? (
          <div className="row"><input className="input" style={{ maxWidth: 220 }} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Caller's mobile" /><button className="btn primary" disabled={!enabled || busy} onClick={start}><IconPhoneCall size={16} />Start a test call</button>{!enabled && <span className="tiny muted">Turn the assistant on first.</span>}</div>
        ) : (
          <>
            <div className="list card soft" style={{ maxHeight: 260, overflowY: 'auto' }}>
              {transcript.map((t, i) => <div className="list-item" key={i} style={{ padding: '6px 12px' }}><span className={`pill ${t.from === 'assistant' ? 'accent' : 'outline'}`} style={{ minWidth: 70, textAlign: 'center' }}>{t.from === 'assistant' ? 'Assistant' : 'Caller'}</span><span className="small">{t.text}</span></div>)}
            </div>
            <div className="row"><input className="input" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="e.g. mujhe kal cleaning ke liye appointment chahiye" autoFocus /><button className="btn primary" disabled={busy || !text.trim()} onClick={send}><IconSend size={16} /></button><button className="btn ghost" disabled={busy} onClick={end}>End call</button></div>
          </>
        )}
      </Body>
    </Card>
  );
}

const LIVE_ROWS = [
  ['email', 'Email', 'Verification codes, password resets and team invitations', 'Set RESEND_API_KEY and MAIL_FROM on the server'],
  ['sms', 'SMS', 'Phone verification and SMS reminders', 'Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM on the server'],
  ['whatsapp', 'WhatsApp', 'Reminders, recalls and replies to patients', 'Set WHATSAPP_TOKEN and WHATSAPP_PHONE_ID on the server'],
  ['ai', 'Claude AI', 'Patient chat, marketing drafts and the staff assistant understand free-form questions (a rule engine runs without it)', 'Set ANTHROPIC_API_KEY on the server'],
];
/** Which connections are live, and exactly what turns the others on. */
function StatusBoard({ status, cfg }) {
  if (!status) return <div className="skeleton" />;
  const o = status.outbox;
  return (
    <Card title="Connections"><Body className="col gap-8">
      {LIVE_ROWS.map(([k, name, what, how]) => <div className="review-row" key={k}>
        <span className={`review-dot ${status.server[k] ? 'ok' : ''}`}>{status.server[k] ? '✓' : '–'}</span>
        <div className="grow"><div className="small strong">{name} <Pill tone={status.server[k] ? 'good' : 'warn'}>{status.server[k] ? 'Live' : 'Not connected'}</Pill></div><div className="tiny muted">{what}{status.server[k] ? '' : `. ${how}.`}</div></div>
      </div>)}
      <div className="review-row"><span className={`review-dot ${status.clinic.googleReview ? 'ok' : ''}`}>{status.clinic.googleReview ? '✓' : '–'}</span><div className="grow"><div className="small strong">Google reviews <Pill tone={status.clinic.googleReview ? 'good' : 'warn'}>{status.clinic.googleReview ? 'Link added' : 'No link yet'}</Pill></div><div className="tiny muted">Thank-you messages ask happy patients for a review. {status.clinic.googleReview ? '' : 'Add your Google review link under Marketing.'}</div></div></div>
      <div className="review-row"><span className={`review-dot ${status.clinic.webhooks ? 'ok' : ''}`}>{status.clinic.webhooks ? '✓' : '–'}</span><div className="grow"><div className="small strong">Webhooks <Pill tone={status.clinic.webhooks ? 'good' : 'outline'}>{status.clinic.webhooks ? `${status.clinic.webhooks} active` : 'None'}</Pill></div><div className="tiny muted">Send events to billing, analytics or automation tools such as Zapier. Add one below.</div></div></div>
      {(o.simulated > 0 || o.failed > 0) && <div className="callout small">{o.sent} messages delivered, {o.simulated} waiting in the outbox because no WhatsApp or SMS provider is connected{o.failed ? `, ${o.failed} failed` : ''}.</div>}
    </Body></Card>
  );
}

/** Email and AI: what is connected on this server, how to connect it, and a real test for email. */
function ConnectCards({ status }) {
  const [run, busy] = useAction();
  const [to, setTo] = useState('');
  const email = !!status?.server?.email; const ai = !!status?.server?.ai;
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to);
  return (
    <div className="grid two">
      <Card title="Email" actions={<span className={`pill ${email ? 'good' : 'warn'}`}>{email ? 'Connected' : 'Not connected'}</span>}>
        <Body className="col gap-12">
          <div className="small muted">{email
            ? <>Verification codes, demo confirmations and receipts are sent through Resend from <b>{status.mailFrom}</b>.</>
            : <>Email goes through Resend. On the server, open <span className="mono">backend/.env</span>, set <span className="mono">RESEND_API_KEY</span> and <span className="mono">MAIL_FROM</span> (an address on a domain you verified in Resend), then restart. Until then, codes are shown on screen in test builds and nothing is emailed.</>}</div>
          <div className="row gap-6"><input className="input" type="email" placeholder="you@clinic.com" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Send a test email to" /><button className="btn" disabled={busy || !valid} onClick={() => run(async () => { await post('/api/integrations/email/test', { to }); }, `Test email sent to ${to}`)}>Send test email</button></div>
          {!email && <div className="tiny muted">The test will tell you email is not connected until the two keys are set.</div>}
        </Body>
      </Card>
      <Card title="AI assistant" actions={<span className={`pill ${ai ? 'good' : 'outline'}`}>{ai ? 'Claude connected' : 'Rule engine'}</span>}>
        <Body className="col gap-12">
          <div className="small muted">{ai
            ? 'The front desk chat, the call assistant and marketing drafts are answered by Claude, with your fees, hours and escalation rules applied on the server.'
            : <>The front desk chat, call assistant and marketing drafts are running on the built-in rule engine. To use Claude, open <span className="mono">backend/.env</span> on the server, paste your key after <span className="mono">ANTHROPIC_API_KEY=</span> and restart. Nothing else changes.</>}</div>
          <div className="tiny muted">Keys stay in the server environment. They are never stored in clinic settings or sent to the browser.</div>
        </Body>
      </Card>
    </div>
  );
}

/** Clinic logo, colour and kiosk welcome line. Saves on its own button and shows the result on every patient screen. */
function BrandingTab({ s, up, slug }) {
  const toast = useToast();
  const [run, busy] = useAction();
  const saved = { ...DEFAULT_BRAND, ...(s.branding || {}) };
  const [b, setB] = useState(saved);
  const [fromLogo, setFromLogo] = useState([]);
  const [over, setOver] = useState(false);
  const [err, setErr] = useState('');
  const [view, setView] = useState('kiosk');
  useEffect(() => { if (b.logo) logoColors(b.logo).then(setFromLogo); else setFromLogo([]); }, [b.logo]);
  const dirty = JSON.stringify(b) !== JSON.stringify(saved);
  const set = (p) => setB((x) => ({ ...x, ...p }));
  const pick = async (file) => { if (!file) return; setErr(''); try { set({ logo: await fileToLogo(file) }); } catch (e) { setErr(e.message); } };
  const save = () => run(async () => { const next = await put('/api/settings', { branding: b }); up({ branding: next.branding }); setB({ ...DEFAULT_BRAND, ...next.branding }); window.dispatchEvent(new CustomEvent('clinovara:branding', { detail: next.branding })); }, 'Branding saved. Patient screens now use it.');
  const name = s.practice?.name || 'Your clinic';
  const q = slug ? `?t=${slug}` : '';
  const light = !readableOnWhite(b.color);
  return (
    <div className="brand-page">
      <div className="col gap-16">
        <Card title="Clinic logo">
          <Body className="col gap-12">
            <label className={`brand-zone ${over ? 'over' : ''} ${b.logo ? 'has' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files?.[0]); }}>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
              {b.logo ? <img src={b.logo} alt="Clinic logo" /> : <span className="brand-mono" style={{ width: 64, height: 64, fontSize: 24, background: b.color }}>{monogram(name)}</span>}
              <span className="txt"><b>{b.logo ? 'Replace logo' : 'Upload your logo'}</b><span>Drag an image here or click to choose. PNG, JPG, WebP or SVG.</span></span>
            </label>
            {err && <div className="callout bad small">{err}</div>}
            {b.logo ? (
              <div className="row between wrap gap-8">
                <div className="brand-on"><span className="on white"><img src={b.logo} alt="" /></span><span className="on dark"><img src={b.logo} alt="" /></span><span className="on tint" style={{ background: b.color }}><img src={b.logo} alt="" /></span></div>
                <button className="btn sm ghost" onClick={() => set({ logo: '' })}>Remove logo</button>
              </div>
            ) : <div className="tiny muted">Until you add a logo, patients see your initials ({monogram(name)}) in your brand colour.</div>}
            {b.logo && <div className="tiny muted">Checked on white, dark and your brand colour. If it disappears on one of them, upload a version with a solid background.</div>}
          </Body>
        </Card>

        <Card title="Brand colour">
          <Body className="col gap-12">
            {fromLogo.length > 0 && <div><div className="field-label">From your logo</div><div className="brand-swatches mt-8">{fromLogo.map((c) => <button key={c} type="button" aria-label={`Use ${c}`} title={c} className={b.color === c ? 'on' : ''} style={{ background: c }} onClick={() => set({ color: c })} />)}</div></div>}
            <div><div className="field-label">Presets</div><div className="brand-swatches mt-8">
              {BRAND_PRESETS.map(([c, label]) => <button key={c} type="button" title={label} aria-label={label} className={b.color === c ? 'on' : ''} style={{ background: c }} onClick={() => set({ color: c })} />)}
              <label className="brand-custom" title="Pick any colour"><input type="color" value={b.color} onChange={(e) => set({ color: e.target.value })} /><span className="mono tiny">{b.color}</span></label>
            </div></div>
            {light && <div className="callout small">This colour is light, so white text on buttons will be hard to read. Pick a darker shade.</div>}
          </Body>
        </Card>

        <Card title="Kiosk welcome line">
          <Body><Field label="Shown under your logo on the kiosk" hint="Optional. Leave blank to use the standard welcome in the patient’s language."><input className="input" maxLength={120} value={b.welcome} onChange={(e) => set({ welcome: e.target.value })} placeholder={`Welcome to ${name}`} /></Field></Body>
        </Card>

        <div className="brand-save">
          <span className="small muted">{dirty ? 'You have unsaved branding changes.' : 'Branding is saved.'}</span>
          <div className="row gap-8">{dirty && <button className="btn ghost" disabled={busy} onClick={() => { setB(saved); setErr(''); }}>Discard</button>}<button className="btn primary" disabled={busy || !dirty || light} onClick={save}>{busy ? 'Saving…' : 'Save branding'}</button></div>
        </div>
      </div>

      <div className="col gap-16">
        <Card title="Preview" actions={<Seg value={view} onChange={setView} options={[{ value: 'kiosk', label: 'Kiosk' }, { value: 'chat', label: 'Patient chat' }, { value: 'board', label: 'Display' }, { value: 'receipt', label: 'Receipt' }]} />}>
          <Body>
            <div className="brand-stage" style={brandVars(b)}>
              {view === 'kiosk' && <div className="bp-kiosk big">
                <BrandLogo branding={b} name={name} size={64} />
                <div className="bp-title">{b.welcome || 'Welcome. Let’s get you checked in.'}</div>
                <div className="bp-langs"><span className="on">English</span><span>हिन्दी</span><span>ಕನ್ನಡ</span></div>
                <span className="bp-btn wide">Check in</span>
              </div>}
              {view === 'chat' && <div className="bp-chat">
                <div className="bp-head"><BrandLogo branding={b} name={name} size={28} /><span>{name}</span></div>
                <div className="bp-msg them">Can I book a cleaning for Saturday?</div>
                <div className="bp-msg us">Yes. Saturday 9:00 am is free. Shall I book it?</div>
                <div className="bp-msg them">Yes please</div>
              </div>}
              {view === 'board' && <div className="bp-board">
                <div className="row gap-8"><BrandLogo branding={b} name={name} size={30} className="on-dark" /><b>{name}</b></div>
                <div className="bp-token"><span>Now calling</span><b>A02</b></div>
                <div className="bp-next"><span>Next</span><i>A03</i><i>A04</i><i>A05</i></div>
              </div>}
              {view === 'receipt' && <div className="bp-receipt">
                <BrandLogo branding={b} name={name} size={40} /><b>{name}</b>
                <div className="row between small"><span>Receipt SC/26-27/0042</span><span>Today</span></div>
                <div className="row between small"><span>Cleaning and check-up</span><b>₹1,500</b></div>
                <div className="tiny muted">Paid by UPI. Thank you.</div>
              </div>}
            </div>
          </Body>
        </Card>
        <Card title="Where patients see it">
          <div className="list">
            {[['Kiosk check-in', `#/kiosk${q}`], ['Waiting-room display', `#/board${q}`], ['Patient chat', `#/patient${q}`], ['Clinic website and booking', `#/site${q}`]].map(([label, to]) => (
              <a key={label} className="list-item clickable" href={to} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}><IconCheck size={15} style={{ color: 'var(--good)' }} /><span className="grow small">{label}</span><span className="tiny muted">Open</span></a>))}
            {['Pre-visit forms sent to patients', 'Printed and WhatsApp receipts', 'The sidebar of this app'].map((label) => <div key={label} className="list-item"><IconCheck size={15} style={{ color: 'var(--good)' }} /><span className="grow small">{label}</span></div>)}
          </div>
        </Card>
      </div>
    </div>
  );
}

/** Phone voice assistant: choose the provider, see which keys the server has, and copy the addresses the call bridge uses. */
function VoiceCard() {
  const [v, setV] = useState(null);
  const [run, busy] = useAction();
  const toast = useToast();
  useEffect(() => { get('/api/voice/status').then(setV).catch(() => setV(false)); }, []);
  if (v === null) return <div className="skeleton" />;
  if (v === false) return null;
  const s = v.settings;
  const save = (p) => run(async () => setV(await put('/api/voice/settings', p)), 'Phone assistant settings saved');
  const chosen = v.providers.find((p) => p.id === s.provider);
  return (
    <Card title="Phone voice assistant" actions={<span className={`pill ${v.ready ? 'good' : s.provider === 'none' ? 'outline' : 'warn'}`}>{v.ready ? 'Ready for calls' : s.provider === 'none' ? 'Not connected' : 'Setup incomplete'}</span>}>
      <Body className="col gap-12">
        <div className="small muted">Answers phone calls in the caller’s language and books into your real diary, using the same rules as WhatsApp and web chat. It never gives medical advice: clinical questions become a callback for your team.</div>
        <div className="grid two">
          <Field label="Voice provider" hint={chosen?.mode === 'speech' ? 'The model hears and speaks directly. Lowest delay, one vendor for voice.' : chosen?.mode === 'text' ? 'Speech is turned into text, Claude answers, and a separate voice speaks. More parts, more control over the voice.' : 'Choose one to see what it needs.'}>
            <select className="input" value={s.provider} disabled={busy} onChange={(e) => save({ provider: e.target.value })}>{v.providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
          </Field>
          <Field label="Clinic phone number for the assistant" hint="The number you bought from your phone carrier."><input className="input" defaultValue={s.number} placeholder="+91 80 4123 4567" onBlur={(e) => e.target.value !== s.number && save({ number: e.target.value })} /></Field>
        </div>
        {s.provider !== 'none' && (<>
          <div>
            <div className="field-label">Keys on this server</div>
            <div className="row gap-6 wrap mt-8">{[...(chosen?.needs || []), 'EXOTEL_SID', 'EXOTEL_API_KEY', 'EXOTEL_API_TOKEN', 'VOICE_WEBHOOK_SECRET'].map((k) => <span key={k} className={`pill ${v.keys[k] ? 'good' : 'warn'}`}>{v.keys[k] ? 'Set' : 'Missing'} · <span className="mono">{k}</span></span>)}</div>
            {v.missing.length > 0 && <div className="tiny muted mt-8">Add the missing keys to <span className="mono">backend/.env</span> on the server and restart. Keys are never stored in clinic settings or sent to the browser.</div>}
          </div>
          <div>
            <div className="field-label">Addresses for the call bridge</div>
            <div className="list card soft mt-8">{Object.entries(v.webhooks).map(([k, url]) => <div key={k} className="list-item" style={{ padding: '8px 12px' }}><span className="small strong" style={{ width: 80 }}>{k}</span><span className="tiny mono muted grow" style={{ wordBreak: 'break-all' }}>{url}</span><button className="btn sm ghost" onClick={() => { navigator.clipboard?.writeText(url); toast('Copied'); }}>Copy</button></div>)}</div>
            <div className="tiny muted mt-8">The bridge is the small service that carries the call audio between your carrier and the voice model. It sends the <span className="mono">x-voice-secret</span> header with every request.</div>
          </div>
          <label className="check"><input type="checkbox" checked={!!s.enabled} disabled={busy} onChange={(e) => save({ enabled: e.target.checked })} />Answer phone calls with the assistant</label>
          {s.enabled && !v.ready && <div className="callout small">Switched on, but not ready: {v.missing.length} {v.missing.length === 1 ? 'key is' : 'keys are'} missing. Calls will not be answered until they are set.</div>}
        </>)}
      </Body>
    </Card>
  );
}

/** What each role can reach. Read from the server, so it always matches what is actually enforced. */
function RolesMatrix() {
  const [m, setM] = useState(null);
  useEffect(() => { get('/api/auth/permissions').then(setM).catch(() => setM(false)); }, []);
  if (!m) return null;
  return (
    <Card title="Roles and permissions">
      <Body><div className="small muted">Each login has one role. These limits are enforced on the server, so hiding a menu item is never the only protection. Anything not listed here is available to every member of staff.</div></Body>
      <div style={{ overflowX: 'auto' }}><table className="table">
        <thead><tr><th>Area</th>{m.roles.map((r) => <th key={r.id} style={{ textAlign: 'center' }}>{r.label}</th>)}</tr></thead>
        <tbody>{m.matrix.map((row) => <tr key={row.area}><td><span className="small strong">{row.area}</span>{row.access === 'change' && <span className="tiny muted"> (changes only)</span>}</td>{m.roles.map((r) => <td key={r.id} style={{ textAlign: 'center' }}>{row.roles.includes(r.id) ? <IconCheck size={16} style={{ color: 'var(--good)' }} aria-label="Allowed" /> : <span className="muted" aria-label="Not allowed">No</span>}</td>)}</tr>)}</tbody>
      </table></div>
    </Card>
  );
}
