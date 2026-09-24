import Logo from '../components/Logo.jsx';
import React, { useEffect, useState } from 'react';
import { IconCheck, IconChevronRight, IconDental } from '@tabler/icons-react';
import { get, put } from '../lib/api.js';
import { fmtWhen } from '../lib/format.js';
import { Card, Body, Field, Steps, useAction, Pill, Seg } from '../components/ui.jsx';
import { t, optionPairs, sectionTitle, LANGS } from '../lib/i18n.js';

const ORDER = ['medicalHistory', 'dentalConcerns', 'medications', 'allergies', 'insurance', 'consent'];

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

export default function Forms({ token }) {
  const [pk, setPk] = useState(null);
  const [err, setErr] = useState(null);
  const [current, setCurrent] = useState(null);
  const [lang, setLang] = useState(() => { try { return localStorage.getItem('clinovara.lang') || 'en'; } catch { return 'en'; } });
  const [run, busy] = useAction();
  const T = (k, vars) => t(lang, k, vars);
  const load = () => get(`/api/forms/token/${token}`).then((p) => { setPk(p); setCurrent((c) => c ?? ORDER.find((k) => !p.sections[k]?.complete) ?? null); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [token]); // eslint-disable-line
  useEffect(() => { try { localStorage.setItem('clinovara.lang', lang); } catch { /* ignore */ } }, [lang]);
  if (err) return <div className="forms-page"><Card><Body><h2>This link is not valid</h2><p className="muted mt-8">{err}. Please contact the clinic for a new link.</p></Body></Card></div>;
  if (!pk) return <div className="forms-page"><div className="skeleton" /></div>;
  const done = ORDER.filter((k) => pk.sections[k]?.complete).length;
  const allDone = done === ORDER.length;
  const langs = (pk.languages || LANGS);
  return (
    <div className="forms-page">
      <div className="row between wrap"><div className="row"><div className="brand-mark"><Logo /></div><div><div className="strong">{pk.practice.name}</div><div className="tiny muted">{pk.practice.address} · {pk.practice.phone}</div></div></div><Seg value={lang} onChange={setLang} options={langs.map((l) => ({ value: l.code, label: l.name }))} /></div>
      <Card><Body className="col">
        <h1>{T('formsHi', { name: pk.patient?.firstName })}</h1>
        <p className="muted">{pk.visitType} · <b>{fmtWhen(pk.appointment?.start)}</b>{pk.provider ? ` · ${pk.provider}` : ''}{pk.location ? ` · ${pk.location}` : ''}. {T('formsSub')}</p>
        <Steps total={ORDER.length} done={done} />
        <div className="tiny muted">{T('sectionsDone', { a: done, b: ORDER.length })}</div>
      </Body></Card>
      {allDone && !current && <Card><Body className="col" style={{ textAlign: 'center', padding: 32 }}><IconCheck size={36} style={{ color: 'var(--good)', margin: '0 auto' }} /><h2>{T('formsAllDone')}</h2><p className="muted">{T('formsAllDoneSub')}</p></Body></Card>}
      <Card>
        <div className="list">
          {ORDER.map((k) => (
            <div key={k} className={`list-item clickable ${current === k ? 'active' : ''}`} onClick={() => setCurrent(k)}>
              <div className="grow"><div className="strong">{sectionTitle(lang, k)}</div></div>
              {pk.sections[k]?.complete ? <Pill tone="good"><IconCheck size={12} />{T('done')}</Pill> : pk.sections[k]?.prefilled ? <Pill tone="info">{T('pleaseConfirm')}</Pill> : <Pill tone="outline">{T('todo')}</Pill>}
              <IconChevronRight size={16} className="faint" />
            </div>
          ))}
        </div>
      </Card>
      {current && (
        <Card title={sectionTitle(lang, current)}><Body>
          {pk.sections[current]?.prefilled && <div className="callout info small mb-16">{T('prefilledNote')}</div>}
          <SectionForm key={current + lang} lang={lang} sectionKey={current} initial={pk.sections[current]?.data || {}} consentText={pk.consentText} insuranceOptions={pk.insuranceOptions || []} saving={busy} onSave={(data) => run(async () => { await put(`/api/forms/token/${token}/sections/${current}`, { data }); const p = await get(`/api/forms/token/${token}`); setPk(p); const next = ORDER.slice(ORDER.indexOf(current) + 1).find((k) => !p.sections[k]?.complete) ?? ORDER.find((k) => !p.sections[k]?.complete) ?? null; setCurrent(next); window.scrollTo({ top: 0, behavior: 'smooth' }); }, 'Saved')} />
        </Body></Card>
      )}
      <p className="tiny faint" style={{ textAlign: 'center' }}>{T('questions', { phone: pk.practice.phone })}</p>
    </div>
  );
}
