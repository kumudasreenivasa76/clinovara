import Logo from '../components/Logo.jsx';
import { brandVars, BrandLogo } from '../lib/brand.jsx';
import React, { useEffect, useState } from 'react';
import { IconCheck, IconChevronRight, IconDental } from '@tabler/icons-react';
import { get, put, post } from '../lib/api.js';
import { fmtWhen } from '../lib/format.js';
import { Card, Body, Field, Steps, useAction, Pill, Seg } from '../components/ui.jsx';
import { t, optionPairs, sectionTitle, LANGS } from '../lib/i18n.js';


/** Reusable section form. `large` is used by the kiosk; `staff` hides the patient-only wording. `lang` selects the labels. */
export function SectionForm({ sectionKey, initial = {}, onSave, consentText, large, staff, saving, lang = 'en', insuranceOptions = [] }) {
  const [d, setD] = useState(initial);
  useEffect(() => setD(initial), [sectionKey]); // eslint-disable-line
  const set = (k, v) => setD({ ...d, [k]: v });
  const T = (k, vars) => t(lang, k, vars);
  const Yn = ({ k, pairs }) => <div className="row wrap gap-6">{pairs.map((o) => <button key={o.value} type="button" className={`btn ${large ? '' : 'sm'} ${d[k] === o.value ? 'primary' : ''}`} onClick={() => set(k, o.value)}>{o.label}</button>)}</div>;
  const yn = [{ value: 'no', label: T('no') }, { value: 'yes', label: T('yes') }];
  let body = null; let valid = true;
  if (sectionKey === 'medicalHistory') body = (<>
    <Field label={T('fMedTitle')}><div className={large ? 'option-grid' : 'tag-list'}>{optionPairs(lang, 'conditions').map((c) => { const on = (d.conditions || []).includes(c.value); return <button type="button" key={c.value} className={large ? `option ${on ? 'selected' : ''}` : `btn sm ${on ? 'primary' : ''}`} onClick={() => set('conditions', on ? d.conditions.filter((x) => x !== c.value) : [...(d.conditions || []), c.value])}>{c.label}</button>; })}</div></Field>
    <Field label={T('fSurg')}><input className="input" value={d.surgeries || ''} onChange={(e) => set('surgeries', e.target.value)} placeholder={T('none')} /></Field>
    <Field label={T('fSmoke')}><Yn k="smoker" pairs={[...yn, { value: 'former', label: T('former') }]} /></Field>
    <Field label={T('fPreg')}><Yn k="pregnant" pairs={[...yn, { value: 'not applicable', label: T('na') }]} /></Field>
    <Field label={T('fNotes')}><textarea className="input" value={d.notes || ''} onChange={(e) => set('notes', e.target.value)} /></Field>
  </>);
  if (sectionKey === 'dentalConcerns') body = (<>
    <Field label={T('fConcern')}><textarea className="input" value={d.concerns || ''} onChange={(e) => set('concerns', e.target.value)} placeholder={T('fConcernPh')} /></Field>
    <Field label={T('fLastClean')}><Yn k="lastCleaning" pairs={optionPairs(lang, 'lastCleanOpts')} /></Field>
    <Field label={T('fAnx')}><Yn k="anxiety" pairs={optionPairs(lang, 'anxOpts')} /></Field>
    <Field label={T('fBleed')}><Yn k="bleedingGums" pairs={optionPairs(lang, 'bleedOpts')} /></Field>
  </>);
  if (sectionKey === 'medications') body = (<>
    <Field label={T('fMeds')} hint={T('fMedsHint')}><textarea className="input" value={d.list || ''} onChange={(e) => set('list', e.target.value)} placeholder="e.g. Telmisartan 40mg daily" /></Field>
    <Field label={T('fThinners')}><Yn k="bloodThinners" pairs={yn} /></Field>
  </>);
  if (sectionKey === 'allergies') body = (<>
    <Field label={T('fAllergy')} hint={T('fAllergyHint')}><textarea className="input" value={d.list || ''} onChange={(e) => set('list', e.target.value)} placeholder="e.g. Penicillin" /></Field>
    <Field label={T('fLatex')}><Yn k="latex" pairs={yn} /></Field>
  </>);
  if (sectionKey === 'insurance') {
    const type = d.type || (d.selfPay ? 'self' : '');
    valid = type === 'self' || (type && d.carrier && d.memberId);
    const opts = insuranceOptions.length ? insuranceOptions : [{ id: 'private', label: 'Private insurer / TPA' }, { id: 'pmjay', label: 'Ayushman Bharat PM-JAY' }, { id: 'cghs', label: 'CGHS' }, { id: 'esic', label: 'ESIC' }, { id: 'corporate', label: 'Corporate plan' }, { id: 'self', label: 'Self-pay' }];
    body = (<>
      <Field label={T('fInsType')}><div className={large ? 'option-grid' : 'tag-list'}>{opts.map((o) => <button type="button" key={o.id} className={large ? `option ${type === o.id ? 'selected' : ''}` : `btn sm ${type === o.id ? 'primary' : ''}`} onClick={() => set('type', o.id)}>{o.label}{o.examples && large ? <div className="tiny muted" style={{ fontSize: '0.7em' }}>{o.examples}</div> : null}</button>)}</div></Field>
      {type && type !== 'self' && <div className="grid two">
        <Field label={T('insurer')}><input className="input" value={d.carrier || ''} onChange={(e) => set('carrier', e.target.value)} placeholder={opts.find((o) => o.id === type)?.examples?.split(',')[0] || ''} /></Field>
        <Field label={T('memberId')}><input className="input" value={d.memberId || ''} onChange={(e) => set('memberId', e.target.value)} /></Field>
        {type === 'private' && <Field label={T('fTpa')}><input className="input" value={d.tpa || ''} onChange={(e) => set('tpa', e.target.value)} placeholder="Medi Assist, Paramount…" /></Field>}
        {(type === 'private' || type === 'corporate') && <Field label={T('group')}><input className="input" value={d.groupNumber || ''} onChange={(e) => set('groupNumber', e.target.value)} /></Field>}
        <Field label={T('fSubscriber')}><input className="input" value={d.subscriberName || ''} onChange={(e) => set('subscriberName', e.target.value)} /></Field>
        <Field label={T('fSubDob')}><input className="input" type="date" value={d.subscriberDob || ''} onChange={(e) => set('subscriberDob', e.target.value)} /></Field>
      </div>}
      <div className="grid two">
        <Field label={T('abhaOpt')}><input className="input mono" value={d.abhaNumber || ''} onChange={(e) => set('abhaNumber', e.target.value)} placeholder="91-2345-6789-0123" /></Field>
        <Field label={T('fAbhaAddr')}><input className="input mono" value={d.abhaAddress || ''} onChange={(e) => set('abhaAddress', e.target.value)} placeholder="name@abdm" /></Field>
      </div>
    </>);
  }
  if (sectionKey === 'consent') { valid = !!(d.signature && d.signature.trim().length > 2 && d.agree); body = (<>
    <div className="callout" style={{ fontSize: large ? 18 : 13.5 }}>{consentText || 'I consent to dental examination and treatment as discussed with my dentist.'}</div>
    <label className="check"><input type="checkbox" checked={!!d.agree} onChange={(e) => set('agree', e.target.checked)} />{T('agree')}{staff ? ' (patient confirmed verbally or on paper)' : ''}</label>
    <label className="check"><input type="checkbox" checked={d.marketingOptIn !== false} onChange={(e) => set('marketingOptIn', e.target.checked)} />{T('marketingOptIn')}</label>
    <Field label={T('fSig')}><input className="input" value={d.signature || ''} onChange={(e) => set('signature', e.target.value)} style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: large ? 24 : 18 }} /></Field>
  </>); }
  return (
    <div className="col gap-16">
      {body}
      <div><button className="btn primary" disabled={!valid || saving} onClick={() => onSave({ ...d, ...(sectionKey === 'consent' ? { signedAt: new Date().toISOString(), lang } : {}), ...(sectionKey === 'insurance' && (d.type === 'self' || d.selfPay) ? { type: 'self', selfPay: true, carrier: 'Self-pay', memberId: '' } : {}) })}><IconCheck size={16} />{T('saveContinue')}</button></div>
    </div>
  );
}

/** Wording for the step-by-step patient form. The section questions themselves come from lib/i18n.js. */
const W = {
  en: { welcome: 'Welcome, {name}', sub: 'Please complete your details before your appointment.', appt: 'Your appointment', step: 'Step {a} of {b}', pct: '{n}% complete', back: 'Back', saved: 'Your progress is saved securely. You can return using your form link.',
    personal: 'Personal information', prefs: 'Communication preferences', review: 'Review and submit', fullName: 'First name', lastName: 'Last name', dob: 'Date of birth', mobile: 'Mobile number', email: 'Email address', language: 'Preferred language', optional: 'optional',
    reach: 'How should we contact you?', call: 'Phone call', remind: 'Send me reminders about this form and my appointment', bestTime: 'Best time to reach you', docs: 'Documents (optional)', docsHint: 'Attach up to 3 photos or PDFs, such as an earlier prescription or X-ray report. 2 MB each.', addFile: 'Add a file',
    reviewSub: 'Check each part. You can go back and change anything before you submit.', done: 'Done', todo: 'To do', edit: 'Edit', submit: 'Submit form', missing: 'Please complete the parts marked To do, then submit.',
    thanks: 'Thank you. Your form is submitted.', thanksSub: 'The clinic has your answers. Your dentist will go through them with you at your visit.', change: 'Review or change my answers', health: 'Tell us in your own words. Your dentist will go through this with you. This form does not give medical advice.', asked: 'The clinic asked for more information',
    expired: 'This link is no longer active', expiredSub: 'Please contact the clinic and they will send you a new one.', must: 'Please fill in your name, date of birth and mobile number.' },
  hi: { welcome: 'स्वागत है, {name}', sub: 'कृपया अपनी मुलाक़ात से पहले अपनी जानकारी भरें।', appt: 'आपकी मुलाक़ात', step: 'चरण {a} / {b}', pct: '{n}% पूरा', back: 'वापस', saved: 'आपकी जानकारी सुरक्षित रूप से सहेजी जाती है। इसी लिंक से आप बाद में जारी रख सकते हैं।',
    personal: 'व्यक्तिगत जानकारी', prefs: 'संपर्क की पसंद', review: 'जाँचें और जमा करें', fullName: 'पहला नाम', lastName: 'उपनाम', dob: 'जन्म तिथि', mobile: 'मोबाइल नंबर', email: 'ईमेल', language: 'पसंदीदा भाषा', optional: 'वैकल्पिक',
    reach: 'हम आपसे कैसे संपर्क करें?', call: 'फ़ोन कॉल', remind: 'मुझे इस फ़ॉर्म और मुलाक़ात की याद दिलाएँ', bestTime: 'संपर्क का सही समय', docs: 'दस्तावेज़ (वैकल्पिक)', docsHint: 'अधिकतम 3 फ़ोटो या PDF जोड़ें, जैसे पुराना पर्चा या एक्स-रे रिपोर्ट। हर फ़ाइल 2 MB तक।', addFile: 'फ़ाइल जोड़ें',
    reviewSub: 'हर भाग जाँच लें। जमा करने से पहले आप कुछ भी बदल सकते हैं।', done: 'पूरा', todo: 'बाकी', edit: 'बदलें', submit: 'फ़ॉर्म जमा करें', missing: 'कृपया "बाकी" वाले भाग पूरे करें, फिर जमा करें।',
    thanks: 'धन्यवाद। आपका फ़ॉर्म जमा हो गया है।', thanksSub: 'क्लिनिक को आपके जवाब मिल गए हैं। मुलाक़ात में आपके डॉक्टर इन्हें आपके साथ देखेंगे।', change: 'मेरे जवाब देखें या बदलें', health: 'अपने शब्दों में बताएँ। आपके डॉक्टर इसे आपके साथ देखेंगे। यह फ़ॉर्म चिकित्सा सलाह नहीं देता।', asked: 'क्लिनिक ने और जानकारी माँगी है',
    expired: 'यह लिंक अब सक्रिय नहीं है', expiredSub: 'कृपया क्लिनिक से संपर्क करें, वे नया लिंक भेज देंगे।', must: 'कृपया नाम, जन्म तिथि और मोबाइल नंबर भरें।' },
  kn: { welcome: 'ಸ್ವಾಗತ, {name}', sub: 'ದಯವಿಟ್ಟು ನಿಮ್ಮ ಭೇಟಿಗೆ ಮೊದಲು ವಿವರಗಳನ್ನು ಭರ್ತಿ ಮಾಡಿ.', appt: 'ನಿಮ್ಮ ಭೇಟಿ', step: 'ಹಂತ {a} / {b}', pct: '{n}% ಪೂರ್ಣ', back: 'ಹಿಂದೆ', saved: 'ನಿಮ್ಮ ಮಾಹಿತಿ ಸುರಕ್ಷಿತವಾಗಿ ಉಳಿಯುತ್ತದೆ. ಇದೇ ಲಿಂಕ್ ಮೂಲಕ ನಂತರ ಮುಂದುವರಿಸಬಹುದು.',
    personal: 'ವೈಯಕ್ತಿಕ ಮಾಹಿತಿ', prefs: 'ಸಂಪರ್ಕ ಆದ್ಯತೆಗಳು', review: 'ಪರಿಶೀಲಿಸಿ ಸಲ್ಲಿಸಿ', fullName: 'ಮೊದಲ ಹೆಸರು', lastName: 'ಕೊನೆಯ ಹೆಸರು', dob: 'ಹುಟ್ಟಿದ ದಿನಾಂಕ', mobile: 'ಮೊಬೈಲ್ ಸಂಖ್ಯೆ', email: 'ಇಮೇಲ್', language: 'ಆದ್ಯತೆಯ ಭಾಷೆ', optional: 'ಐಚ್ಛಿಕ',
    reach: 'ನಿಮ್ಮನ್ನು ಹೇಗೆ ಸಂಪರ್ಕಿಸಬೇಕು?', call: 'ಫೋನ್ ಕರೆ', remind: 'ಈ ಫಾರ್ಮ್ ಮತ್ತು ಭೇಟಿಯ ಬಗ್ಗೆ ನನಗೆ ನೆನಪಿಸಿ', bestTime: 'ಸಂಪರ್ಕಿಸಲು ಸೂಕ್ತ ಸಮಯ', docs: 'ದಾಖಲೆಗಳು (ಐಚ್ಛಿಕ)', docsHint: 'ಹಳೆಯ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಅಥವಾ ಎಕ್ಸ್-ರೇ ವರದಿಯಂತಹ 3 ಫೋಟೋ ಅಥವಾ PDF ವರೆಗೆ ಸೇರಿಸಿ. ಪ್ರತಿಯೊಂದು 2 MB ವರೆಗೆ.', addFile: 'ಫೈಲ್ ಸೇರಿಸಿ',
    reviewSub: 'ಪ್ರತಿ ಭಾಗವನ್ನು ಪರಿಶೀಲಿಸಿ. ಸಲ್ಲಿಸುವ ಮೊದಲು ಏನನ್ನಾದರೂ ಬದಲಾಯಿಸಬಹುದು.', done: 'ಮುಗಿದಿದೆ', todo: 'ಬಾಕಿ', edit: 'ಬದಲಿಸಿ', submit: 'ಫಾರ್ಮ್ ಸಲ್ಲಿಸಿ', missing: '"ಬಾಕಿ" ಇರುವ ಭಾಗಗಳನ್ನು ಪೂರ್ಣಗೊಳಿಸಿ, ನಂತರ ಸಲ್ಲಿಸಿ.',
    thanks: 'ಧನ್ಯವಾದಗಳು. ನಿಮ್ಮ ಫಾರ್ಮ್ ಸಲ್ಲಿಕೆಯಾಗಿದೆ.', thanksSub: 'ನಿಮ್ಮ ಉತ್ತರಗಳು ಕ್ಲಿನಿಕ್‌ಗೆ ತಲುಪಿವೆ. ಭೇಟಿಯಲ್ಲಿ ನಿಮ್ಮ ವೈದ್ಯರು ಇವುಗಳನ್ನು ನಿಮ್ಮೊಂದಿಗೆ ನೋಡುತ್ತಾರೆ.', change: 'ನನ್ನ ಉತ್ತರಗಳನ್ನು ನೋಡಿ ಅಥವಾ ಬದಲಿಸಿ', health: 'ನಿಮ್ಮದೇ ಮಾತಿನಲ್ಲಿ ತಿಳಿಸಿ. ನಿಮ್ಮ ವೈದ್ಯರು ಇದನ್ನು ನಿಮ್ಮೊಂದಿಗೆ ನೋಡುತ್ತಾರೆ. ಈ ಫಾರ್ಮ್ ವೈದ್ಯಕೀಯ ಸಲಹೆ ನೀಡುವುದಿಲ್ಲ.', asked: 'ಕ್ಲಿನಿಕ್ ಹೆಚ್ಚಿನ ಮಾಹಿತಿ ಕೇಳಿದೆ',
    expired: 'ಈ ಲಿಂಕ್ ಈಗ ಸಕ್ರಿಯವಾಗಿಲ್ಲ', expiredSub: 'ದಯವಿಟ್ಟು ಕ್ಲಿನಿಕ್ ಅನ್ನು ಸಂಪರ್ಕಿಸಿ, ಅವರು ಹೊಸ ಲಿಂಕ್ ಕಳುಹಿಸುತ್ತಾರೆ.', must: 'ದಯವಿಟ್ಟು ಹೆಸರು, ಹುಟ್ಟಿದ ದಿನಾಂಕ ಮತ್ತು ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ಭರ್ತಿ ಮಾಡಿ.' },
};
const HEALTH_STEPS = new Set(['medicalHistory', 'medications', 'allergies']);

/** The patient's link: one step at a time, saved as they go, with a review screen before they submit. */
export default function Forms({ token }) {
  const [pk, setPk] = useState(null);
  const [err, setErr] = useState(null);
  const [idx, setIdx] = useState(null);
  const [finished, setFinished] = useState(false);
  const [lang, setLang] = useState(() => { try { return localStorage.getItem('clinovara.lang') || 'en'; } catch { return 'en'; } });
  const [run, busy] = useAction();
  const T = (k, vars) => t(lang, k, vars);
  const w = (k, vars = {}) => String((W[lang] || W.en)[k] ?? W.en[k]).replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? '');
  const stepsOf = (p) => ['personal', 'dentalConcerns', 'medicalHistory', 'medications', 'allergies', 'insurance', 'preferences', ...(p.custom || []).map((c) => `custom:${c.id}`), 'consent', 'review'];
  const isDone = (p, s) => (s === 'personal' ? !!p.personal?.complete : s === 'preferences' ? !!p.preferences?.complete : s === 'review' ? !!p.intake?.submittedAt : s.startsWith('custom:') ? !!(p.custom || []).find((c) => `custom:${c.id}` === s)?.complete : !!p.sections[s]?.complete);
  const load = async () => { const p = await get(`/api/forms/token/${token}`); setPk(p); return p; };
  useEffect(() => { load().then((p) => { if (p.intake?.submittedAt) setFinished(true); const s = stepsOf(p); const first = s.findIndex((x) => !isDone(p, x)); setIdx(first < 0 ? s.length - 1 : first); if (p.personal?.data?.preferredLanguage && !localStorage.getItem('clinovara.lang')) setLang(p.personal.data.preferredLanguage); }).catch((e) => setErr(e)); }, [token]); // eslint-disable-line
  useEffect(() => { try { localStorage.setItem('clinovara.lang', lang); } catch { /* ignore */ } }, [lang]);
  if (err) return <div className="forms-page"><Card><Body><h2>{err.status === 410 ? w('expired') : 'This link is not valid'}</h2><p className="muted mt-8">{err.status === 410 ? w('expiredSub') : `${err.message}. Please contact the clinic for a new link.`}</p></Body></Card></div>;
  if (!pk || idx == null) return <div className="forms-page"><div className="skeleton" /></div>;

  const steps = stepsOf(pk); const cur = steps[idx];
  const titleOf = (s) => (s === 'personal' ? w('personal') : s === 'preferences' ? w('prefs') : s === 'review' ? w('review') : s.startsWith('custom:') ? pk.custom.find((c) => `custom:${c.id}` === s)?.name : sectionTitle(lang, s));
  const answerable = steps.filter((s) => s !== 'review');
  const percent = Math.round((answerable.filter((s) => isDone(pk, s)).length / answerable.length) * 100);
  const go = (n) => { setIdx(Math.max(0, Math.min(steps.length - 1, n))); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const saveThen = (fn) => run(async () => { await fn(); await load(); go(idx + 1); });
  const langs = pk.languages || LANGS;
  const openForm = cur.startsWith('custom:') ? pk.custom.find((c) => `custom:${c.id}` === cur) : null;
  const header = <div className="row between wrap"><div className="row"><BrandLogo branding={pk.branding} name={pk.practice.name} size={40} /><div><div className="strong">{pk.practice.name}</div><div className="tiny muted">{pk.practice.address} · {pk.practice.phone}</div></div></div><Seg value={lang} onChange={setLang} options={langs.map((l) => ({ value: l.code, label: l.name }))} /></div>;

  if (finished) return (
    <div className="forms-page" style={brandVars(pk.branding)}>{header}
      <Card><Body className="col" style={{ textAlign: 'center', padding: 36 }}><IconCheck size={40} style={{ color: 'var(--good)', margin: '0 auto' }} /><h1>{w('thanks')}</h1><p className="muted">{w('thanksSub')}</p>
        <div className="pf-appt" style={{ margin: '8px auto 0', textAlign: 'left' }}><div className="tiny muted">{w('appt')}</div><b>{fmtWhen(pk.appointment?.start)}</b><div className="small muted">{[pk.provider, pk.location].filter(Boolean).join(' · ')}</div></div>
        <div><button className="btn" onClick={() => { setFinished(false); go(steps.length - 1); }}>{w('change')}</button></div></Body></Card>
      <p className="tiny faint" style={{ textAlign: 'center' }}>{T('questions', { phone: pk.practice.phone })}</p>
    </div>);

  return (
    <div className="forms-page" style={brandVars(pk.branding)}>
      {header}
      {idx === 0 && <Card><Body className="col"><h1>{w('welcome', { name: pk.patient?.firstName || '' })}</h1><p className="muted">{w('sub')}</p>
        <div className="pf-appt"><div className="tiny muted">{w('appt')}</div><b>{fmtWhen(pk.appointment?.start)}</b><div className="small muted">{[pk.visitType, pk.provider, pk.location].filter(Boolean).join(' · ')}</div></div></Body></Card>}
      {pk.clarifications?.length > 0 && <div className="callout warn"><b>{w('asked')}</b>{pk.clarifications.map((c, i) => <div key={i} className="small mt-8">{c}</div>)}</div>}
      <div className="pf-progress"><div className="row between small"><b>{w('step', { a: idx + 1, b: steps.length })}</b><span className="muted">{w('pct', { n: percent })}</span></div><div className="iv-bar"><span style={{ width: `${percent}%` }} /></div></div>

      <Card title={titleOf(cur)}><Body>
        {HEALTH_STEPS.has(cur) && <div className="callout info small mb-16">{w('health')}</div>}
        {cur === 'personal' && <PersonalStep key={lang} w={w} langs={langs} initial={pk.personal?.data || {}} saving={busy} saveLabel={T('saveContinue')} onSave={(data) => saveThen(async () => { await put(`/api/forms/token/${token}/profile/personal`, { data }); if (data.preferredLanguage && langs.some((l) => l.code === data.preferredLanguage)) setLang(data.preferredLanguage); })} />}
        {cur === 'preferences' && <PreferencesStep w={w} token={token} initial={pk.preferences?.data || {}} files={pk.attachments || []} saving={busy} saveLabel={T('saveContinue')} onFiles={load} onSave={(data) => saveThen(() => put(`/api/forms/token/${token}/profile/preferences`, { data }))} />}
        {openForm && <CustomFields key={openForm.id} form={openForm} saving={busy} saveLabel={T('saveContinue')} onSave={(data) => saveThen(() => put(`/api/forms/token/${token}/custom/${openForm.id}`, { data }))} />}
        {pk.sections[cur] && (<>
          {pk.sections[cur]?.prefilled && <div className="callout info small mb-16">{T('prefilledNote')}</div>}
          <SectionForm key={cur + lang} lang={lang} sectionKey={cur} initial={pk.sections[cur]?.data || {}} consentText={pk.consentText} insuranceOptions={pk.insuranceOptions || []} saving={busy} onSave={(data) => saveThen(() => put(`/api/forms/token/${token}/sections/${cur}`, { data }))} />
        </>)}
        {cur === 'review' && (<div className="col gap-12">
          <p className="muted">{w('reviewSub')}</p>
          <div className="list">{answerable.map((s) => <div key={s} className="list-item clickable" onClick={() => go(steps.indexOf(s))}><div className="grow strong">{titleOf(s)}</div>{isDone(pk, s) ? <Pill tone="good"><IconCheck size={12} />{w('done')}</Pill> : <Pill tone="warn">{w('todo')}</Pill>}<span className="small" style={{ color: 'var(--accent)' }}>{w('edit')}</span><IconChevronRight size={16} className="faint" /></div>)}</div>
          {pk.missing.length + (pk.custom || []).filter((c) => !c.complete).length > 0 && <div className="callout warn small">{w('missing')}</div>}
          <div><button className="btn primary" disabled={busy || pk.missing.length + (pk.custom || []).filter((c) => !c.complete).length > 0} onClick={() => run(async () => { await post(`/api/forms/token/${token}/submit`); await load(); setFinished(true); window.scrollTo({ top: 0 }); })}><IconCheck size={16} />{w('submit')}</button></div>
        </div>)}
      </Body></Card>
      <div className="row between"><button className="btn ghost" disabled={idx === 0 || busy} onClick={() => go(idx - 1)}>{w('back')}</button><span className="tiny muted" style={{ textAlign: 'right', maxWidth: 360 }}>{w('saved')}</span></div>
      <p className="tiny faint" style={{ textAlign: 'center' }}>{T('questions', { phone: pk.practice.phone })}</p>
    </div>
  );
}

function PersonalStep({ w, langs, initial, onSave, saving, saveLabel }) {
  const [d, setD] = useState({ firstName: '', lastName: '', dob: '', phone: '', email: '', preferredLanguage: 'en', ...initial });
  const [err, setErr] = useState('');
  const set = (k, v) => { setD({ ...d, [k]: v }); setErr(''); };
  const submit = () => { if (!d.firstName.trim() || !d.dob || String(d.phone).replace(/\D/g, '').length < 10) { setErr(w('must')); return; } onSave(d); };
  const star = <span className="req"> *</span>;
  return (
    <div className="col gap-16">
      <div className="grid two">
        <Field label={<>{w('fullName')}{star}</>}><input className="input" autoComplete="given-name" value={d.firstName} onChange={(e) => set('firstName', e.target.value)} /></Field>
        <Field label={w('lastName')}><input className="input" autoComplete="family-name" value={d.lastName} onChange={(e) => set('lastName', e.target.value)} /></Field>
        <Field label={<>{w('dob')}{star}</>}><input className="input" type="date" autoComplete="bday" value={d.dob || ''} onChange={(e) => set('dob', e.target.value)} /></Field>
        <Field label={<>{w('mobile')}{star}</>}><input className="input" type="tel" inputMode="tel" autoComplete="tel" value={d.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label={`${w('email')} (${w('optional')})`}><input className="input" type="email" autoComplete="email" value={d.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label={w('language')}><select className="input" value={d.preferredLanguage} onChange={(e) => set('preferredLanguage', e.target.value)}>{langs.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select></Field>
      </div>
      {err && <div className="callout bad small">{err}</div>}
      <div><button className="btn primary" disabled={saving} onClick={submit}><IconCheck size={16} />{saveLabel}</button></div>
    </div>
  );
}

function PreferencesStep({ w, token, initial, files, onSave, onFiles, saving, saveLabel }) {
  const [d, setD] = useState({ channel: 'whatsapp', reminders: true, bestTime: '', ...initial });
  const [run, busy] = useAction();
  const add = (file) => { if (!file) return; const r = new FileReader(); r.onload = () => run(async () => { if (file.size > 2_000_000) throw new Error('That file is over 2 MB'); await post(`/api/forms/token/${token}/attachments`, { name: file.name, dataUrl: String(r.result) }); await onFiles(); }); r.readAsDataURL(file); };
  return (
    <div className="col gap-16">
      <div><div className="cf-label">{w('reach')}</div><div className="cf-choices wrap">{[['whatsapp', 'WhatsApp'], ['sms', 'SMS'], ['email', w('email')], ['call', w('call')]].map(([v, l]) => <button key={v} type="button" className={d.channel === v ? 'on' : ''} onClick={() => setD({ ...d, channel: v })}>{l}</button>)}</div></div>
      <label className="check"><input type="checkbox" checked={d.reminders !== false} onChange={(e) => setD({ ...d, reminders: e.target.checked })} />{w('remind')}</label>
      <Field label={`${w('bestTime')} (${w('optional')})`}><input className="input" value={d.bestTime || ''} maxLength={40} onChange={(e) => setD({ ...d, bestTime: e.target.value })} /></Field>
      <div><div className="cf-label">{w('docs')}</div><div className="tiny muted mb-8">{w('docsHint')}</div>
        {files.map((f) => <div key={f.id} className="small">{f.name} · {Math.max(1, Math.round(f.size / 1024))} KB</div>)}
        {files.length < 3 && <label className="btn sm mt-8" style={{ cursor: 'pointer' }}>{busy ? '…' : w('addFile')}<input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" style={{ display: 'none' }} onChange={(e) => { add(e.target.files?.[0]); e.target.value = ''; }} /></label>}
      </div>
      <div><button className="btn primary" disabled={saving} onClick={() => onSave(d)}><IconCheck size={16} />{saveLabel}</button></div>
    </div>
  );
}

/** Renders a clinic-written form: statements to read, yes/no, choices, text, dates, contact fields and a typed signature. */
export function CustomFields({ form, saving, onSave, saveLabel = 'Save', readOnly = false }) {
  const [v, setV] = useState(() => ({ ...(form.data || {}) }));
  const [err, setErr] = useState('');
  const set = (id, val) => { setV((x) => ({ ...x, [id]: val })); setErr(''); };
  const shown = form.fields.filter((f) => !f.showIf || v[f.showIf.fieldId] === f.showIf.equals);
  const picked = (id) => String(v[id] || '').split(',').map((x) => x.trim()).filter(Boolean);
  const submit = () => {
    const miss = shown.find((f) => f.type !== 'info' && f.required && !String(v[f.id] ?? '').trim());
    if (miss) { setErr(`Please answer: ${miss.label}`); return; }
    onSave(v);
  };
  return (
    <div className="cf">
      {shown.map((f) => (
        <div key={f.id} className={`cf-field ${f.type}`}>
          {f.type === 'info' ? <p className="cf-info">{f.label}</p> : <>
            <div className="cf-label">{f.label}{f.required && <span className="req" title="Required"> *</span>}</div>
            {f.type === 'yesno' && <div className="cf-choices">{[['yes', 'Yes'], ['no', 'No']].map(([val, l]) => <button key={val} type="button" disabled={readOnly} className={v[f.id] === val ? 'on' : ''} onClick={() => set(f.id, val)}>{l}</button>)}</div>}
            {f.type === 'choice' && <div className="cf-choices wrap">{f.options.map((o) => <button key={o} type="button" disabled={readOnly} className={v[f.id] === o ? 'on' : ''} onClick={() => set(f.id, o)}>{o}</button>)}</div>}
            {f.type === 'checkbox' && <div className="cf-choices wrap">{f.options.map((o) => { const on = picked(f.id).includes(o); return <button key={o} type="button" disabled={readOnly} aria-pressed={on} className={on ? 'on' : ''} onClick={() => set(f.id, (on ? picked(f.id).filter((x) => x !== o) : [...picked(f.id), o]).join(', '))}>{o}</button>; })}</div>}
            {f.type === 'text' && <input className="input" disabled={readOnly} value={v[f.id] || ''} onChange={(e) => set(f.id, e.target.value)} />}
            {f.type === 'phone' && <input className="input" type="tel" inputMode="tel" style={{ maxWidth: 260 }} disabled={readOnly} value={v[f.id] || ''} onChange={(e) => set(f.id, e.target.value)} />}
            {f.type === 'email' && <input className="input" type="email" style={{ maxWidth: 340 }} disabled={readOnly} value={v[f.id] || ''} onChange={(e) => set(f.id, e.target.value)} />}
            {f.type === 'textarea' && <textarea className="input" rows={3} disabled={readOnly} value={v[f.id] || ''} onChange={(e) => set(f.id, e.target.value)} />}
            {f.type === 'date' && <input className="input" type="date" style={{ maxWidth: 220 }} disabled={readOnly} value={v[f.id] || ''} onChange={(e) => set(f.id, e.target.value)} />}
            {f.type === 'signature' && <input className="input cf-sign" disabled={readOnly} placeholder="Type your full name to sign" value={v[f.id] || ''} onChange={(e) => set(f.id, e.target.value)} />}
          </>}
        </div>
      ))}
      {err && <div className="callout bad small">{err}</div>}
      {!readOnly && <button className="btn primary" disabled={saving} onClick={submit}>{saving ? 'Saving…' : saveLabel}</button>}
    </div>
  );
}
