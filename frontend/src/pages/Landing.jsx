import React, { useEffect, useMemo, useState } from 'react';
import { IconCheck, IconArrowRight, IconMessageCircle, IconCalendarEvent, IconDeviceTablet, IconStethoscope, IconSpeakerphone, IconChartBar, IconShieldCheck, IconLanguage, IconClock, IconMenu2, IconX, IconChevronDown, IconUsers, IconSparkles, IconBuildingStore, IconReceipt2 } from '@tabler/icons-react';
import Logo from '../components/Logo.jsx';
import { get, post } from '../lib/api.js';
import { SUPPORT_EMAIL } from './Legal.jsx';
import '../landing.css';

const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

const NAV = [['product', 'Product'], ['roles', 'For your team'], ['week', 'Getting started'], ['demo', 'Demo call'], ['pricing', 'Pricing'], ['faq', 'FAQ']];

const FEATURES = [
  { id: 'desk', eyebrow: 'Front desk assistant', icon: IconMessageCircle, title: 'Patients get an answer in seconds, in their own language', text: 'The assistant answers on your clinic website and WhatsApp, quotes your own fees and timings, and books real slots at the right branch. Anything clinical goes straight to a person.', points: ['English, Hindi, Kannada and Hinglish', 'Books only into times you actually have free', 'Hands over pain, medicines and complaints to your team'], visual: 'chat' },
  { id: 'queue', eyebrow: 'Check-in and queue', icon: IconDeviceTablet, title: 'A waiting room that runs itself', text: 'Patients check in at a kiosk with their mobile number, get a token, and see it called on the waiting-room display. Your team sees who is waiting and for how long.', points: ['Kiosk check-in with pre-visit forms and consent', 'Token display with a chime and spoken call', 'Live queue for the front desk, no shouting names'], visual: 'board' },
  { id: 'dentist', eyebrow: 'Dentist workspace', icon: IconStethoscope, title: 'The dentist is briefed before the patient sits down', text: 'Allergies, medicines, medical alerts and what the patient said they came for are on one screen. Finishing a visit takes one short form: notes, a treatment recommendation, the next visit and the aftercare message.', points: ['Alerts from the pre-visit form at a glance', 'One form to finish: notes, plan, next visit, aftercare', 'Treatment plans that do not fall through the cracks'], visual: 'dentist' },
  { id: 'growth', eyebrow: 'Growth and marketing', icon: IconSpeakerphone, title: 'Bring patients back, and see what worked', text: 'Recall reminders, review requests, festival greetings and win-back messages are drafted for you. An owner approves every message before it is sent, and you see what each campaign led to.', points: ['One tap from "overdue for a check-up" to a draft', 'Owner approval on every message and campaign', 'Bookings and collections that followed each campaign'], visual: 'growth' },
];

const ROLES = [
  { id: 'owner', label: 'Owner', icon: IconChartBar, headline: 'The whole clinic on one page', points: ['Revenue, appointments, no-shows and chair use against the last period', 'What needs a decision today: messages, approvals, unpaid visits', 'Where bookings and new patients come from, and what marketing earned'] },
  { id: 'desk', label: 'Front desk', icon: IconUsers, headline: 'A to-do list that clears itself', points: ['Messages, callbacks, confirmations and payments to collect, with one click to each', 'The live queue and the day\'s schedule on one screen', 'Reminders and recalls sent in the patient\'s language'] },
  { id: 'dentist', label: 'Dentist', icon: IconStethoscope, headline: 'Only your patients, ready when you are', points: ['Your list for the day, with alerts and what each patient told you', 'Call in, seat, treat and finish in a few taps', 'Your week, your numbers and your treatment plans'] },
];

const DAY = [
  ['08:41', 'A patient asks on WhatsApp whether her insurer is cashless', 'Answered, and a consultation offered for Tuesday evening'],
  ['08:52', 'Rohan checks in at the kiosk in Hindi', 'Token A02 appears on the waiting-room display'],
  ['09:04', 'The dentist opens her day', 'Blood thinners and an RCT plan are already on screen'],
  ['10:30', 'A patient asks if he should take leftover amoxicillin', 'The assistant declines and hands him to the dentist'],
  ['13:10', 'A patient pays by UPI at the desk', 'The receipt number is created and collections update'],
  ['15:20', 'A thank-you is drafted after a visit', 'The owner approves it and it goes out at 16:20'],
];

const WEEK = [
  ['Day 0', 'Register and set up', 'Verify your email, add your address, hours, dentists and services. About ten minutes.'],
  ['Day 1', 'Bring your patients', 'Import them from a CSV and invite your front desk and dentists with their own logins.'],
  ['Day 2', 'Open the doors', 'Put the kiosk on a tablet, the display on a TV, and the booking link on Google Maps.'],
  ['Day 7', 'Start the follow-ups', 'Send your first recall reminders and review requests. You approve each one.'],
  ['Day 30', 'Look at the results', 'See what the first month brought in and decide how to carry on.'],
];

const PLANS = [
  { name: 'Solo clinic', who: 'One dentist, one chair or two', points: ['Assistant, online booking and kiosk', 'Reminders, recalls and receipts', 'Owner dashboard and growth tab'] },
  { name: 'Clinic', who: 'Two to eight dentists', mark: 'Most clinics', points: ['Everything in Solo clinic', 'Roles for front desk, dentists and hygienists', 'Marketing approvals and campaign results'] },
  { name: 'Group', who: 'Several branches', points: ['Everything in Clinic', 'Per-branch hours, queues and numbers', 'Priority support and onboarding help'] },
];

const FAQ = [
  ['Is it really ready to use in ten minutes?', 'The setup is five short screens: clinic address, opening hours, dentists, services and launch. You can book your first patient straight after. Importing your existing patients from a CSV takes a little longer, and we help with that on the demo call.'],
  ['Does it send WhatsApp messages and SMS?', 'Yes, once you connect your WhatsApp Business account or an SMS provider. Until then messages wait in an outbox you can see, so nothing is lost and nothing is sent by surprise.'],
  ['What does the assistant say to patients?', 'Only what you approve: your fees, hours, address and policies. It never gives medical advice. Pain, medicines, billing disputes and complaints are handed to your team.'],
  ['Who can see patient data?', 'Each clinic\'s data is kept separately, and every role sees only what it needs. Patients on your website can see their own chat and nothing else. Consent follows the Digital Personal Data Protection Act, 2023.'],
  ['Can I keep my current practice software?', 'Yes. Clinovara covers the front office: booking, check-in, queue, reminders, payments and marketing. It can read and write patients by CSV today, and exposes standard APIs for connecting your other systems.'],
  ['Do my patients need to install anything?', 'No. They use your clinic website, WhatsApp, or the kiosk. Forms open from a link on their phone.'],
  ['What happens after the 30-day trial?', 'Nothing automatic. No card is taken at sign-up. We will talk about plans before the trial ends, and your data stays yours.'],
  ['How is marketing kept under control?', 'Every message and campaign waits for an owner or admin to approve it. Only patients who agreed to be contacted receive anything, inside your quiet hours, with an opt-out line.'],
];

/* ---------- small product mocks, drawn in HTML so they stay sharp and match the real app ---------- */
function MockWindow({ children, title }) {
  return <div className="lp-window"><div className="lp-window-bar"><i /><i /><i /><span>{title}</span></div><div className="lp-window-body">{children}</div></div>;
}
function Spark({ pts }) { const max = Math.max(...pts); const w = 100; const h = 28; const p = pts.map((v, i) => `${(i / (pts.length - 1)) * w},${h - (v / max) * (h - 4) - 2}`).join(' '); return <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="28" preserveAspectRatio="none"><polyline points={p} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" /></svg>; }
function Visual({ kind }) {
  if (kind === 'chat') return (
    <MockWindow title="Your clinic website">
      <div className="mk-chat">
        <div className="b me">Can I book a cleaning for Saturday morning?</div>
        <div className="b bot">Yes. A cleaning and check-up takes about 45 minutes and is ₹1,500. Here is what I have free:<br />1. Sat, 9:00 am with Dr Menon<br />2. Sat, 11:00 am with Dr Menon</div>
        <div className="b me">The first one please</div>
        <div className="b bot">Booked for Saturday at 9:00 am. A form link is on its way to your phone.</div>
      </div>
    </MockWindow>
  );
  if (kind === 'board') return (
    <MockWindow title="Waiting-room display">
      <div className="mk-board">
        <div className="calling"><b>A02</b><span><strong>Dr. Vikram Menon</strong><br />Rohan, please come in</span></div>
        <div className="wait"><small>Waiting</small><div><i>A03</i><i>A04</i><i>A05</i></div></div>
      </div>
    </MockWindow>
  );
  if (kind === 'dentist') return (
    <MockWindow title="My home">
      <div className="mk-dentist">
        <small>NEXT PATIENT</small>
        <div className="row-name"><b>A02</b> Rohan Patil <span>46 yrs</span></div>
        <div className="say">Patient says: "Pain in lower left molar when chewing"</div>
        <div className="tags"><i className="warn">High blood pressure</i><i className="bad">Allergy: Penicillin</i><i>Telmisartan 40mg daily</i></div>
        <button>Call Rohan in</button>
      </div>
    </MockWindow>
  );
  return (
    <MockWindow title="Marketing, growth">
      <div className="mk-growth">
        <div className="tiles"><div><small>Messages sent</small><b>89</b></div><div><small>Bookings that followed</small><b>28</b></div><div><small>Collected</small><b>₹55,900</b></div></div>
        <table><tbody>
          <tr><td>Cleaning reminder</td><td>18 sent</td><td><b>9 bookings</b></td></tr>
          <tr><td>Win back inactive</td><td>22 sent</td><td><b>15 bookings</b></td></tr>
          <tr><td>Whitening offer</td><td>26 sent</td><td><b>16 bookings</b></td></tr>
        </tbody></table>
        <div className="approve"><IconShieldCheck size={14} /> Every message approved by an owner before it is sent</div>
      </div>
    </MockWindow>
  );
}
function HeroMock() {
  return (
    <div className="lp-hero-mock">
      <MockWindow title="Overview · SmileCare Dental">
        <div className="mk-overview">
          <div className="side"><span className="on">Overview</span><span>Schedule</span><span>Patients</span><span>Inbox</span><span>Marketing</span><span>Insights</span></div>
          <div className="main">
            <div className="tiles">
              <div><small>Revenue collected</small><b>₹9.1L</b><Spark pts={[3, 5, 4, 6, 5, 7, 8, 7, 9]} /><em>▲ 12% vs last 30 days</em></div>
              <div><small>Appointments</small><b>404</b><Spark pts={[4, 4, 5, 5, 6, 6, 7, 7, 8]} /><em>▲ 9%</em></div>
              <div><small>No-show rate</small><b>10%</b><Spark pts={[6, 7, 5, 6, 5, 4, 5, 4, 4]} /><em className="g">▼ 3%</em></div>
            </div>
            <div className="bars">{[40, 62, 55, 78, 70, 92, 84, 60, 74, 88, 66, 80].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div>
          </div>
        </div>
      </MockWindow>
      <div className="lp-float f1"><IconMessageCircle size={16} /><div><b>New patient message</b><span>"Do you have a slot Saturday?"</span></div></div>
      <div className="lp-float f2"><b className="tok">A02</b><div><b>Now calling</b><span>Dr. Menon · Rohan</span></div></div>
      <div className="lp-float f3"><IconCheck size={16} /><div><b>Review request approved</b><span>Goes out at 4:20 pm</span></div></div>
    </div>
  );
}

/* ---------- demo call booking ---------- */
function DemoCall() {
  const [meta, setMeta] = useState(null);
  const [day, setDay] = useState('');
  const [slot, setSlot] = useState('');
  const [f, setF] = useState({ name: '', clinic: '', email: '', phone: '', city: '', size: '', software: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  useEffect(() => { get('/api/leads/slots').then((m) => { setMeta(m); const first = m.slots.find((s) => s.available); if (first) setDay(dayOf(first.start)); }).catch(() => setMeta({ slots: [], agenda: [], sizes: [], failed: true })); }, []);
  const dayOf = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const days = useMemo(() => [...new Set((meta?.slots || []).map((s) => dayOf(s.start)))], [meta]);
  const times = (meta?.slots || []).filter((s) => dayOf(s.start) === day);
  const set = (k, v) => setF({ ...f, [k]: v });
  const label = (d) => { const x = new Date(`${d}T12:00:00Z`); return { w: x.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' }), d: x.getUTCDate(), m: x.toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' }) }; };
  const clock = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  const ready = f.name.trim() && f.clinic.trim() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email) && f.phone.replace(/\D/g, '').length >= 10 && slot;
  const submit = async () => { setBusy(true); setErr(''); try { setDone(await post('/api/leads/demo', { ...f, slot })); } catch (e) { setErr(e.message); if (/taken|no longer/.test(e.message)) { setSlot(''); get('/api/leads/slots').then(setMeta).catch(() => {}); } } finally { setBusy(false); } };
  const agenda = meta?.agenda?.length ? meta.agenda : [];

  return (
    <div className="lp-demo">
      <div className="lp-demo-agenda">
        <span className="lp-eyebrow">Book a demo call</span>
        <h2>See it with your own clinic in mind</h2>
        <p className="lp-lead">A 30-minute video call with someone who knows the product. No slides: we use the real thing, and we leave time for your questions.</p>
        <div className="lp-agenda">
          <div className="lp-agenda-head"><IconClock size={16} /> Agenda · 30 minutes</div>
          {agenda.map(([t, h, d], i) => <div className="lp-agenda-row" key={h}><span className="n">{i + 1}</span><div><b>{h}</b><p>{d}</p></div><em>{t}</em></div>)}
        </div>
        <div className="lp-prep"><b>Helpful to have open</b><span>Your current appointment book or software, and a rough idea of how many dentists and chairs you run.</span></div>
      </div>

      <div className="lp-demo-card">
        {done ? (
          <div className="lp-done">
            <span className="tick"><IconCheck size={26} /></span>
            <h3>You are booked</h3>
            <p className="when">{done.when}</p>
            <p className="muted">30 minutes by video. {done.confirmedByEmail ? 'We have emailed you the agenda and a joining note.' : 'We will email you the joining link before the call.'}</p>
            <div className="lp-agenda compact">{done.agenda.map(([t, h]) => <div className="lp-agenda-row" key={h}><span className="n"><IconCheck size={12} /></span><div><b>{h}</b></div><em>{t}</em></div>)}</div>
            <button className="lp-btn ghost" onClick={() => { setDone(null); setSlot(''); setF({ name: '', clinic: '', email: '', phone: '', city: '', size: '', software: '', message: '' }); }}>Book another</button>
          </div>
        ) : (<>
          <h3>Pick a time</h3>
          <div className="lp-tz">Times are in India Standard Time</div>
          {meta?.failed && <div className="lp-err">We could not load times just now. Write to {SUPPORT_EMAIL} and we will arrange a call.</div>}
          <div className="lp-days">{days.map((d) => { const l = label(d); return <button key={d} className={d === day ? 'on' : ''} onClick={() => { setDay(d); setSlot(''); }}><small>{l.w}</small><b>{l.d}</b><small>{l.m}</small></button>; })}</div>
          <div className="lp-times">{times.map((s) => <button key={s.start} disabled={!s.available} className={s.start === slot ? 'on' : ''} onClick={() => setSlot(s.start)}>{clock(s.start)}{!s.available && <small>Full</small>}</button>)}</div>
          <div className="lp-form">
            <label>Your name<input value={f.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" /></label>
            <label>Clinic name<input value={f.clinic} onChange={(e) => set('clinic', e.target.value)} autoComplete="organization" /></label>
            <label>Work email<input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" /></label>
            <label>Phone<input inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" /></label>
            <label>City<input value={f.city} onChange={(e) => set('city', e.target.value)} /></label>
            <label>Clinic size<select value={f.size} onChange={(e) => set('size', e.target.value)}><option value="">Choose…</option>{(meta?.sizes || []).map((x) => <option key={x}>{x}</option>)}</select></label>
            <label className="wide">What do you use today? (optional)<input value={f.software} onChange={(e) => set('software', e.target.value)} placeholder="A register, Excel, Practo, another software…" /></label>
            <label className="wide">Anything you want us to cover? (optional)<textarea rows={2} value={f.message} onChange={(e) => set('message', e.target.value)} /></label>
          </div>
          {err && <div className="lp-err">{err}</div>}
          <button className="lp-btn primary block" disabled={busy || !ready} onClick={submit}>{busy ? 'Booking…' : 'Confirm demo call'}<IconArrowRight size={18} /></button>
          <div className="lp-tiny">We use your details only to arrange this call. No spam, and no card.</div>
        </>)}
      </div>
    </div>
  );
}

export default function Landing() {
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [role, setRole] = useState('owner');
  useEffect(() => { const on = () => setScrolled(window.scrollY > 8); on(); window.addEventListener('scroll', on, { passive: true }); return () => window.removeEventListener('scroll', on); }, []);
  const jump = (id) => { setMenu(false); go(id); };
  const r = ROLES.find((x) => x.id === role);

  return (
    <div className="lp">
      <header className={`lp-nav ${scrolled ? 'scrolled' : ''}`}>
        <div className="lp-wrap lp-nav-in">
          <a href="#/" className="lp-brand" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><div className="brand-mark"><Logo /></div>Clinovara</a>
          <nav className={`lp-links ${menu ? 'open' : ''}`}>
            {NAV.map(([id, label]) => <button key={id} onClick={() => jump(id)}>{label}</button>)}
            <div className="lp-nav-cta-m"><a href="#/login" className="lp-btn ghost">Log in</a><button className="lp-btn" onClick={() => jump('demo')}>Book a demo call</button><a href="#/signup" className="lp-btn primary">Start free trial</a></div>
          </nav>
          <div className="lp-nav-cta"><a href="#/login" className="lp-link">Log in</a><button className="lp-btn" onClick={() => jump('demo')}>Book a demo call</button><a href="#/signup" className="lp-btn primary">Start free trial</a></div>
          <button className="lp-burger" aria-label="Menu" onClick={() => setMenu(!menu)}>{menu ? <IconX size={22} /> : <IconMenu2 size={22} />}</button>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-wrap lp-hero-in">
          <div className="lp-hero-copy">
            <span className="lp-badge"><IconSparkles size={14} /> Front office software for dental clinics in India</span>
            <h1>Run your clinic's front desk on autopilot.</h1>
            <p className="lp-sub">Clinovara answers patients on WhatsApp and your website, books the right slot, checks them in at the kiosk, briefs the dentist and follows up after every visit. Set up in about ten minutes.</p>
            <div className="lp-cta">
              <a href="#/signup" className="lp-btn primary lg">Start 30-day free trial <IconArrowRight size={18} /></a>
              <button className="lp-btn lg" onClick={() => go('demo')}>Book a demo call</button>
            </div>
            <div className="lp-assure"><span><IconCheck size={14} />No card needed</span><span><IconCheck size={14} />Ten-minute setup</span><span><IconCheck size={14} />English, हिन्दी, ಕನ್ನಡ</span></div>
            <a href="#/login?demo=1" className="lp-try">Or look around the demo clinic first <IconArrowRight size={14} /></a>
          </div>
          <HeroMock />
        </div>
      </section>

      <section className="lp-strip">
        <div className="lp-wrap">
          <span>Built for how Indian clinics work</span>
          <ul><li>₹ fees and receipts</li><li>UPI and cashless</li><li>WhatsApp first</li><li>DPDP consent</li><li>ABHA ready</li><li>Hindi, Kannada, English</li></ul>
        </div>
      </section>

      <section id="product" className="lp-section">
        <div className="lp-wrap">
          <div className="lp-head"><span className="lp-eyebrow">The product</span><h2>Everything between "hello" and "see you in six months"</h2><p className="lp-lead">One system for the reception, the waiting room, the dentist's chair and the follow-up, so nothing depends on someone remembering.</p></div>
          {FEATURES.map((f, i) => (
            <div className={`lp-feature ${i % 2 ? 'flip' : ''}`} key={f.id}>
              <div className="copy">
                <span className="lp-icon"><f.icon size={20} /></span>
                <span className="lp-eyebrow">{f.eyebrow}</span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
                <ul>{f.points.map((p) => <li key={p}><IconCheck size={16} />{p}</li>)}</ul>
              </div>
              <div className="vis"><Visual kind={f.visual} /></div>
            </div>
          ))}
          <div className="lp-mini-grid">
            {[[IconCalendarEvent, 'Online booking', 'A booking page that respects your hours, dentists and holidays.'], [IconReceipt2, 'Payments and receipts', 'UPI, cash and card recorded against the visit, with receipt numbers.'], [IconLanguage, 'Three languages', 'Screens, forms and messages in English, Hindi and Kannada.'], [IconBuildingStore, 'Many branches', 'Each branch has its own hours, queue and numbers.']].map(([Icon, h, t]) => <div key={h}><span className="lp-icon sm"><Icon size={18} /></span><b>{h}</b><p>{t}</p></div>)}
          </div>
        </div>
      </section>

      <section id="roles" className="lp-section alt">
        <div className="lp-wrap">
          <div className="lp-head"><span className="lp-eyebrow">For your whole team</span><h2>Each person sees the screen that fits their job</h2></div>
          <div className="lp-tabs" role="tablist">{ROLES.map((x) => <button key={x.id} role="tab" aria-selected={role === x.id} className={role === x.id ? 'on' : ''} onClick={() => setRole(x.id)}><x.icon size={16} />{x.label}</button>)}</div>
          <div className="lp-role"><h3>{r.headline}</h3><ul>{r.points.map((p) => <li key={p}><IconCheck size={18} />{p}</li>)}</ul><a className="lp-link" href="#/login?demo=1">See the {r.label.toLowerCase()} view in the demo <IconArrowRight size={14} /></a></div>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-wrap lp-day">
          <div className="lp-head left"><span className="lp-eyebrow">A sample day</span><h2>What your day looks like with it</h2><p className="lp-lead">Six small moments that used to be a phone call, a sticky note or a forgotten task.</p></div>
          <div className="lp-ledger">{DAY.map(([t, a, b]) => <div key={t}><span className="t">{t}</span><div><b>{a}</b><p>{b}</p></div></div>)}</div>
        </div>
      </section>

      <section id="week" className="lp-section alt">
        <div className="lp-wrap">
          <div className="lp-head"><span className="lp-eyebrow">Getting started</span><h2>From sign-up to your first month in five steps</h2></div>
          <ol className="lp-week">{WEEK.map(([d, h, t], i) => <li key={d}><span className="d">{d}</span><i>{i + 1}</i><b>{h}</b><p>{t}</p></li>)}</ol>
        </div>
      </section>

      <section id="demo" className="lp-section"><div className="lp-wrap"><DemoCall /></div></section>

      <section id="pricing" className="lp-section alt">
        <div className="lp-wrap">
          <div className="lp-head"><span className="lp-eyebrow">Pricing</span><h2>Free for 30 days. Then priced for the size of your clinic.</h2><p className="lp-lead">No card to start. We share the plan that fits on the demo call, so you never pay for what you do not use.</p></div>
          <div className="lp-plans">
            {PLANS.map((p) => <div key={p.name} className={`lp-plan ${p.mark ? 'hot' : ''}`}>{p.mark && <em>{p.mark}</em>}<h3>{p.name}</h3><p className="who">{p.who}</p><ul>{p.points.map((x) => <li key={x}><IconCheck size={16} />{x}</li>)}</ul><div className="price">Shared on the demo call</div><div className="row"><a href="#/signup" className="lp-btn primary">Start free trial</a><button className="lp-btn" onClick={() => go('demo')}>Talk to us</button></div></div>)}
          </div>
        </div>
      </section>

      <section id="faq" className="lp-section">
        <div className="lp-wrap narrow">
          <div className="lp-head"><span className="lp-eyebrow">Questions</span><h2>Things clinics ask us</h2></div>
          <div className="lp-faq">{FAQ.map(([q, a]) => <details key={q}><summary>{q}<IconChevronDown size={18} /></summary><p>{a}</p></details>)}</div>
        </div>
      </section>

      <section className="lp-final">
        <div className="lp-wrap">
          <h2>Give your front desk the day off from the phone.</h2>
          <p>Start free today, or book a call and we will walk you through it.</p>
          <div className="lp-cta center"><a href="#/signup" className="lp-btn light lg">Start 30-day free trial</a><button className="lp-btn outline-light lg" onClick={() => go('demo')}>Book a demo call</button></div>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-in">
          <div><div className="lp-brand dark"><div className="brand-mark"><Logo /></div>Clinovara</div><p>Front office software for dental clinics in India.</p></div>
          <div><b>Product</b><button onClick={() => go('product')}>Features</button><button onClick={() => go('roles')}>For your team</button><button onClick={() => go('pricing')}>Pricing</button><a href="#/login?demo=1">Demo clinic</a></div>
          <div><b>Company</b><button onClick={() => go('demo')}>Book a demo call</button><a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a><a href="#/login">Log in</a></div>
          <div><b>Legal</b><a href="#/terms">Terms of Service</a><a href="#/privacy">Privacy Policy</a></div>
        </div>
        <div className="lp-wrap lp-copy">© {new Date().getFullYear()} Clinovara. Made for clinics that would rather look after patients than the phone.</div>
      </footer>
    </div>
  );
}
