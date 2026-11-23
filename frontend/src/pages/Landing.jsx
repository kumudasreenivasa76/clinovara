import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  IconCheck, IconArrowRight, IconMessages, IconCalendarEvent, IconDeviceTablet, IconStethoscope, IconSpeakerphone, IconChartBar,
  IconShieldCheck, IconLanguage, IconClock, IconMenu2, IconX, IconPlus, IconUsers, IconBuildingStore, IconReceipt2, IconClipboardText,
  IconDeviceTv, IconDental, IconListDetails, IconWorld, IconPhoneCall, IconBellRinging, IconBrandWhatsapp, IconUser, IconBuilding,
  IconMail, IconPhone, IconMapPin, IconChevronRight, IconApi, IconWebhook, IconFileSpreadsheet, IconCalendarShare, IconId,
  IconMessageCircle, IconBulb, IconChevronLeft, IconCurrencyRupee, IconMoon, IconPhoneX, IconCalendarCheck, IconReceiptRupee, IconBuildings,
} from '@tabler/icons-react';
import { get, post } from '../lib/api.js';
import { SUPPORT_EMAIL } from './Legal.jsx';
import '../site.css';

// ── Clinovara marketing site ───────────────────────────────────────────────────
// Same layout and visual language as the shivakr/clinovara website (white-and-blue, glossy cards, animated multilingual
// call, ROI calculator, platform grid, illustrated steps), carrying everything this product's previous site and README
// describe: product tour, roles, a sample day, the first-month plan, the demo-call booking with real slots, pricing and FAQ.
// Demo bookings post to /api/leads/demo (slots from /api/leads/slots).

const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
const lakh = (n) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} crore` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} lakh` : inr(n));
const I = (Icon, size = 22) => <Icon size={size} stroke={1.8} />;

export default function Landing() {
  const [booking, setBooking] = useState(null); // { plan?, source, roi? }
  const open = (source, plan, roi) => setBooking({ source, plan, roi });
  return (
    <div className="cv">
      <Nav onDemo={() => open('nav')} />
      <Hero onDemo={() => open('hero')} />
      <Strip />
      <Problem />
      <FrontDesk />
      <Product />
      <RoiCalculator onDemo={(roi) => open('roi', undefined, roi)} />
      <Platform />
      <Roles />
      <SampleDay />
      <HowItWorks />
      <DemoSection />
      <Pricing onPick={(plan) => open('pricing', plan)} />
      <Faq />
      <CtaBand onDemo={() => open('cta')} />
      <Footer onDemo={() => open('footer')} />
      {booking && <BookingModal {...booking} onClose={() => setBooking(null)} />}
    </div>
  );
}

// ── primitives ─────────────────────────────────────────────────────────────────
const Logo = ({ white }) => <img src={white ? '/brand/clinovara-logo-white.svg' : '/brand/clinovara-logo.svg'} alt="Clinovara" className="cv-logo" />;
const Em = ({ children }) => <span className="cv-em">{children}</span>;
const Blob = ({ style, className = '' }) => <div aria-hidden className={`cv-blob ${className}`} style={style} />;
function Sparkle({ style }) {
  return <svg viewBox="0 0 24 24" className="cv-sparkle" style={style} aria-hidden><path d="M12 2l1.7 6.1L20 10l-6.3 1.9L12 18l-1.7-6.1L4 10l6.3-1.9z" /></svg>;
}
function Ico({ icon, size = 'md', className = '' }) {
  return <div className={`cv-ico ${size === 'md' ? '' : size} ${className}`}>{I(icon, size === 'xs' ? 18 : size === 'sm' ? 20 : 24)}</div>;
}
function Check({ items }) {
  return <ul className="cv-check">{items.map((p) => <li key={String(p)}><IconCheck size={16} stroke={2.5} />{Array.isArray(p) ? <span><b>{p[0]}:</b> {p[1]}</span> : p}</li>)}</ul>;
}

function useInView() {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setInView(true); return undefined; }
    const ob = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); ob.disconnect(); } }, { threshold: 0.15 });
    ob.observe(el);
    return () => ob.disconnect();
  }, []);
  return { ref, inView };
}
function Reveal({ children, delay = 0, className = '' }) {
  const { ref, inView } = useInView();
  return <div ref={ref} className={`cv-reveal ${inView ? 'in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
}
function CountNum({ value, prefix = '', suffix = '' }) {
  const { ref, inView } = useInView();
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!inView) return undefined;
    let raf = 0; const t0 = performance.now();
    const tick = (t) => { const p = Math.max(0, Math.min(1, (t - t0) / 1300)); setV(value * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value]);
  return <span ref={ref}>{prefix}{Math.round(v).toLocaleString('en-IN')}{suffix}</span>;
}

function Section({ id, eyebrow, title, sub, children, tint, center }) {
  return (
    <section id={id} className={`cv-sec ${tint ? 'tint' : ''}`}>
      <div className="cv-wrap">
        <div className={`cv-head ${center ? 'center' : ''}`}>
          {eyebrow && <span className="cv-eyebrow">{eyebrow}</span>}
          <h2 className="cv-h2">{title}</h2>
          {sub && <p className="cv-sub">{sub}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

// ── nav ────────────────────────────────────────────────────────────────────────
const NAV = [['frontdesk', 'Product'], ['platform', 'Solutions'], ['how', 'How it works'], ['roi', 'ROI'], ['pricing', 'Pricing']];
function Nav({ onDemo }) {
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  useEffect(() => { const f = () => setScrolled(window.scrollY > 10); f(); window.addEventListener('scroll', f, { passive: true }); return () => window.removeEventListener('scroll', f); }, []);
  const jump = (id) => { setMenu(false); go(id); };
  return (
    <header className={`cv-nav ${scrolled ? 'scrolled' : ''} ${menu ? 'open' : ''}`}>
      <div className="cv-wrap cv-nav-in">
        <a href="#/" onClick={(e) => { e.preventDefault(); setMenu(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }} aria-label="Clinovara home"><Logo /></a>
        <nav className="cv-links">{NAV.map(([id, l]) => <button key={id} onClick={() => jump(id)}>{l}</button>)}</nav>
        <div className="cv-nav-cta">
          <a href="#/login" className="cv-login cv-hide-sm">Log in</a>
          <button onClick={onDemo} className="cv-btn primary cv-shine cv-hide-sm">Book a demo</button>
          <button className="cv-burger" aria-label={menu ? 'Close menu' : 'Open menu'} aria-expanded={menu} onClick={() => setMenu(!menu)}>{menu ? <IconX size={22} /> : <IconMenu2 size={22} />}</button>
        </div>
      </div>
      {menu && (
        <div className="cv-mnav">
          {NAV.map(([id, l]) => <button key={id} onClick={() => jump(id)}>{l}</button>)}
          <button onClick={() => jump('faq')}>FAQ</button>
          <div className="cv-mnav-cta">
            <button className="cv-btn primary block" onClick={() => { setMenu(false); onDemo(); }}>Book a demo</button>
            <a href="#/signup" className="cv-btn ghost block">Start 30-day free trial</a>
            <a href="#/login" className="cv-btn text block">Log in</a>
          </div>
        </div>
      )}
    </header>
  );
}

// ── hero ───────────────────────────────────────────────────────────────────────
function Hero({ onDemo }) {
  return (
    <section className="cv-hero">
      <div className="cv-aurora" />
      <Blob className="cv-drift" style={{ right: '-8rem', top: '-6rem', width: '32rem', height: '32rem', background: 'rgba(191,219,254,.4)' }} />
      <Blob className="cv-drift2" style={{ left: '-10rem', top: '10rem', width: '28rem', height: '28rem', background: 'rgba(186,230,253,.4)' }} />
      <div className="cv-dots" />
      <div className="cv-wrap cv-hero-in">
        <div>
          <span className="cv-pill cv-glass"><span className="cv-pulse" /> Smart Practice Management for Modern Dentistry</span>
          <h1 className="cv-h1 cv-h1-lines"><span className="l1">Every call answered.</span> <span className="l1 blue">Every patient cared for.</span></h1>
          <p className="cv-hero-lead">Calls, bookings and follow-ups: seamlessly managed in one platform.</p>
          <div className="cv-cta-row">
            <a href="#/signup" className="cv-btn primary lg cv-shine">Start Your 30-Day Free Trial</a>
            <button onClick={onDemo} className="cv-btn ghost lg">Book a Demo →</button>
          </div>
          <div className="cv-assure"><span><IconCheck size={15} stroke={2.5} />No card required</span><span><IconCheck size={15} stroke={2.5} />10-minute setup</span><span><IconCheck size={15} stroke={2.5} />DPDP-ready consent</span></div>
          <div className="cv-langs">
            <strong>Speaks 18+ Indian languages</strong>
            <div>{['English', 'हिन्दी', 'ಕನ್ನಡ', 'తెలుగు', 'தமிழ்'].map((l) => <b key={l}>{l}</b>)}<span>+ 13 more</span></div>
          </div>
          <a href="#/login?demo=1" className="cv-try">Explore the Demo Clinic <IconArrowRight size={15} /></a>
        </div>
        <HeroMock />
      </div>
    </section>
  );
}

function ToothMascot() {
  return (
    <svg viewBox="0 0 64 64" className="cv-mascot cv-float-slow" aria-hidden>
      <defs>
        <linearGradient id="cvToothFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#dbeafe" /></linearGradient>
        <linearGradient id="cvToothRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#60a5fa" /><stop offset="1" stopColor="#2563eb" /></linearGradient>
      </defs>
      <ellipse cx="32" cy="58" rx="15" ry="3" fill="#2563eb" opacity="0.12" />
      <path d="M32 9c-11 0-17 4-17 16 0 11 3 19 6 27 1.3 4 7 4 8-1l2-11c.5-3 3.5-3 4 0l2 11c1 5 6.7 5 8 1 3-8 6-16 6-27 0-12-6-16-17-16z" fill="url(#cvToothFill)" stroke="url(#cvToothRing)" strokeWidth="3" strokeLinejoin="round" />
      <path d="M24 23c3-2 13-2 16 0" stroke="#93c5fd" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <ellipse cx="25" cy="22" rx="2.6" ry="4" fill="#ffffff" opacity="0.85" />
    </svg>
  );
}

function HeroMock() {
  return (
    <div className="cv-mock">
      <Blob style={{ inset: '2rem 2rem 3.5rem', background: 'rgba(191,219,254,.35)' }} />
      <ToothMascot />
      <Sparkle style={{ right: 24, top: 8, width: 24, height: 24, color: 'var(--b300)' }} />
      <Sparkle style={{ left: -8, bottom: 80, width: 20, height: 20, color: 'var(--b200)' }} />
      <div className="cv-chip sm cv-glass cv-float" style={{ right: -6, top: 6, animationDelay: '.9s' }}>
        <span className="ic" style={{ background: 'linear-gradient(135deg,#34d399,#059669)' }}><IconBrandWhatsapp size={14} /></span>
        <div><div className="t1">WhatsApp sent</div><div className="t2">Reminder · 24h before</div></div>
      </div>
      <div className="cv-chatcard cv-float"><HeroChat /></div>
      <div className="cv-chip cv-metric cv-glass cv-float" style={{ bottom: 0, left: -8, animationDelay: '1.5s' }}>
        <div className="t2">Calls handled automatically</div>
        <div className="row"><span className="big"><CountNum value={92} suffix="%" /></span><span className="t2">today</span></div>
        <div className="cv-meter" role="img" aria-label="92 percent"><i style={{ width: '92%' }} /></div>
      </div>
    </div>
  );
}

// The assistant answers in the caller’s language — the demo cycles through Kannada, Telugu, Hindi, Tamil and English.
const CONVOS = [
  { lang: 'Kannada · ಕನ್ನಡ', msgs: [['patient', 'ಕ್ಲೀನಿಂಗ್‌ಗೆ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಬೇಕು'], ['ai', <>ನಮಸ್ಕಾರ! ಸೋಮವಾರ <b>10:30 AM</b> ಸ್ಲಾಟ್ ಇದೆ, ಬುಕ್ ಮಾಡ್ಲಾ?</>], ['patient', 'ಹೌದು, ಬುಕ್ ಮಾಡಿ']] },
  { lang: 'Telugu · తెలుగు', msgs: [['patient', 'క్లీనింగ్ అపాయింట్‌మెంట్ కావాలి'], ['ai', <>నమస్కారం! సోమవారం <b>10:30 AM</b> స్లాట్ ఉంది, బుక్ చేయనా?</>], ['patient', 'అవును, బుక్ చేయండి']] },
  { lang: 'Hindi · हिन्दी', msgs: [['patient', 'क्लीनिंग का अपॉइंटमेंट चाहिए'], ['ai', <>नमस्ते! सोमवार <b>10:30 AM</b> का स्लॉट खाली है, बुक कर दूँ?</>], ['patient', 'हाँ, बुक कर दीजिए']] },
  { lang: 'Tamil · தமிழ்', msgs: [['patient', 'கிளீனிங் அப்பாயின்ட்மென்ட் வேணும்'], ['ai', <>வணக்கம்! திங்கள் <b>10:30 AM</b> ஸ்லாட் இருக்கு, புக் பண்ணட்டுமா?</>], ['patient', 'ஆமா, புக் பண்ணுங்க']] },
  { lang: 'English', msgs: [['patient', 'I need a cleaning appointment'], ['ai', <>Hello! There’s a <b>10:30 AM</b> slot on Monday, shall I book it?</>], ['patient', 'Yes, please book it']] },
];
function HeroChat() {
  const [ci, setCi] = useState(0);
  const [shown, setShown] = useState(0); // messages visible; one past the last message = booking confirmed
  useEffect(() => {
    const timers = []; let convo = 0;
    function play() {
      setCi(convo); setShown(0);
      const n = CONVOS[convo].msgs.length; let d = 350;
      for (let i = 1; i <= n + 1; i++) { const k = i; timers.push(setTimeout(() => setShown(k), d)); d += 600; }
      timers.push(setTimeout(() => { convo = (convo + 1) % CONVOS.length; play(); }, d + 3600));
    }
    play();
    return () => timers.forEach(clearTimeout);
  }, []);
  const msgs = CONVOS[ci].msgs; const done = shown > msgs.length;
  return (
    <>
      <div className="cv-chat-head"><div className="l"><img src="/brand/clinovara-mark.svg" alt="" />Incoming call · {CONVOS[ci].lang}</div><span className="cv-live">● Live</span></div>
      <div className="cv-chat-body">
        {msgs.slice(0, shown).map(([who, node], i) => <div key={`${ci}-${i}`} className={`cv-bub cv-pop ${who}`}><div>{node}</div></div>)}
      </div>
      <div key={`${ci}-${done}`} className={`cv-booked ${done ? 'cv-pop' : ''}`} style={{ opacity: done ? 1 : 0 }}>
        <span className="ok"><IconCheck size={14} stroke={3} /></span>
        <div>
          <div className="r1"><span>Appointment confirmed</span><span>Mon · 10:30 AM</span></div>
          <div className="r2">Cleaning &amp; check-up · Dr. Ananya Rao</div>
        </div>
      </div>
    </>
  );
}

function Strip() {
  const items = ['₹ Pricing & GST Billing', 'UPI Payments', 'WhatsApp-First', 'DPDP-Ready Consent', 'ABHA-Ready', 'PM-JAY, CGHS & ESI Support'];
  return (
    <section className="cv-strip">
      <div className="cv-wrap"><strong>Designed for Indian Dental Clinics</strong>{items.map((x) => <React.Fragment key={x}><span className="dot" /><span>{x}</span></React.Fragment>)}</div>
    </section>
  );
}

// ── problem ────────────────────────────────────────────────────────────────────
function Problem() {
  const stats = [
    { label: 'Missed calls', big: 'Missed patients', small: 'Calls go unanswered when front desks get busy.', icon: IconPhoneX },
    { label: 'After-hours enquiries', big: '24/7', small: 'Patients call even when your clinic is closed.', icon: IconMoon },
    { label: 'Lost revenue', big: '₹1,000s', small: 'In potential bookings lost to missed calls.', icon: IconCurrencyRupee },
  ];
  return (
    <Section id="problem" eyebrow="The problem" center title={<><span className="l1">Your front desk can’t be everywhere.</span> <Em>Clinovara can.</Em></>} sub={<><span className="l1">Calls come in during treatments, lunch breaks and after closing.</span> <span className="l1">Every missed call could mean a patient lost to another clinic.</span></>}>
      <div className="cv-grid sm3 cv-probs">
        {stats.map((s, i) => (
          <Reveal key={s.label} delay={i * 110}>
            <div className="cv-card hover cv-prob">
              <div className="ic">{I(s.icon, 24)}</div>
              <div className="lab">{s.label}</div>
              <div className="num">{s.big}</div>
              <p>{s.small}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

// ── AI front desk ──────────────────────────────────────────────────────────────
const FRONT_DESK = [
  [IconLanguage, 'Speaks Like a Local', '22 Indian languages plus English. Understands Hinglish and Kanglish.'],
  [IconMessages, 'One Platform. Every Channel.', 'WhatsApp, phone, SMS and website chat, all connected.'],
  [IconCalendarEvent, 'Smart Appointment Booking', 'Live dentist availability, branch schedules and accurate procedure fees.'],
  [IconShieldCheck, 'Dentist First Escalation', 'Medical questions and urgent concerns go directly to your dental team.'],
  [IconPhoneCall, 'Never Misses a Call', 'After hours enquiries, missed calls and cancellations handled automatically.'],
  [IconBellRinging, 'Patient Follow Ups', 'Reminders, recalls, rebookings and post visit check ins.'],
];
function FrontDesk() {
  return (
    <Section id="frontdesk" eyebrow="Always on front desk" title={<>A front desk that <Em>never clocks off</Em>.</>} sub="Calls, bookings and messages, in your patient’s language.">
      <div className="cv-grid md2 lg3">
        {FRONT_DESK.map(([icon, t, d], i) => (
          <Reveal key={t} delay={(i % 3) * 90}>
            <div className="cv-card hover cv-shine"><Ico icon={icon} className="grow" /><h3>{t}</h3><p>{d}</p></div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

// ── product tour ───────────────────────────────────────────────────────────────
const FEATURES = [
  { eyebrow: 'Front Desk AI', icon: IconMessageCircle, title: 'Your AI receptionist.', text: 'Answers calls, WhatsApp and website enquiries, speaks every patient’s language and books appointments.', points: [['Smart bookings', 'Real-time availability.'], ['Instant answers', 'Fees, timings and services.'], ['Human handoff', 'Clinical concerns to your team.']], visual: 'chat' },
  { eyebrow: 'Check-in and queue', icon: IconDeviceTablet, title: 'A waiting room that runs itself.', text: 'Patients check in at a kiosk with their mobile number, ABHA or name and date of birth, get a token, and see it called on the waiting-room display. Your team sees who is waiting and for how long.', points: ['Kiosk check-in with pre-visit forms, insurance and consent', 'Token display with a chime and a spoken call', 'Live queue per dentist, payment collected at the desk'], visual: 'board' },
  { eyebrow: 'Dentist Workspace', icon: IconStethoscope, title: 'Dentists walk in prepared.', text: 'Medical alerts, patient history, medications and visit notes, all in one view. Complete visits, create treatment plans and send aftercare in minutes.', points: ['Patient history and medical alerts at a glance', 'Treatment plans and follow-up recommendations', 'Aftercare messages in the patient’s language', 'Visit records ready for your EHR'], visual: 'dentist' },
  { eyebrow: 'Growth & Marketing', icon: IconSpeakerphone, title: 'Win patients back.', text: 'Automate recalls, review requests, festive greetings and win-back campaigns. Approve every message and track the bookings and revenue it generates.', points: ['AI-drafted campaigns', 'Owner approval before sending', 'Track bookings and collections', 'Identify your best-performing campaigns'], visual: 'growth' },
];
function Win({ title, children }) {
  return <div className="cv-win"><div className="cv-win-bar"><i /><i /><i /><span>{title}</span></div><div className="cv-win-body">{children}</div></div>;
}
function Visual({ kind }) {
  if (kind === 'chat') return (
    <Win title="Your clinic website">
      <div className="mk-chat">
        <div className="cv-bub patient"><div>Can I book a cleaning for Saturday morning?</div></div>
        <div className="cv-bub ai"><div>Yes. A cleaning and check-up takes about 45 minutes and is ₹1,500. I have Sat 9:00 am or 11:00 am with Dr. Menon.</div></div>
        <div className="cv-bub patient"><div>The first one please</div></div>
        <div className="cv-bub ai"><div>Booked for Saturday at 9:00 am A form link is on its way to your phone.</div></div>
      </div>
    </Win>
  );
  if (kind === 'board') return (
    <Win title="Waiting-room display">
      <div className="mk-board">
        <div className="cv-gridbg" />
        <div style={{ position: 'relative' }}>
          <div className="lbl">Now calling</div>
          <div className="calling"><span className="tok">A02</span><div className="who"><b>Dr. Vikram Menon · Chair 2</b>Rohan, please come in</div></div>
          <div className="wait"><div className="lbl">Waiting</div><div><i>A03</i><i>A04</i><i>A05</i></div></div>
        </div>
      </div>
    </Win>
  );
  if (kind === 'dentist') return (
    <Win title="Patient preview · Dr. Menon">
      <div className="mk-dent">
        <small>NEXT PATIENT · A02</small>
        <div className="name">Rohan Patil <span>46 years</span></div>
        <dl className="facts">
          <div><dt>Chief concern</dt><dd>Lower-left molar pain</dd></div>
          <div className="warn"><dt>Medical alert</dt><dd>High blood pressure</dd></div>
          <div className="bad"><dt>Allergy</dt><dd>Penicillin</dd></div>
          <div><dt>Medication</dt><dd>Telmisartan 40 mg</dd></div>
        </dl>
      </div>
    </Win>
  );
  return (
    <Win title="Marketing dashboard">
      <div className="mk-grow">
        <div className="tiles"><div><small>Messages sent</small><b>89</b></div><div><small>Bookings</small><b>28</b></div><div><small>Collected</small><b>₹55,900</b></div></div>
        <table><tbody>
          <tr><td>Cleaning reminder</td><td>18 sent</td><td>9 bookings</td></tr>
          <tr><td>Win back inactive</td><td>22 sent</td><td>15 bookings</td></tr>
          <tr><td>Whitening offer</td><td>26 sent</td><td>16 bookings</td></tr>
        </tbody></table>
        <div className="ok"><IconShieldCheck size={15} /> Every message approved by an owner before it is sent</div>
      </div>
    </Win>
  );
}
function Product() {
  return (
    <Section id="product" tint eyebrow="The product" title={<>Every patient. Every interaction. <Em>Connected.</Em></>} sub={<>One platform managing the entire patient journey from first contact to <span className="nw">follow-up.</span></>}>
      {FEATURES.map((f, i) => (
        <div key={f.eyebrow} className={`cv-feature ${i % 2 ? 'flip' : ''}`}>
          <Reveal className="copy">
            <Ico icon={f.icon} size="sm" />
            <span className="tag">{f.eyebrow}</span>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
            <Check items={f.points} />
          </Reveal>
          <Reveal delay={120}><Visual kind={f.visual} /></Reveal>
        </div>
      ))}
      <div className="cv-built">
        <span className="cv-eyebrow">Built for your clinic</span>
        <h3>All you need. <Em>One platform.</Em></h3>
      </div>
      <div className="cv-builtgrid">
        {[
          [IconCalendarCheck, 'sky', 'Online Booking', 'Let patients book around your dentists’ availability and clinic hours.'],
          [IconReceiptRupee, 'green', 'Payments & Receipts', 'Record UPI, cash and card payments with digital receipts.'],
          [IconLanguage, 'violet', 'Multilingual Experience', 'English, Hindi and Kannada across screens, forms and messages.'],
          [IconBuildings, 'amber', 'Multi-Branch Management', 'Manage schedules, queues, staff and performance across locations.'],
        ].map(([Icon, tone, h, t], i) => (
          <Reveal key={h} delay={i * 90}>
            <div className={`cv-builtcard ${tone}`}>
              <div className="ic"><Icon size={28} stroke={1.7} /></div>
              <h4>{h}</h4>
              <p>{t}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

// ── ROI calculator ─────────────────────────────────────────────────────────────
function RoiCalculator({ onDemo }) {
  const [missed, setMissed] = useState(8);
  const [value, setValue] = useState(1200);
  const [after, setAfter] = useState(12);
  const [appts, setAppts] = useState(18);
  const [waste, setWaste] = useState(20);
  const WORK_DAYS = 26; const WEEKS = 4.33; const CONV = 0.4; const APPT_MIN = 30; const FILL = 0.5;
  const missedRev = missed * WORK_DAYS * CONV * value;
  const afterRev = after * WEEKS * CONV * value;
  const scheduleRev = (waste * appts * WORK_DAYS) / APPT_MIN * value * FILL;
  const total = missedRev + afterRev + scheduleRev;
  const sliders = [
    { label: 'Calls you miss per day', v: missed, set: setMissed, min: 0, max: 30, step: 1, fmt: (n) => `${n}` },
    { label: 'Average appointment value', v: value, set: setValue, min: 300, max: 5000, step: 100, fmt: inr },
    { label: 'After-hours enquiries per week', v: after, set: setAfter, min: 0, max: 50, step: 1, fmt: (n) => `${n}` },
    { label: 'Appointments per day', v: appts, set: setAppts, min: 4, max: 40, step: 1, fmt: (n) => `${n}` },
    { label: 'Minutes wasted per appointment', v: waste, set: setWaste, min: 0, max: 40, step: 5, fmt: (n) => `${n} min` },
  ];
  const breakdown = [
    ['Missed calls recovered', missedRev],
    ['After-hours bookings captured', afterRev],
    ['Chair time reclaimed', scheduleRev],
  ];
  const pct = (s) => ((s.v - s.min) / (s.max - s.min)) * 100;
  return (
    <Section id="roi" eyebrow="ROI calculator" title={<>What missed calls <Em>cost you</Em>.</>} sub="Move the sliders to see what your clinic could recover each month.">
      <div className="cv-roi">
        <Reveal className="cv-card pad">
          <div className="cv-roi-in">
            {sliders.map((s) => (
              <div key={s.label} className="cv-roi-row">
                <div className="top"><label htmlFor={`roi-${s.label}`}>{s.label}</label><span className="val">{s.fmt(s.v)}</span></div>
                <input id={`roi-${s.label}`} type="range" className="cv-range" min={s.min} max={s.max} step={s.step} value={s.v} onChange={(e) => s.set(Number(e.target.value))} style={{ background: `linear-gradient(to right, #2563eb ${pct(s)}%, #e2e8f0 ${pct(s)}%)` }} />
              </div>
            ))}
          </div>
          <p className="cv-fine">Illustrative estimate based on your inputs and assumed conversion rates. Actual results vary.</p>
        </Reveal>
        <Reveal delay={120}>
          <div className="cv-bluecard">
            <div className="cv-gridbg" style={{ opacity: 0.25 }} />
            <Sparkle style={{ right: 24, top: 24, width: 28, height: 28, color: 'rgba(255,255,255,.3)' }} />
            <div className="in">
              <p className="k">Estimated additional revenue</p>
              <div className="total">{inr(total)}<small> / month</small></div>
              <p className="yr">Approximately <b>{lakh(total * 12)}</b> annually.</p>
              <div className="rows"><p className="rk">Your clinic’s potential</p>{breakdown.map(([l, a]) => <div key={l}><div><b>{l}</b></div><div className="amt">{inr(a)}<small>/mo</small></div></div>)}</div>
              <button onClick={() => onDemo({ total, rows: breakdown })} className="cv-btn white block lg cv-shine" style={{ marginTop: 24 }}>See what Clinovara can recover →</button>
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

// ── platform ───────────────────────────────────────────────────────────────────
const PLATFORM = [
  [IconMessages, 'AI Front Desk', 'Answers calls, WhatsApp and website enquiries. Books appointments automatically.'],
  [IconCalendarEvent, 'Smart Scheduling', 'Manages dentists, chairs, availability and appointments.'],
  [IconClipboardText, 'Patient Management', 'Digital forms, medical history, check-ins and treatment records.'],
  [IconStethoscope, 'Dentist Workspace', 'Patient alerts, clinical notes, treatment plans and follow-ups.'],
  [IconReceiptRupee, 'Payments & Operations', 'Manage fees, payments, receipts and daily clinic activity.'],
  [IconSpeakerphone, 'AI Marketing & Insights', 'Automate recalls, reviews and campaigns. Track bookings and revenue.'],
];
const CONNECT = [
  { group: 'Health records', icon: IconClipboardText, items: [[IconApi, 'FHIR R4'], [IconClipboardText, 'EHR Export'], [IconId, 'ABHA']] },
  { group: 'Patient messaging', icon: IconMessages, items: [[IconBrandWhatsapp, 'WhatsApp Business'], [IconMessageCircle, 'SMS']] },
  { group: 'Calendars', icon: IconCalendarShare, items: [[IconCalendarEvent, 'Google Calendar'], [IconMail, 'Outlook']] },
  { group: 'Data & automation', icon: IconWebhook, items: [[IconFileSpreadsheet, 'CSV'], [IconWebhook, 'Signed Webhooks']] },
];
function Platform() {
  return (
    <Section id="platform" tint eyebrow="The platform" title={<>Your whole clinic. <Em>Connected.</Em></>} sub="From first enquiry to final follow-up.">
      <div className="cv-grid sm2 lg3 cv-platgrid">
        {PLATFORM.map(([icon, t, d], i) => (
          <Reveal key={t} delay={(i % 3) * 80}>
            <div className="cv-glasscard"><Ico icon={icon} size="sm" /><h3>{t}</h3><p>{d}</p></div>
          </Reveal>
        ))}
      </div>
      <Reveal className="cv-links2">
        <div className="hd"><span className="line" /><b>Connects with your existing tools</b><span className="line" /></div>
        <div className="groups">
          {CONNECT.map((g) => (
            <div key={g.group} className="grp">
              <span className="cap">{I(g.icon, 14)}{g.group}</span>
              <div className="items">{g.items.map(([icon, t]) => <span key={t}><i>{I(icon, 17)}</i>{t}</span>)}</div>
            </div>
          ))}
        </div>
      </Reveal>
    </Section>
  );
}

// ── roles ──────────────────────────────────────────────────────────────────────
const ROLES = [
  { label: 'Owner', icon: IconChartBar, text: 'Revenue, performance, approvals and branch-wide insights.' },
  { label: 'Front Desk', icon: IconUsers, text: 'Appointments, check-ins, payments and patient communication.' },
  { label: 'Dentist', icon: IconStethoscope, text: 'Patient history, medical alerts, treatment plans and clinical notes.' },
];
function Roles() {
  return (
    <Section id="roles" center eyebrow="Designed for every role" title={<>One platform. <Em>Every team member.</Em></>}>
      <div className="cv-grid md3 cv-roles">
        {ROLES.map((r, i) => (
          <Reveal key={r.label} delay={i * 110}>
            <div className="cv-card hover cv-rolecard"><div className="ic">{I(r.icon, 26)}</div><h3>{r.label}</h3><p>{r.text}</p></div>
          </Reveal>
        ))}
      </div>
      <p className="cv-rolenote">Everyone gets the tools they need, without unnecessary access. <a href="#/login?demo=1">See each view in the demo clinic <IconArrowRight size={15} /></a></p>
    </Section>
  );
}

// ── a sample day ───────────────────────────────────────────────────────────────
const DAY = [
  ['08:41', 'A patient books through WhatsApp.', IconBrandWhatsapp, 'Booking'],
  ['08:52', 'Rohan checks in using the kiosk.', IconDeviceTablet, 'Check-in'],
  ['09:04', 'The dentist reviews his medical alerts.', IconStethoscope, 'Clinical'],
  ['10:30', 'A medication question is escalated to the dentist.', IconShieldCheck, 'Escalation'],
  ['13:10', 'A UPI payment generates a digital receipt.', IconReceiptRupee, 'Payment'],
  ['15:20', 'A follow-up message is approved and sent.', IconBellRinging, 'Follow-up'],
];
/** How far the reader has scrolled through an element, 0 to 1, measured against a line 60% down the screen. */
function useScrollProgress() {
  const ref = useRef(null);
  const [p, setP] = useState(0);
  useEffect(() => {
    let raf = 0;
    const measure = () => { raf = 0; const el = ref.current; if (!el) return; const r = el.getBoundingClientRect(); setP(Math.max(0, Math.min(1, (window.innerHeight * 0.6 - r.top) / r.height))); };
    const on = () => { if (!raf) raf = requestAnimationFrame(measure); };
    measure();
    window.addEventListener('scroll', on, { passive: true }); window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); cancelAnimationFrame(raf); };
  }, []);
  return [ref, p];
}
function SampleDay() {
  const [ref, p] = useScrollProgress();
  const reached = (i) => p >= (i + 0.5) / DAY.length;
  return (
    <section className="cv-sec tint">
      <div className="cv-wrap cv-day">
        <div className="cv-head cv-day-head">
          <span className="cv-eyebrow">A day with Clinovara</span>
          <h2 className="cv-h2">Less admin. <Em>More care.</Em></h2>
          <p className="cv-sub">Every interaction connected. Nothing forgotten.</p>
          <div className="cv-day-count"><b>{DAY.filter((_, i) => reached(i)).length}</b><span>of {DAY.length} moments handled<br />without a phone call or a sticky note</span></div>
        </div>
        <div className="cv-tl" ref={ref}>
          <div className="rail"><i style={{ height: `${p * 100}%` }} /></div>
          {DAY.map(([t, text, Icon, tag], i) => (
            <div key={t} className={`ev ${reached(i) ? 'on' : ''}`}>
              <span className="dot"><Icon size={18} stroke={1.9} /></span>
              <div className="card"><div className="meta"><span className="t">{t}</span><span className="tag">{tag}</span></div><b>{text}</b></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── how it works ───────────────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    ['Set up', 'Add your clinic, services, dentists and working hours.', IconBuilding],
    ['Import', 'Upload patient records and invite your team.', IconUsers],
    ['Go live', 'Activate your AI assistant, kiosk and booking page.', IconBellRinging],
    ['Engage', 'Launch recalls, reviews and patient follow-ups.', IconSpeakerphone],
    ['Grow', 'Track performance and optimize your practice.', IconChartBar],
  ];
  return (
    <Section id="how" eyebrow="Getting started" center title={<>Live <Em>in days</Em>.</>}>
      <div className="cv-track">
        <div className="bar" />
        {steps.map(([t, d, Icon], i) => (
          <Reveal key={t} delay={i * 90}>
            <div className="cv-trackstep">
              <span className="ghost">0{i + 1}</span>
              <div className="node"><Icon size={26} stroke={1.8} /><em>{i + 1}</em></div>
              <span className="lbl">Step 0{i + 1}</span>
              <h3>{t}</h3>
              <p>{d}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

// ── demo call booking (real slots from /api/leads/slots) ───────────────────────
const FALLBACK_AGENDA = [
  ['5 min', 'Your clinic today', 'How patients book, check in and get reminded now, and where time is lost.'],
  ['10 min', 'Live walkthrough', 'A patient message becomes a booking, the kiosk check-in, the dentist’s screen, and payment.'],
  ['5 min', 'Growth and marketing', 'Recall reminders, review requests and what each campaign led to, with an owner approving every message.'],
  ['5 min', 'Setup and pricing', 'Importing your patients, going live in about ten minutes, and what it costs for a clinic your size.'],
  ['5 min', 'Your questions', 'Data protection, WhatsApp, your current software and anything else.'],
];
let slotsCache = null;
function useSlots() {
  const [meta, setMeta] = useState(slotsCache);
  const load = () => get('/api/leads/slots').then((m) => { slotsCache = m; setMeta(m); return m; }).catch(() => { const f = { slots: [], agenda: FALLBACK_AGENDA, sizes: [], failed: true }; setMeta(f); return f; });
  useEffect(() => { if (!slotsCache) load(); }, []); // eslint-disable-line
  return [meta, load];
}
const dayOf = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const dayLabel = (d) => { const x = new Date(`${d}T12:00:00Z`); return { w: x.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' }), d: x.getUTCDate(), m: x.toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' }) }; };
const clock = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const longWhen = (iso) => new Date(iso).toLocaleString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

const EMPTY = { name: '', email: '', clinic: '', phone: '', message: '' };
function Field({ label, icon, wide, optional, children }) {
  return <label className={`cv-field ${wide ? 'wide' : ''}`}><span>{label}{optional && <em>optional</em>}</span><div className="ctl">{icon && I(icon, 16)}{children}</div></label>;
}

/** Two-step booking: your details first, then a time. Used inline in the demo section and inside the pop-up. */
function DemoBooking({ source = 'website', plan, note, onClose, title = 'Book your personalized demo' }) {
  const [meta, reload] = useSlots();
  const [day, setDay] = useState('');
  const [slot, setSlot] = useState('');
  const [step, setStep] = useState(1);
  const [f, setF] = useState(() => ({ ...EMPTY, message: plan ? `Interested in the ${plan} plan.` : note || '' }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const days = useMemo(() => [...new Set((meta?.slots || []).map((s) => dayOf(s.start)))], [meta]);
  useEffect(() => { if (!day && meta?.slots?.length) { const first = meta.slots.find((s) => s.available); if (first) setDay(dayOf(first.start)); } }, [meta]); // eslint-disable-line
  const times = (meta?.slots || []).filter((s) => dayOf(s.start) === day);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const noSlots = meta && (meta.failed || !meta.slots.some((s) => s.available));

  function next() {
    if (!f.name.trim()) { setErr('Please add your full name.'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) { setErr('Please enter a valid work email.'); return; }
    if (!f.clinic.trim()) { setErr('Please add your clinic name.'); return; }
    if (f.phone.replace(/\D/g, '').length < 10) { setErr('Please enter a phone number with at least 10 digits.'); return; }
    setErr(''); setStep(2);
  }
  async function submit() {
    if (!slot && !noSlots) { setErr('Please pick a time for the demo.'); return; }
    setBusy(true); setErr('');
    try { setDone({ ...(await post('/api/leads/demo', { ...f, slot: slot || undefined, source })), slot }); slotsCache = null; reload(); }
    catch (e) { setErr(e.message); if (/taken|no longer/.test(e.message)) { setSlot(''); slotsCache = null; reload(); } else if (/name|email|clinic|phone/i.test(e.message)) setStep(1); }
    finally { setBusy(false); }
  }
  function reset() { setDone(null); setSlot(''); setStep(1); setF({ ...EMPTY }); }

  if (done) return (
    <div className="cv-book cv-pop">
      <div className="cv-done">
        <div className="tick"><IconCheck size={30} stroke={2.5} /></div>
        <h3>Your demo is booked.</h3>
        <p className="m">{done.confirmedByEmail ? <>A confirmation is on its way to <b>{f.email}</b>.</> : <>We will email <b>{f.email}</b> the joining link before the call.</>}</p>
        <dl className="cv-appt">
          <div><dt>{I(IconCalendarEvent, 16)}When</dt><dd>{done.slot ? <>{longWhen(done.slot)} IST</> : done.when || 'We will email you to agree a time'}</dd></div>
          <div><dt>{I(IconClock, 16)}Length</dt><dd>30 minutes, by video</dd></div>
          <div><dt>{I(IconUser, 16)}For</dt><dd>{f.name} · {f.clinic}</dd></div>
        </dl>
        <div className="cv-actions center">{onClose ? <button onClick={onClose} className="cv-btn soft">Done</button> : <button onClick={reset} className="cv-btn text">Book another demo</button>}</div>
      </div>
    </div>
  );

  return (
    <div className="cv-book">
      <div className="cv-book-hd">
        <div className="top">
          <div><h3>{title}</h3>{plan && <p className="s">{plan} plan</p>}</div>
          {onClose && <button className="cv-x" onClick={onClose} aria-label="Close"><IconX size={18} /></button>}
        </div>
        <div className="cv-stepper">
          <span className={step === 1 ? 'on' : 'past'}><i>{step > 1 ? <IconCheck size={12} stroke={3} /> : 1}</i>Your details</span>
          <span className="bar"><b style={{ width: step > 1 ? '100%' : '0%' }} /></span>
          <span className={step === 2 ? 'on' : ''}><i>2</i>Choose your time</span>
        </div>
      </div>
      <div className="cv-book-bd">
        {err && <div className="cv-err">{err}</div>}
        {step === 1 ? (
          <form onSubmit={(e) => { e.preventDefault(); next(); }} noValidate>
            <div className="cv-form">
              <Field label="Full name" icon={IconUser}><input className="cv-input ic" value={f.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" placeholder="Dr. Ananya Rao" /></Field>
              <Field label="Work email" icon={IconMail}><input type="email" className="cv-input ic" value={f.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" placeholder="you@clinic.com" /></Field>
              <Field label="Clinic name" icon={IconBuilding}><input className="cv-input ic" value={f.clinic} onChange={(e) => set('clinic', e.target.value)} autoComplete="organization" placeholder="Bright Smile Dental" /></Field>
              <Field label="Phone / WhatsApp" icon={IconPhone}><input inputMode="tel" className="cv-input ic" value={f.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" placeholder="+91 98450 12345" /></Field>
              <Field label="What would you like to discuss?" optional wide><textarea className="cv-input" rows={2} value={f.message} onChange={(e) => set('message', e.target.value)} placeholder="Branches, languages you serve, your current software…" /></Field>
            </div>
            <div className="cv-actions"><button type="submit" className="cv-btn soft">Continue to choose a time <IconArrowRight size={16} /></button></div>
            <p className="cv-tiny">{I(IconShieldCheck, 13)} Your information stays private. No obligation.</p>
          </form>
        ) : (
          <>
            {!meta && <p className="cv-tz">Loading times…</p>}
            {meta && noSlots && <div className="cv-err soft">{meta.failed ? 'We could not load times just now.' : 'Every time this fortnight is taken.'} Confirm below and we will email you to agree a time, or write to {SUPPORT_EMAIL}.</div>}
            {meta && !noSlots && <>
              <div className="cv-pick-hd"><b>Select a date</b><span>India Standard Time</span></div>
              <div className="cv-days">{days.map((d) => { const l = dayLabel(d); return <button type="button" key={d} className={d === day ? 'on' : ''} onClick={() => { setDay(d); setSlot(''); }}><small>{l.w}</small><b>{l.d}</b><small>{l.m}</small></button>; })}</div>
              <div className="cv-pick-hd"><b>Select a time</b></div>
              <div className="cv-times">{times.map((s) => <button type="button" key={s.start} disabled={!s.available} className={s.start === slot ? 'on' : ''} onClick={() => { setSlot(s.start); setErr(''); }}>{clock(s.start)}{!s.available && <small>Full</small>}</button>)}</div>
              {slot && <div className="cv-chosen cv-pop"><IconCalendarEvent size={16} /> <span><b>{longWhen(slot)}</b> IST · 30 minutes</span></div>}
            </>}
            <div className="cv-actions">
              <button type="button" onClick={() => { setStep(1); setErr(''); }} className="cv-back"><IconChevronLeft size={16} />Back</button>
              <button type="button" onClick={submit} disabled={busy || !meta} className="cv-btn soft">{busy ? 'Booking…' : 'Confirm demo'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const DEMO_INCLUDES = ['Patient calls and WhatsApp', 'Appointment management', 'Dentist and clinic workflows', 'Setup and pricing'];
function BookingModal({ source, plan, roi, onClose }) {
  useEffect(() => { const k = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  useEffect(() => { const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = prev; }; }, []);
  const note = roi ? `ROI calculator estimate: ${inr(roi.total)} a month.` : undefined;
  return (
    <div className="cv-modal" onClick={onClose} role="dialog" aria-modal="true" aria-label="Book a demo">
      <div className="cv-modal-box split cv-pop" onClick={(e) => e.stopPropagation()}>
        <aside className="cv-modal-side">
          <div className="in">
            <img src="/brand/clinovara-logo-white.svg" alt="Clinovara" className="logo" />
            {roi ? (
              <>
                <p className="k">Your estimate</p>
                <div className="big">{inr(roi.total)}<small> / month</small></div>
                <p className="lead">Let’s walk through how your clinic could recover it.</p>
                <div className="rows">{roi.rows.map(([l, a]) => <div key={l}><span>{l}</span><b>{inr(a)}</b></div>)}</div>
                <p className="fine">Illustrative estimate based on your inputs. Actual results vary.</p>
              </>
            ) : (
              <>
                <p className="k">Personalized demo{plan ? ` · ${plan}` : ''}</p>
                <h3>See Clinovara in action.</h3>
                <p className="lead">A closer look at a smarter dental practice.</p>
              </>
            )}
            <ul className="incl">
              <li className="hd">Your 30-minute walkthrough</li>
              {DEMO_INCLUDES.map((h) => <li key={h}><IconCheck size={14} stroke={3} />{h}</li>)}
            </ul>
          </div>
        </aside>
        <div className="cv-modal-main">
          <DemoBooking source={source} plan={plan} note={note} onClose={onClose} />
        </div>
      </div>
    </div>
  );
}

function DemoSection() {
  return (
    <section id="demo" className="cv-sec">
      <div className="cv-wrap cv-demo2">
        <div className="info">
          <span className="cv-eyebrow">Personalized demo</span>
          <h2 className="cv-h2">See Clinovara <Em>in action</Em>.</h2>
          <p className="tagline">A closer look at a smarter dental practice.</p>
          <p className="cv-sub">Explore how Clinovara manages patient conversations, appointments and clinic operations.</p>
          <div className="walk">
            <span className="cap">{I(IconClock, 15)}Your 30-minute walkthrough</span>
            <ul>{DEMO_INCLUDES.map((h) => <li key={h}><i><IconCheck size={12} stroke={3} /></i>{h}</li>)}</ul>
          </div>
        </div>
        <Reveal delay={100}><DemoBooking source="demo-section" /></Reveal>
      </div>
    </section>
  );
}

// ── pricing ────────────────────────────────────────────────────────────────────
const TIERS = [
  { name: 'Solo', who: 'For independent dentists', points: ['AI receptionist & online bookings', 'Digital patient forms & kiosk', 'Automated reminders & receipts', 'Clinic dashboard'] },
  { name: 'Clinic', who: 'For growing dental practices', featured: 'Most popular', points: ['Everything in Solo', 'Multi-user access & team roles', 'AI-powered marketing campaigns', 'AI call assistant', 'Campaign & revenue insights'] },
  { name: 'Group', who: 'For multi-location practices', sales: true, points: ['Everything in Clinic', 'Centralized branch management', 'Advanced analytics & reporting', 'EHR & FHIR integrations', 'Dedicated onboarding & support'] },
];
function Pricing({ onPick }) {
  return (
    <Section id="pricing" eyebrow="Pricing" center title={<>Simple pricing. <Em>Built around you.</Em></>} sub="30 days free. No credit card.">
      <div className="cv-tiers">
        {TIERS.map((t, i) => (
          <Reveal key={t.name} delay={i * 110}>
            <div className={`cv-tier ${t.featured ? 'hot' : ''}`}>
              {t.featured && <span className="tier-badge">{t.featured}</span>}
              <span className="tier-name">{t.name}</span>
              <p className="who">{t.who}</p>
              <Check items={t.points} />
              <div className="btns">
                {t.sales
                  ? <button onClick={() => onPick(t.name)} className="cv-btn block ghost">Talk to sales →</button>
                  : <a href="#/signup" className={`cv-btn block ${t.featured ? 'primary cv-shine' : 'ghost'}`}>Start 30-day free trial →</a>}
              </div>
            </div>
          </Reveal>
        ))}
      </div>
      <p className="cv-pricenote">All plans include a 30-day free trial. Pricing is tailored to your clinic size and requirements.</p>
    </Section>
  );
}

// ── FAQ ────────────────────────────────────────────────────────────────────────
const FAQ = [
  ['Does Clinovara support Indian languages?', 'Yes. Website and WhatsApp support English, Hindi, Kannada and Hinglish. Voice support includes multiple Indian languages.'],
  ['Can I use my existing clinic software?', 'Yes. Clinovara supports EHR exports, FHIR R4 APIs and data imports.'],
  ['Do patients need an app?', 'No. Patients can interact through WhatsApp, your website and the clinic kiosk.'],
  ['Can I control marketing messages?', 'Yes. Owners approve campaigns before messages are sent.'],
  ['Who can access patient records?', 'Role-based permissions help ensure each team member accesses only the information required for their work.'],
  ['What happens after the free trial?', 'Choose a plan suited to your clinic. Pricing is discussed before you subscribe.'],
  ['Can I manage multiple branches?', 'Yes. Manage appointments, staff, queues and performance across locations.'],
];
function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <Section id="faq" eyebrow="FAQs" title="Questions, answered.">
      <div className="cv-faq">
        {FAQ.map(([q, a], i) => (
          <div key={q} className={open === i ? 'open' : ''}>
            <button onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}><span>{q}</span><span className="pm"><IconPlus size={16} stroke={2.5} /></span></button>
            {open === i && <p className="cv-pop">{a}</p>}
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── CTA + footer ───────────────────────────────────────────────────────────────
function CtaBand({ onDemo }) {
  return (
    <section className="cv-ctaband">
      <div>
        <div className="cv-gridbg" />
        <Blob style={{ left: '-2.5rem', top: '-4rem', width: '18rem', height: '18rem', background: 'rgba(255,255,255,.12)' }} />
        <Blob style={{ right: 0, bottom: '-5rem', width: '20rem', height: '20rem', background: 'rgba(125,211,252,.2)' }} />
        <Sparkle style={{ right: 56, bottom: 36, width: 20, height: 20, color: 'rgba(255,255,255,.18)' }} />
        <div className="in">
          <h2>Better than <span className="hl">a busy phone line.</span></h2>
          <p>Patients book and get answers fast. Your team focuses on care.</p>
          <div className="cv-cta-row">
            <a href="#/signup" className="cv-btn white lg cv-shine">Start Your 30-Day Free Trial →</a>
            <button onClick={onDemo} className="cv-btn outline-white lg">Book a Personalized Demo →</button>
          </div>
          <p className="note">No credit card required · Easy setup · Ready in minutes</p>
        </div>
      </div>
    </section>
  );
}

function Footer({ onDemo }) {
  return (
    <footer className="cv-ft">
      <div className="cv-ft-in">
        <div className="cv-ft-top">
          <div className="ft-brand">
            <img src="/brand/clinovara-logo-white.svg" alt="Clinovara" className="ft-logo" />
            <p className="ft-tag">The AI-powered operating system for dental clinics in India.</p>
            <p className="ft-sub">From first contact to final follow-up, one connected patient experience.</p>
            <a className="ft-mail" href={`mailto:${SUPPORT_EMAIL}`}>{I(IconMail, 16)}{SUPPORT_EMAIL}</a>
          </div>
          <nav className="ft-col" aria-label="Product">
            <b>Product</b>
            <button onClick={() => go('frontdesk')}>AI Front Desk</button>
            <button onClick={() => go('product')}>Dentist Workspace</button>
            <button onClick={() => go('platform')}>Smart Scheduling</button>
            <button onClick={() => go('product')}>Digital Kiosk</button>
            <button onClick={() => go('platform')}>Marketing &amp; Analytics</button>
            <button onClick={() => go('pricing')}>Pricing</button>
          </nav>
          <nav className="ft-col" aria-label="Company">
            <b>Company</b>
            <button onClick={onDemo}>Book a Demo</button>
            <a href={`mailto:${SUPPORT_EMAIL}`}>Contact</a>
            <button onClick={() => go('faq')}>FAQ</button>
          </nav>
          <div className="ft-col">
            <b>Get started</b>
            <a href="#/signup" className="cv-btn white">Start free trial →</a>
            <a href="#/login">Log in</a>
            <a href="#/login?demo=1">Explore the demo clinic</a>
          </div>
        </div>
        <div className="cv-ft-bot">
          <span>© {new Date().getFullYear()} Clinovara. Built for better patient experiences.</span>
          <div><a href="#/privacy">Privacy Policy</a><a href="#/terms">Terms of Service</a></div>
        </div>
      </div>
    </footer>
  );
}
