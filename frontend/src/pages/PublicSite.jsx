import React, { useEffect, useMemo, useState } from 'react';
import { IconPhone, IconBrandWhatsapp, IconMapPin, IconClock, IconCheck, IconArrowLeft } from '@tabler/icons-react';
import Logo from '../components/Logo.jsx';
import SiteChat from '../components/SiteChat.jsx';
import { get, post } from '../lib/api.js';
import { fmtTime, setLocale } from '../lib/format.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const LABEL = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const t12 = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const timeOf = (iso) => fmtTime(iso); // always in the clinic's time zone, wherever the visitor is
const dayOf = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const jump = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
function hoursLine(h) {
  const groups = [];
  DAYS.forEach((d) => {
    const v = h?.[d] ? `${t12(h[d][0])} – ${t12(h[d][1])}` : 'Closed';
    const last = groups[groups.length - 1];
    if (last && last.v === v) last.days.push(d); else groups.push({ v, days: [d] });
  });
  return groups.map((g) => ({ days: g.days.length > 1 ? `${LABEL[g.days[0]]}–${LABEL[g.days[g.days.length - 1]]}` : LABEL[g.days[0]], v: g.v }));
}

/** The clinic's public website with live fees, timings and online booking. Talks to /api/public/*. */
export default function PublicSite() {
  const [c, setC] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { get(`/api/public/clinic${(() => { const v = new URLSearchParams((window.location.hash.split('?')[1] || '')).get('src'); return v ? `?src=${encodeURIComponent(v)}` : ''; })()}`).then((x) => { setLocale({ timezone: x.timezone }); setC(x); }).catch((e) => setErr(e.message)); }, []);
  if (err) return <div className="site"><SiteStyle /><div className="site-wrap" style={{ padding: 40 }}><h2>This page is not available</h2><p>{err}</p></div></div>;
  if (!c) return <div className="site"><SiteStyle /><div className="site-wrap" style={{ padding: 40 }}>Loading…</div></div>;
  const fmt = (n) => `${c.currency}${Number(n).toLocaleString('en-IN')}`;
  const tel = (c.practice.phone || '').replace(/[^\d+]/g, '');
  const wa = (c.practice.whatsapp || '').replace(/\D/g, '');
  const cats = [...new Set(c.procedures.map((p) => p.category))];
  const link = (id, label) => <a href={`#${id}`} onClick={(e) => { e.preventDefault(); jump(id); }}>{label}</a>;
  return (
    <div className="site">
      <SiteStyle />
      <SiteChat practice={c.practice} />
      <header className="site-top"><div className="site-wrap row">
        <span className="brand"><Logo size={26} /> {c.practice.name}</span>
        <nav>{link('book-now', 'Book')}{link('doctors', 'Doctors')}{c.showFees && link('fees', 'Fees')}{link('visit', 'Visit us')}</nav>
      </div></header>
      <section className="site-hero"><div className="site-wrap">
        <h1>{c.practice.name}</h1>
        <p>{c.practice.tagline || 'Gentle, honest dental care.'}</p>
        <div className="row gap">
          {c.onlineBooking && <button className="sbtn primary" onClick={() => jump('book-now')}>Book an appointment</button>}
          {tel && <a className="sbtn" href={`tel:${tel}`}><IconPhone size={16} /> {c.practice.phone}</a>}
          {wa && <a className="sbtn" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer"><IconBrandWhatsapp size={16} /> WhatsApp</a>}
        </div>
      </div></section>
      <div className="site-wrap">
        <section id="book-now" className="site-sec"><h2>Book online</h2>{c.onlineBooking ? <Booking c={c} fmt={fmt} /> : <p>Online booking is switched off. Please call {c.practice.phone}.</p>}</section>
        <section id="doctors" className="site-sec"><h2>Our dentists</h2><div className="grid3">{c.providers.map((p) => (
          <div className="scard" key={p.id}>
            <div className="avatar">{p.name.replace(/^Dr\.?\s*/, '')[0]}</div>
            <b>{p.name}</b><span className="muted">{p.specialty || p.role}</span><span className="tiny muted">{p.qualifications}</span>
            {c.showFees && p.fee > 0 && <span className="tiny">Consultation {fmt(p.fee)}</span>}
            <span className="tiny muted">{(p.locationIds || []).map((id) => c.locations.find((l) => l.id === id)?.name).filter(Boolean).join(' · ')}</span>
          </div>))}</div></section>
        {c.showFees && (
          <section id="fees" className="site-sec"><h2>Fees</h2>
            <div className="scard"><b>Appointments</b><table className="ftable"><tbody>{c.visitTypes.map((v) => {
              const vals = v.fees ? Object.values(v.fees) : [];
              const lo = vals.length ? Math.min(...vals) : v.fee; const hi = vals.length ? Math.max(...vals) : v.fee;
              return <tr key={v.id}><td>{v.name}<span className="tiny muted"> · {v.durationMin} min</span></td><td className="r">{!lo && !hi ? 'Quoted after examination' : lo === hi ? fmt(lo) : `${fmt(lo)} – ${fmt(hi)}`}</td></tr>;
            })}</tbody></table></div>
            {cats.map((cat) => <div className="scard" key={cat}><b>{cat}</b><table className="ftable"><tbody>{c.procedures.filter((p) => p.category === cat).map((p) => <tr key={p.id}><td>{p.name}</td><td className="r">{p.minFee && p.maxFee ? `${fmt(p.minFee)} – ${fmt(p.maxFee)}` : fmt(p.fee)}</td></tr>)}</tbody></table></div>)}
            {c.feeNote && <p className="tiny muted">{c.feeNote}</p>}
          </section>
        )}
        <section id="visit" className="site-sec"><h2>Visit us</h2><div className="grid3">{c.locations.map((l) => (
          <div className="scard" key={l.id}>
            <b>{l.name}</b>
            <span className="small"><IconMapPin size={14} /> {l.address}</span>
            {l.phone && <a className="small" href={`tel:${l.phone.replace(/[^\d+]/g, '')}`}><IconPhone size={14} /> {l.phone}</a>}
            <span className="small"><IconClock size={14} /> Timings</span>
            {hoursLine(l.hours).map((g) => <span key={g.days} className="tiny"><b>{g.days}</b> {g.v}</span>)}
          </div>))}</div></section>
        {c.faqs.length > 0 && <section className="site-sec"><h2>Questions</h2>{c.faqs.map((f, i) => <details key={i} className="scard"><summary><b>{f.question}</b></summary><p>{f.answer}</p></details>)}</section>}
        <footer className="site-foot">Cancel or change an appointment at least {c.cancelNoticeHours || 24} hours ahead by replying to your confirmation message. · {c.practice.address}</footer>
      </div>
    </div>
  );
}

function Booking({ c, fmt }) {
  const [step, setStep] = useState(1);
  const [vt, setVt] = useState(null);
  const [prov, setProv] = useState('any');
  const [loc, setLoc] = useState('');
  const [days, setDays] = useState(null);
  const [day, setDay] = useState('');
  const [slot, setSlot] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', reason: '', source: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState(null);
  const eligible = useMemo(() => (vt ? c.providers.filter((p) => (!vt.providerRole || p.role === vt.providerRole) && (!loc || !p.locationIds.length || p.locationIds.includes(loc))) : []), [vt, loc, c]);
  useEffect(() => {
    if (step !== 2 || !vt) return;
    setDays(null); setSlot(null);
    const q = new URLSearchParams({ visitTypeId: vt.id, days: '14' });
    if (prov !== 'any') q.set('providerId', prov);
    if (loc) q.set('locationId', loc);
    get(`/api/public/slots?${q}`).then((r) => { setDays(r.days); setDay((r.days.find((d) => d.slots.length) || r.days[0])?.date || ''); }).catch((e) => setMsg(e.message));
  }, [step, vt, prov, loc]);
  // With "first available" several dentists share a start time: show each time once, the first dentist wins.
  const slots = (days?.find((d) => d.date === day)?.slots || []).filter((s, i, a) => prov !== 'any' || a.findIndex((x) => x.start === s.start) === i);
  const feeOf = (p) => (vt?.fees && p ? vt.fees[p] : vt?.fee);
  const confirm = async () => {
    setBusy(true); setMsg('');
    try { setDone(await post('/api/public/book', { ...form, visitTypeId: vt.id, providerId: slot.providerId, locationId: slot.locationId, start: slot.start })); }
    catch (e) { setMsg(e.message); if (/taken/.test(e.message)) { setSlot(null); setStep(2); } } finally { setBusy(false); }
  };
  if (done) return <div className="scard ok"><IconCheck size={28} /><h3>You are booked</h3><p><b>{done.visitType}</b> with {done.provider}<br />{done.when}{done.location ? ` · ${done.location}` : ''}</p><p className="muted small">A confirmation was sent to your phone. {done.fee ? `Fee: ${fmt(done.fee)}, payable at the clinic.` : ''}</p></div>;
  return (
    <div className="scard">
      <div className="bsteps">{['Service', 'Time', 'Your details'].map((s, i) => <span key={s} className={step === i + 1 ? 'on' : step > i + 1 ? 'past' : ''}>{i + 1}. {s}</span>)}</div>
      {msg && <div className="smsg">{msg}</div>}
      {step === 1 && (
        <>
          <div className="opts">{c.visitTypes.map((v) => <button key={v.id} className={`opt ${vt?.id === v.id ? 'sel' : ''}`} onClick={() => { setVt(v); setProv('any'); }}><b>{v.name}</b><span className="tiny muted">{v.durationMin} min{c.showFees ? ` · ${v.fee ? fmt(v.fee) : 'fee after examination'}` : ''}</span></button>)}</div>
          {vt && (
            <div className="row gap wrapr" style={{ marginTop: 14 }}>
              {c.locations.length > 1 && <label className="sfield">Branch<select value={loc} onChange={(e) => { setLoc(e.target.value); setProv('any'); }}><option value="">Any branch</option>{c.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}
              <label className="sfield">Dentist<select value={prov} onChange={(e) => setProv(e.target.value)}><option value="any">First available</option>{eligible.map((p) => <option key={p.id} value={p.id}>{p.name}{c.showFees && vt.fees?.[p.id] ? ` — ${fmt(vt.fees[p.id])}` : ''}</option>)}</select></label>
              <button className="sbtn primary" onClick={() => { setMsg(''); setStep(2); }}>See times</button>
            </div>
          )}
        </>
      )}
      {step === 2 && (
        <>
          <button className="slink" onClick={() => setStep(1)}><IconArrowLeft size={14} /> Change service</button>
          {!days ? <p>Loading times…</p> : (
            <>
              <div className="dayrow">{days.map((d) => <button key={d.date} disabled={!d.slots.length} className={`dchip ${d.date === day ? 'sel' : ''}`} onClick={() => { setDay(d.date); setSlot(null); }}>{dayOf(d.date)}<span className="tiny">{d.slots.length ? 'available' : 'full'}</span></button>)}</div>
              {days.every((d) => !d.slots.length)
                ? <p>No times in the next two weeks. Please call {c.practice.phone}.</p>
                : <div className="times">{slots.map((s) => <button key={s.start + s.providerId} className={`tchip ${slot?.start === s.start && slot?.providerId === s.providerId ? 'sel' : ''}`} onClick={() => setSlot(s)}>{timeOf(s.start)}{prov === 'any' && <span className="tiny">{s.providerName.replace(/^Dr\.?\s*/, 'Dr ')}</span>}</button>)}</div>}
              {slot && <div className="row gap" style={{ marginTop: 14 }}><span className="small">{dayOf(day)}, {timeOf(slot.start)} · {slot.providerName} · {slot.locationName}{c.showFees && feeOf(slot.providerId) ? ` · ${fmt(feeOf(slot.providerId))}` : ''}</span><button className="sbtn primary" onClick={() => setStep(3)}>Continue</button></div>}
            </>
          )}
        </>
      )}
      {step === 3 && slot && (
        <>
          <button className="slink" onClick={() => setStep(2)}><IconArrowLeft size={14} /> Change time</button>
          <p className="small"><b>{vt.name}</b> · {dayOf(day)}, {timeOf(slot.start)} · {slot.providerName}</p>
          <div className="row gap wrapr">
            <label className="sfield">Full name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="sfield">Mobile number<input inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          </div>
          <label className="sfield" style={{ marginTop: 10 }}>What brings you in? (optional)<input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></label>
          <label className="sfield" style={{ marginTop: 10 }}>How did you hear about us? (optional)<select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}><option value="">Prefer not to say</option>{['Google search', 'Google Maps', 'Friend or family', 'Instagram or Facebook', 'Walked past', 'Doctor referral', 'Other'].map((x) => <option key={x}>{x}</option>)}</select></label>
          <p className="tiny muted">We use your number only to confirm and remind you about this visit. For severe pain or swelling, please call {c.practice.phone}.</p>
          <button className="sbtn primary" disabled={busy || !form.name.trim() || form.phone.replace(/\D/g, '').length < 10} onClick={confirm}>{busy ? 'Booking…' : 'Confirm appointment'}</button>
        </>
      )}
    </div>
  );
}

function SiteStyle() {
  return <style>{`
.site{min-height:100vh;background:var(--ground);color:var(--text);font-family:'Public Sans',system-ui,sans-serif}
.site-wrap{max-width:1040px;margin:0 auto;padding:0 20px}.site .row{display:flex;align-items:center}.site .gap{gap:12px;flex-wrap:wrap}.site .wrapr{align-items:flex-end}
.site-top{background:var(--rail);color:#fff;position:sticky;top:0;z-index:5}.site-top .row{justify-content:space-between;height:56px}.site-top .brand{display:flex;gap:8px;align-items:center;font-family:var(--display);font-weight:700;letter-spacing:-0.02em;font-size:19px}.site-top nav{display:flex;gap:18px}.site-top nav a{color:var(--rail-text);text-decoration:none;font-size:14px}
.site-hero{background:linear-gradient(180deg,var(--rail-2),var(--rail));color:#fff;padding:56px 0 48px}.site-hero h1{font-family:var(--display);font-weight:700;letter-spacing:-0.02em;font-size:clamp(30px,5vw,46px);margin:0 0 8px}.site-hero p{color:var(--rail-text);margin:0 0 22px;font-size:17px}
.sbtn{display:inline-flex;align-items:center;gap:6px;padding:10px 16px;border-radius:6px;border:1px solid var(--border-strong);background:#fff;color:var(--text);font:inherit;font-size:14px;cursor:pointer;text-decoration:none}.sbtn.primary{background:var(--accent);border-color:var(--accent);color:#fff}.sbtn:disabled{opacity:.5;cursor:not-allowed}
.site-sec{padding:34px 0 6px}.site-sec h2{font-family:var(--display);font-weight:700;letter-spacing:-0.02em;font-size:26px;margin:0 0 14px}
.scard{background:#fff;border:1px solid var(--border);border-radius:6px;padding:16px;margin-bottom:12px;display:flex;flex-direction:column;gap:6px}.scard.ok{align-items:center;text-align:center;color:var(--accent)}.scard.ok p{color:var(--text);margin:0}
.grid3{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}.grid3 .scard{margin:0}.avatar{width:42px;height:42px;border-radius:50%;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center;font-family:var(--display);font-weight:700;letter-spacing:-0.02em;font-size:20px}
.site .muted{color:var(--muted)}.site .tiny{font-size:12px}.site .small{font-size:13.5px;display:flex;gap:6px;align-items:center}.site a.small{color:var(--accent)}
.ftable{width:100%;border-collapse:collapse;font-size:14px}.ftable td{padding:7px 0;border-bottom:1px solid var(--border)}.ftable .r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.bsteps{display:flex;gap:16px;font-size:13px;color:var(--faint);margin-bottom:12px;flex-wrap:wrap}.bsteps .on{color:var(--accent);font-weight:600}.bsteps .past{color:var(--muted)}
.opts{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px}.opt{text-align:left;padding:12px;border:1px solid var(--border);border-radius:6px;background:var(--surface-2);cursor:pointer;display:flex;flex-direction:column;gap:2px;font:inherit}.opt.sel,.tchip.sel,.dchip.sel{border-color:var(--accent);background:var(--accent-soft)}
.sfield{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--muted);flex:1;min-width:180px}.sfield input,.sfield select{padding:10px;border:1px solid var(--border-strong);border-radius:6px;font:inherit;background:#fff;color:var(--text)}
.dayrow{display:flex;gap:6px;overflow-x:auto;padding:4px 0 10px}.dchip{flex:none;padding:8px 12px;border:1px solid var(--border);border-radius:6px;background:#fff;cursor:pointer;display:flex;flex-direction:column;align-items:center;font:inherit;font-size:13px}.dchip:disabled{opacity:.45;cursor:not-allowed}
.times{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:8px}.tchip{padding:9px;border:1px solid var(--border);border-radius:6px;background:#fff;cursor:pointer;display:flex;flex-direction:column;align-items:center;font:inherit;font-size:14px}
.slink{background:none;border:0;color:var(--accent);cursor:pointer;display:inline-flex;gap:4px;align-items:center;font:inherit;font-size:13px;padding:0 0 10px}.smsg{background:#fbf0dc;border:1px solid #c8811a;padding:8px 12px;border-radius:6px;font-size:13px;margin-bottom:10px}
.site-foot{padding:30px 0 40px;font-size:12px;color:var(--muted)}details.scard summary{cursor:pointer}details.scard p{margin:8px 0 0;font-size:14px}
`}</style>;
}
