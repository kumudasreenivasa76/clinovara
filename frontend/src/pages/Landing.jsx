import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  IconCheck, IconArrowRight, IconMessages, IconCalendarEvent, IconDeviceTablet, IconStethoscope, IconSpeakerphone, IconChartBar,
  IconShieldCheck, IconLanguage, IconClock, IconMenu2, IconX, IconPlus, IconUsers, IconBuildingStore, IconReceipt2, IconClipboardText,
  IconDeviceTv, IconDental, IconListDetails, IconWorld, IconPhoneCall, IconBellRinging, IconBrandWhatsapp, IconUser, IconBuilding,
  IconMail, IconPhone, IconMapPin, IconChevronRight, IconApi, IconWebhook, IconFileSpreadsheet, IconCalendarShare, IconId,
  IconMessageCircle, IconBulb, IconChevronLeft, IconCurrencyRupee, IconMoon,
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
const I = (Icon, size = 22) => <Icon size={size} stroke={1.8} />;

export default function Landing() {
  const [booking, setBooking] = useState(null); // { plan?, source }
  const open = (source, plan) => setBooking({ source, plan });
  return (
    <div className="cv">
      <Nav onDemo={() => open('nav')} />
      <Hero onDemo={() => open('hero')} />
      <Strip />
      <Problem />
      <FrontDesk />
      <Product />
      <RoiCalculator onDemo={() => open('roi')} />
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
  return <ul className="cv-check">{items.map((p) => <li key={p}><IconCheck size={16} stroke={2.5} />{p}</li>)}</ul>;
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
    const tick = (t) => { const p = Math.min(1, (t - t0) / 1300); setV(value * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(tick); };
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
const NAV = [['frontdesk', 'Front desk'], ['product', 'Product'], ['platform', 'Platform'], ['roles', 'For your team'], ['how', 'How it works'], ['roi', 'ROI'], ['pricing', 'Pricing']];
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
          <a href="#/login" className="cv-btn text cv-hide-sm">Log in</a>
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
          <span className="cv-pill cv-glass"><span className="cv-pulse" /> AI front office for dental clinics in India</span>
          <h1 className="cv-h1">Never miss a <span className="cv-grad-text">call</span>,<br />a <Em>booking</Em>, or a <Em>recall</Em>.</h1>
          <p className="cv-hero-lead">Clinovara answers every call, WhatsApp and website message in your patient’s own language, books the right slot at the right branch, checks them in at the kiosk, briefs the dentist and follows up after every visit.</p>
          <div className="cv-cta-row">
            <a href="#/signup" className="cv-btn primary lg cv-shine">Start 30-day free trial</a>
            <button onClick={onDemo} className="cv-btn ghost lg">Book a demo →</button>
          </div>
          <div className="cv-assure"><span><IconCheck size={15} stroke={2.5} />No card needed</span><span><IconCheck size={15} stroke={2.5} />Set up in about ten minutes</span><span><IconCheck size={15} stroke={2.5} />DPDP-ready consent</span></div>
          <div className="cv-langs">
            <span>Speaks</span>{['English', 'हिन्दी', 'ಕನ್ನಡ', 'తెలుగు', 'தமிழ்'].map((l) => <b key={l}>{l}</b>)}<span>+ 18 more Indian languages on calls</span>
          </div>
          <a href="#/login?demo=1" className="cv-try">Or look around the demo clinic first <IconArrowRight size={15} /></a>
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
      <Blob style={{ inset: '1.5rem 1.5rem 3rem', background: 'rgba(191,219,254,.5)' }} />
      <ToothMascot />
      <Sparkle style={{ right: 24, top: 8, width: 24, height: 24, color: 'var(--b300)' }} />
      <Sparkle style={{ left: -8, bottom: 80, width: 20, height: 20, color: 'var(--b200)' }} />
      <div className="cv-chip cv-glass cv-float" style={{ right: -12, top: 12, animationDelay: '.9s' }}>
        <span className="ic" style={{ background: 'linear-gradient(135deg,#34d399,#059669)' }}><IconBrandWhatsapp size={17} /></span>
        <div><div className="t1">WhatsApp sent</div><div className="t2">Reminder · 24h before</div></div>
      </div>
      <div className="cv-chatcard cv-float"><HeroChat /></div>
      <div className="cv-chip cv-glass cv-float" style={{ bottom: 0, left: -12, animationDelay: '1.5s' }}>
        <span className="ic" style={{ background: 'var(--grad)' }}><IconCheck size={17} stroke={2.5} /></span>
        <div><div className="t2">Handled without staff today</div><div className="big"><CountNum value={92} suffix="%" /></div></div>
      </div>
    </div>
  );
}

// The assistant answers in the caller’s language — the demo cycles through Kannada, Telugu, Hindi, Tamil and English.
const CONVOS = [
  { lang: 'Kannada', msgs: [['patient', 'Cleaning ge appointment beku'], ['ai', <>Namaskara! Monday <b>10:30 AM</b> slot available ide, book maadla?</>], ['patient', 'Haudu, book maadi'], ['ai', 'Done ✅ Monday 10:30, Dr. Ananya Rao. Reminder kalisteeni.']] },
  { lang: 'Telugu', msgs: [['patient', 'Cleaning appointment kavali'], ['ai', <>Namaskaram! Monday <b>10:30 AM</b> slot available undi, book cheyyana?</>], ['patient', 'Avunu, book cheyyandi'], ['ai', 'Done ✅ Monday 10:30, Dr. Ananya Rao. Reminder pampistanu.']] },
  { lang: 'Hindi', msgs: [['patient', 'Cleaning ka appointment chahiye'], ['ai', <>Namaste! Monday <b>10:30 AM</b> slot available hai, book kar doon?</>], ['patient', 'Haan, book kar do'], ['ai', 'Done ✅ Monday 10:30, Dr. Ananya Rao. Reminder bhej dunga.']] },
  { lang: 'Tamil', msgs: [['patient', 'Cleaning appointment venum'], ['ai', <>Vanakkam! Monday <b>10:30 AM</b> slot available iruku, book pannattuma?</>], ['patient', 'Aama, book pannunga'], ['ai', 'Done ✅ Monday 10:30, Dr. Ananya Rao. Reminder anuppuren.']] },
  { lang: 'English', msgs: [['patient', 'I need a cleaning appointment'], ['ai', <>Hello! There’s a <b>10:30 AM</b> slot on Monday, shall I book it?</>], ['patient', 'Yes, please book it'], ['ai', 'Done ✅ Monday 10:30, Dr. Ananya Rao. I’ll send a reminder.']] },
];
function HeroChat() {
  const [ci, setCi] = useState(0);
  const [shown, setShown] = useState(0);
  const [typing, setTyping] = useState(true);
  useEffect(() => {
    const timers = []; let convo = 0;
    function play() {
      setCi(convo); setShown(0); setTyping(true);
      const msgs = CONVOS[convo].msgs; let d = 600;
      msgs.forEach((_, i) => {
        timers.push(setTimeout(() => setTyping(true), d)); d += 650;
        timers.push(setTimeout(() => { setShown(i + 1); setTyping(i + 1 < msgs.length); }, d)); d += 520;
      });
      timers.push(setTimeout(() => setTyping(false), d));
      timers.push(setTimeout(() => { convo = (convo + 1) % CONVOS.length; play(); }, d + 3000));
    }
    play();
    return () => timers.forEach(clearTimeout);
  }, []);
  const msgs = CONVOS[ci].msgs; const done = shown >= msgs.length; const next = msgs[shown]?.[0];
  return (
    <>
      <div className="cv-chat-head"><div className="l"><img src="/brand/clinovara-mark.svg" alt="" />Incoming call · {CONVOS[ci].lang}</div><span className="cv-live">● Live</span></div>
      <div className="cv-chat-body">
        {msgs.slice(0, shown).map(([who, node], i) => <div key={`${ci}-${i}`} className={`cv-bub cv-pop ${who}`}><div>{node}</div></div>)}
        {typing && !done && <div className={`cv-typing ${next === 'ai' ? 'ai' : ''}`}>{[0, 1, 2].map((i) => <i key={i} style={{ animationDelay: `${i * 0.18}s` }} />)}</div>}
      </div>
      <div className={`cv-booked ${done ? 'cv-pop' : ''}`} style={{ opacity: done ? 1 : 0 }}>
        <div className="r1"><span>Booked into the diary</span><span>Mon · 10:30</span></div>
        <div className="r2">Cleaning &amp; check-up · ₹1,500 · Indiranagar</div>
      </div>
    </>
  );
}

function Strip() {
  const items = ['₹ fees, UPI and GST receipts', 'WhatsApp first', 'DPDP consent', 'ABHA ready', 'PM-JAY · CGHS · ESIC'];
  return (
    <section className="cv-strip">
      <div className="cv-wrap"><strong>Built for how Indian clinics work</strong>{items.map((x) => <React.Fragment key={x}><span className="dot" /><span>{x}</span></React.Fragment>)}</div>
    </section>
  );
}

// ── problem ────────────────────────────────────────────────────────────────────
function Problem() {
  const stats = [
    { num: 30, prefix: '~', suffix: '%', small: 'of calls to busy front desks go unanswered', icon: IconPhoneCall },
    { big: 'After hours', small: 'is when patients actually call to book', icon: IconMoon },
    { big: '₹1,000s', small: 'walk out the door with every missed booking', icon: IconCurrencyRupee },
  ];
  return (
    <Section eyebrow="The problem" center title={<>Your front desk can’t be everywhere.<br /><Em>Clinovara can.</Em></>} sub="Phones ring during treatment, at lunch and after closing. Every unanswered call is a patient who books with someone else.">
      <div className="cv-grid sm3">
        {stats.map((s, i) => (
          <Reveal key={s.small} delay={i * 110}>
            <div className="cv-card pad center hover cv-shine">
              <Ico icon={s.icon} className="center" />
              <div className="cv-stat">{s.num != null ? <CountNum value={s.num} prefix={s.prefix} suffix={s.suffix} /> : s.big}</div>
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
  [IconLanguage, 'Speaks like a local', 'English, Hindi, Kannada and Hinglish on chat, and all 22 scheduled languages of India plus English on calls, detected from what the patient types or says. Code-mixed Kanglish and Hinglish included.'],
  [IconMessages, 'One brain, every channel', 'WhatsApp, SMS, your website chat and phone calls follow exactly the same rules for availability, fees and escalation. Family members sharing one phone are handled too.'],
  [IconCalendarEvent, 'Books into your real diary', 'Live availability by branch and dentist, your own fees from the procedure catalogue, and visit lengths estimated from what actually happens. No made-up slots.'],
  [IconShieldCheck, 'Never plays doctor', 'Pain, medicines, diagnosis and “is this normal?” are written up in plain words for the dentist, never answered. Anything urgent gets your emergency line.'],
  [IconPhoneCall, 'After hours, missed calls, no-shows', 'Out of hours it says when you open and still books. Missed calls get a WhatsApp back, no-shows get a rebook message, and both land on the callback list.'],
  [IconBellRinging, 'Reminders, recalls and follow-ups', '24h and 2h reminders, waitlist auto-offers, recall nudges and post-visit check-ins, each in the patient’s own language.'],
];
function FrontDesk() {
  return (
    <Section id="frontdesk" eyebrow="AI front desk" title={<>A front desk that <Em>never clocks off</Em>.</>} sub="Clinovara picks up on the first message or ring, speaks your patient’s language and does the whole job: book, reschedule, cancel, confirm and answer questions, using your fees, hours and policies.">
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
  { eyebrow: 'Front desk assistant', icon: IconMessageCircle, title: 'Patients get an answer in seconds, in their own language', text: 'The assistant answers on your clinic website and WhatsApp, quotes your own fees and timings, and books real slots at the right branch. Anything clinical goes straight to a person.', points: ['Books only into times you actually have free', 'Quotes the fees from your own procedure list', 'Hands over pain, medicines and complaints to your team'], visual: 'chat' },
  { eyebrow: 'Check-in and queue', icon: IconDeviceTablet, title: 'A waiting room that runs itself', text: 'Patients check in at a kiosk with their mobile number, ABHA or name and date of birth, get a token, and see it called on the waiting-room display. Your team sees who is waiting and for how long.', points: ['Kiosk check-in with pre-visit forms, insurance and consent', 'Token display with a chime and a spoken call', 'Live queue per dentist, payment collected at the desk'], visual: 'board' },
  { eyebrow: 'Dentist workspace', icon: IconStethoscope, title: 'The dentist is briefed before the patient sits down', text: 'Allergies, medicines, medical alerts and what the patient said they came for are on one screen. Finishing a visit is one guided form: notes, treatment to recommend, the next visit and the aftercare message.', points: ['Alerts from the pre-visit form at a glance', 'Aftercare sent in the patient’s language on WhatsApp', 'Close the case and send the record to your EHR'], visual: 'dentist' },
  { eyebrow: 'Growth and marketing', icon: IconSpeakerphone, title: 'Bring patients back, and see what worked', text: 'Recall reminders, review requests, festival greetings and win-back messages are drafted for you. An owner approves every message before it is sent, and you see what each campaign led to.', points: ['One tap from “overdue for a check-up” to a draft', 'Owner approval on every message and campaign', 'Bookings and collections that followed each campaign'], visual: 'growth' },
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
        <div className="cv-bub ai"><div>Booked for Saturday at 9:00 am ✅ A form link is on its way to your phone.</div></div>
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
    <Win title="My home · Dr. Menon">
      <div className="mk-dent">
        <small>NEXT PATIENT</small>
        <div className="name"><b>A02</b>Rohan Patil <span>46 yrs</span></div>
        <div className="say">Patient says: “Pain in lower left molar when chewing”</div>
        <div className="tags"><i className="warn">High blood pressure</i><i className="bad">Allergy: Penicillin</i><i>Telmisartan 40 mg daily</i></div>
        <div className="go"><span className="cv-btn soft">Call Rohan in</span></div>
      </div>
    </Win>
  );
  return (
    <Win title="Marketing · growth">
      <div className="mk-grow">
        <div className="tiles"><div><small>Messages sent</small><b>89</b></div><div><small>Bookings that followed</small><b>28</b></div><div><small>Collected</small><b>₹55,900</b></div></div>
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
    <Section id="product" tint eyebrow="The product" title={<>Everything between “hello” and <Em>“see you in six months”</Em>.</>} sub="One system for the reception, the waiting room, the dentist’s chair and the follow-up, so nothing depends on someone remembering.">
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
      <div className="cv-mini">
        {[[IconCalendarEvent, 'Online booking', 'A booking page that respects your hours, dentists and holidays.'], [IconReceipt2, 'Payments and receipts', 'UPI, cash and card recorded against the visit, with receipt numbers.'], [IconLanguage, 'Three app languages', 'Screens, forms and messages in English, Hindi and Kannada.'], [IconBuildingStore, 'Many branches', 'Each branch has its own hours, chairs, queue and numbers.']].map(([icon, h, t]) => (
          <div key={h}><Ico icon={icon} size="xs" /><div><b>{h}</b><p>{t}</p></div></div>
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
    ['Missed calls booked back', missedRev, 'Patients who’d have booked elsewhere'],
    ['After-hours enquiries captured', afterRev, 'Messages and calls after you close, answered and booked'],
    ['Chair time reclaimed', scheduleRev, 'Right-sized slots from AI time estimates'],
  ];
  const pct = (s) => ((s.v - s.min) / (s.max - s.min)) * 100;
  return (
    <Section id="roi" eyebrow="ROI calculator" title={<>See what Clinovara adds to your <Em>bottom line</Em>.</>} sub="Every missed call, after-hours enquiry and badly sized slot is lost revenue. Move the sliders to estimate what Clinovara brings back each month.">
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
          <p className="cv-fine">Illustrative estimate using a ~40% booking-conversion assumption and typical slot lengths. Your actual results will vary.</p>
        </Reveal>
        <Reveal delay={120}>
          <div className="cv-bluecard">
            <div className="cv-gridbg" style={{ opacity: 0.25 }} />
            <Sparkle style={{ right: 24, top: 24, width: 28, height: 28, color: 'rgba(255,255,255,.3)' }} />
            <div className="in">
              <p className="k">Estimated extra revenue</p>
              <div className="total">{inr(total)}<small>/mo</small></div>
              <p className="yr">that’s about <b>{inr(total * 12)}</b> a year</p>
              <div className="rows">{breakdown.map(([l, a, h]) => <div key={l}><div><b>{l}</b><span>{h}</span></div><div className="amt">{inr(a)}<small>/mo</small></div></div>)}</div>
              <button onClick={onDemo} className="cv-btn white block lg cv-shine" style={{ marginTop: 24 }}>Book a demo to capture this →</button>
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

// ── platform ───────────────────────────────────────────────────────────────────
const PLATFORM = [
  [IconCalendarEvent, 'Smart scheduling', 'Per-branch, per-dentist diary with leave blocks, public holidays and waitlist auto-offers.'],
  [IconClipboardText, 'Pre-visit forms', 'Six short sections on the patient’s phone, in their language: history, insurance or scheme, ABHA and consent.'],
  [IconDeviceTablet, 'Kiosk check-in', 'Identify by mobile, ABHA or name and date of birth, choose the family member, get an OPD token.'],
  [IconDeviceTv, 'Arrivals & waiting-room display', 'Lanes, tokens and call-next per dentist, help requests, and a TV display that chimes and speaks.'],
  [IconStethoscope, 'Dentist workspace', 'Today’s patient with alerts, a guided finish-visit, the chart, my patients, my week and my numbers.'],
  [IconDental, 'Treatment plans', 'FDI tooth numbers, ₹ estimates, patient questions and next visits, nudged until the case is closed.'],
  [IconListDetails, 'Procedure & fee catalogue', 'Owners set every fee; a fixed, range or flexible policy decides how far a dentist can change a price.'],
  [IconReceipt2, 'Payments & receipts', 'Numbered receipts per financial year with an optional GST split, printed or sent on WhatsApp.'],
  [IconSpeakerphone, 'Marketing with approval', 'Recalls, reviews, festival greetings and win-backs drafted by AI and sent only after an owner approves.'],
  [IconChartBar, 'Insights & branches', 'Booking rate, cancellations, check-in delays, recalls and collections, by dentist and by branch.'],
  [IconWorld, 'Clinic website & booking', 'A public page for each clinic with hours, dentists, the AI chat and online booking.'],
  [IconClock, 'AI time estimates', 'Suggests slot lengths from what actually happened, per visit type, dentist and patient.'],
];
const CONNECT = [[IconApi, 'FHIR R4 API & EHR export'], [IconWebhook, 'Signed webhooks'], [IconFileSpreadsheet, 'CSV import & export'], [IconCalendarShare, 'Google, Outlook & iPhone calendars'], [IconBrandWhatsapp, 'WhatsApp Business & SMS'], [IconId, 'ABHA on every record']];
function Platform() {
  return (
    <Section id="platform" tint eyebrow="The platform" title={<>More than a receptionist. <Em>Your whole practice</Em>.</>} sub="The AI front desk is the front door. Behind it, Clinovara runs the reception, the chair and the follow-up, and every part talks to the others.">
      <div className="cv-grid sm2 lg4">
        {PLATFORM.map(([icon, t, d], i) => (
          <Reveal key={t} delay={(i % 4) * 80}>
            <div className="cv-glasscard"><Ico icon={icon} size="sm" /><h3>{t}</h3><p>{d}</p></div>
          </Reveal>
        ))}
      </div>
      <Reveal className="cv-connect">
        <b>Connects to what you already use</b>
        {CONNECT.map(([icon, t]) => <span key={t}>{I(icon, 15)}{t}</span>)}
      </Reveal>
    </Section>
  );
}

// ── roles ──────────────────────────────────────────────────────────────────────
const ROLES = [
  { id: 'owner', label: 'Owner', icon: IconChartBar, headline: 'The whole clinic on one page', points: ['Revenue, appointments, no-shows and chair use against the last period', 'What needs a decision today: messages, approvals, unpaid visits', 'Where bookings and new patients come from, and what marketing earned'] },
  { id: 'desk', label: 'Front desk', icon: IconUsers, headline: 'A to-do list that clears itself', points: ['Messages, callbacks, confirmations and payments to collect, with one click to each', 'The live queue and the day’s schedule on one screen', 'Reminders and recalls sent in the patient’s language'] },
  { id: 'dentist', label: 'Dentist', icon: IconStethoscope, headline: 'Only your patients, ready when you are', points: ['Your list for the day, with alerts and what each patient told you', 'Call in, seat, treat and finish in a few taps', 'Your week, your numbers and your treatment plans'] },
];
function Roles() {
  const [role, setRole] = useState('owner');
  const r = ROLES.find((x) => x.id === role);
  return (
    <Section id="roles" eyebrow="For your whole team" title={<>Each person sees the screen that <Em>fits their job</Em>.</>} sub="Owners and admins see everything. The front desk runs the day. Dentists get their own patients and nothing else.">
      <div className="cv-tabs" role="tablist">{ROLES.map((x) => <button key={x.id} role="tab" aria-selected={role === x.id} className={role === x.id ? 'on' : ''} onClick={() => setRole(x.id)}>{I(x.icon, 16)}{x.label}</button>)}</div>
      <div className="cv-card pad cv-role" key={role}>
        <div className="cv-pop">
          <h3>{r.headline}</h3>
          <Check items={r.points} />
          <a className="link" href="#/login?demo=1">See the {r.label.toLowerCase()} view in the demo clinic <IconArrowRight size={15} /></a>
        </div>
        <div className="cv-role-art cv-pop">
          <div className="cv-dots" />
          <Blob style={{ inset: '20%', background: 'rgba(191,219,254,.7)' }} />
          <div className="cv-ico big cv-float" style={{ position: 'relative' }}>{I(r.icon, 44)}</div>
        </div>
      </div>
    </Section>
  );
}

// ── a sample day ───────────────────────────────────────────────────────────────
const DAY = [
  ['08:41', 'A patient asks on WhatsApp whether her insurer is cashless', 'Answered, and a consultation offered for Tuesday evening'],
  ['08:52', 'Rohan checks in at the kiosk in Hindi', 'Token A02 appears on the waiting-room display'],
  ['09:04', 'The dentist opens her day', 'Blood thinners and an RCT plan are already on screen'],
  ['10:30', 'A patient asks if he should take leftover amoxicillin', 'The assistant declines and hands him to the dentist'],
  ['13:10', 'A patient pays by UPI at the desk', 'A numbered receipt goes to his WhatsApp and collections update'],
  ['15:20', 'A thank-you is drafted after a visit', 'The owner approves it and it goes out at 16:20'],
];
function SampleDay() {
  return (
    <section className="cv-sec tint">
      <div className="cv-wrap cv-day">
        <div className="cv-head">
          <span className="cv-eyebrow">A sample day</span>
          <h2 className="cv-h2">What your day looks like <Em>with Clinovara</Em>.</h2>
          <p className="cv-sub">Six small moments that used to be a phone call, a sticky note or a forgotten task.</p>
        </div>
        <Reveal className="cv-ledger">
          {DAY.map(([t, a, b]) => <div key={t}><span className="t">{t}</span><div><b>{a}</b><p><IconCheck size={14} stroke={2.5} />{b}</p></div></div>)}
        </Reveal>
      </div>
    </section>
  );
}

// ── how it works ───────────────────────────────────────────────────────────────
const Shadow = ({ cx, w }) => <ellipse cx={cx} cy="112" rx={w} ry="4" fill="#2563eb" opacity="0.10" />;
function IllusSetup() {
  return (
    <svg viewBox="0 0 150 120" className="illus" aria-hidden>
      <defs><linearGradient id="cvSetupCard" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#eff6ff" /></linearGradient><linearGradient id="cvBadge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3b82f6" /><stop offset="1" stopColor="#1d4ed8" /></linearGradient></defs>
      <Shadow cx={75} w={40} />
      <rect x="36" y="22" width="78" height="86" rx="16" fill="url(#cvSetupCard)" stroke="#bfdbfe" strokeWidth="2" />
      <rect x="57" y="12" width="36" height="18" rx="9" fill="#60a5fa" />
      <rect x="62" y="16" width="26" height="10" rx="5" fill="#bfdbfe" opacity="0.7" />
      <rect x="50" y="46" width="50" height="7" rx="3.5" fill="#bfdbfe" />
      <rect x="50" y="61" width="50" height="7" rx="3.5" fill="#dbeafe" />
      <rect x="50" y="76" width="30" height="7" rx="3.5" fill="#dbeafe" />
      <circle cx="99" cy="95" r="15" fill="url(#cvBadge)" />
      <path d="M92 95l5 5 9-10" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IllusTeam() {
  return (
    <svg viewBox="0 0 150 120" className="illus" aria-hidden>
      <defs><linearGradient id="cvSheet" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#eff6ff" /></linearGradient><linearGradient id="cvBadge2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3b82f6" /><stop offset="1" stopColor="#1d4ed8" /></linearGradient></defs>
      <Shadow cx={72} w={42} />
      <rect x="26" y="20" width="76" height="86" rx="14" fill="url(#cvSheet)" stroke="#bfdbfe" strokeWidth="2" />
      <rect x="26" y="20" width="76" height="16" rx="8" fill="#dbeafe" />
      {[46, 60, 74, 88].map((y) => <g key={y}><rect x="36" y={y} width="20" height="7" rx="3.5" fill="#bfdbfe" /><rect x="60" y={y} width="32" height="7" rx="3.5" fill="#dbeafe" /></g>)}
      <circle cx="112" cy="46" r="13" fill="#ffffff" stroke="#93c5fd" strokeWidth="2.5" />
      <circle cx="112" cy="42" r="4.5" fill="#60a5fa" /><path d="M104 53c2-5 14-5 16 0" fill="#60a5fa" />
      <circle cx="112" cy="90" r="14" fill="url(#cvBadge2)" />
      <path d="M112 83v14M105 90h14" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
function IllusLive() {
  return (
    <svg viewBox="0 0 150 120" className="illus" aria-hidden>
      <defs><linearGradient id="cvLiveBubble" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3b82f6" /><stop offset="1" stopColor="#1d4ed8" /></linearGradient></defs>
      <Shadow cx={75} w={44} />
      <rect x="14" y="16" width="88" height="36" rx="16" fill="#fff" stroke="#bfdbfe" strokeWidth="2" />
      <text x="28" y="39" fill="#2563eb" fontSize="16" fontWeight="700" fontFamily="'Plus Jakarta Sans',sans-serif">ನಮಸ್ಕಾರ</text>
      <rect x="48" y="60" width="88" height="38" rx="16" fill="url(#cvLiveBubble)" />
      <text x="60" y="84" fill="#fff" fontSize="15" fontWeight="700" fontFamily="'Plus Jakarta Sans',sans-serif">Booked ✓</text>
      <circle cx="123" cy="42" r="5" fill="#34d399" />
    </svg>
  );
}
function HowItWorks() {
  const steps = [
    ['Day 0', 'Register and set up', 'Verify your email, then add your address, hours, dentists and services. About ten minutes.', IllusSetup],
    ['Day 1', 'Bring your patients', 'Import them from a CSV and invite your front desk and dentists with their own logins.', IllusTeam],
    ['Day 2', 'Open the doors', 'Put the kiosk on a tablet, the display on a TV, and the booking link on Google Maps.', IllusLive],
  ];
  const later = [
    ['Day 7', 'Start the follow-ups', 'Send your first recall reminders and review requests. You approve each one.', IconSpeakerphone],
    ['Day 30', 'Look at the results', 'See what the first month brought in and decide how to carry on.', IconChartBar],
  ];
  return (
    <Section id="how" eyebrow="How it works" center title={<>Live in <Em>minutes</Em>, not months.</>} sub="From sign-up to your first month in five steps.">
      <div className="cv-grid md3" style={{ marginTop: 56, gap: 32 }}>
        {steps.map(([day, t, d, Illus], i) => (
          <Reveal key={t} delay={i * 130}>
            <div className="cv-card pad center hover cv-step">
              {i < 2 && <div className="arrow"><IconChevronRight size={16} stroke={2.5} /></div>}
              <Illus />
              <div className="day"><span className="cv-stepnum">{i + 1}</span>{day}</div>
              <h3 style={{ marginTop: 10 }}>{t}</h3>
              <p>{d}</p>
            </div>
          </Reveal>
        ))}
      </div>
      <div className="cv-later">
        {later.map(([day, t, d, icon], i) => (
          <Reveal key={t} delay={i * 110}>
            <div className="cv-card hover"><Ico icon={icon} size="sm" /><div><span className="day">Step {i + 4} · {day}</span><h3>{t}</h3><p>{d}</p></div></div>
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

function Agenda({ items, compact }) {
  return (
    <div className={`cv-agenda ${compact ? 'compact' : ''}`}>
      {!compact && <div className="hd"><IconClock size={16} /> Agenda · 30 minutes</div>}
      {items.map(([t, h, d], i) => <div className="row" key={h}><span className="cv-stepnum" style={compact ? { width: 22, height: 22 } : null}>{compact ? <IconCheck size={12} stroke={3} /> : i + 1}</span><div className="grow"><b>{h}</b>{!compact && d && <p>{d}</p>}</div><em>{t}</em></div>)}
    </div>
  );
}

const EMPTY = { name: '', clinic: '', email: '', phone: '', city: '', size: '', software: '', message: '' };
function Field({ label, icon, wide, children }) {
  return <label className={`cv-field ${wide ? 'wide' : ''}`}>{label}<div className="ctl">{icon && I(icon, 16)}{children}</div></label>;
}

/** Two-step booking card: pick a time, then tell us about you. Used inline on the page and inside the modal. */
function DemoBooking({ source = 'website', plan, onClose, title = 'Book your demo call' }) {
  const [meta, reload] = useSlots();
  const [day, setDay] = useState('');
  const [slot, setSlot] = useState('');
  const [step, setStep] = useState(1);
  const [f, setF] = useState(() => ({ ...EMPTY, message: plan ? `Interested in the ${plan} plan.` : '' }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const firstRef = useRef(null);
  const days = useMemo(() => [...new Set((meta?.slots || []).map((s) => dayOf(s.start)))], [meta]);
  useEffect(() => { if (!day && meta?.slots?.length) { const first = meta.slots.find((s) => s.available); if (first) setDay(dayOf(first.start)); } }, [meta]); // eslint-disable-line
  useEffect(() => { if (step === 2) firstRef.current?.focus(); }, [step]);
  const times = (meta?.slots || []).filter((s) => dayOf(s.start) === day);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const noSlots = meta && (meta.failed || !meta.slots.some((s) => s.available));

  function next() { if (!slot && !noSlots) { setErr('Please pick a time for the call.'); return; } setErr(''); setStep(2); }
  async function submit() {
    if (!f.name.trim() || !f.clinic.trim()) { setErr('Please add your name and clinic.'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) { setErr('Please enter a valid email address.'); return; }
    if (f.phone.replace(/\D/g, '').length < 10) { setErr('Please enter a phone number with at least 10 digits.'); return; }
    setBusy(true); setErr('');
    try { setDone(await post('/api/leads/demo', { ...f, slot: slot || undefined, source })); slotsCache = null; reload(); }
    catch (e) { setErr(e.message); if (/taken|no longer/.test(e.message)) { setSlot(''); setStep(1); slotsCache = null; reload(); } }
    finally { setBusy(false); }
  }
  function reset() { setDone(null); setSlot(''); setStep(1); setF({ ...EMPTY }); }

  if (done) return (
    <div className="cv-book cv-pop">
      <div className="cv-done">
        <div className="tick"><IconCheck size={28} stroke={2.5} /></div>
        <h3>You’re booked 🎉</h3>
        <p className="when">{done.when}</p>
        <p className="m">30 minutes by video. {done.confirmedByEmail ? <>We have emailed the agenda to <b>{f.email}</b>.</> : <>We will email <b>{f.email}</b> the joining link before the call.</>}</p>
        <Agenda items={done.agenda || FALLBACK_AGENDA} compact />
        <div className="cv-actions">{onClose ? <button onClick={onClose} className="cv-btn soft">Done</button> : <button onClick={reset} className="cv-btn soft">Book another</button>}</div>
      </div>
    </div>
  );

  return (
    <div className="cv-book">
      <div className="cv-book-hd">
        <div className="top">
          <div><h3>{title}</h3><p className="s">30 minutes by video with someone who knows the product{plan ? ` · ${plan} plan` : ''}.</p></div>
          {onClose && <button className="cv-x" onClick={onClose} aria-label="Close"><IconX size={18} /></button>}
        </div>
        <div className="cv-progress">{[1, 2].map((s) => <i key={s} className={step >= s ? 'on' : ''} />)}</div>
        <p className="cv-steplbl">Step {step} of 2 · {step === 1 ? 'Pick a time' : 'About you and your clinic'}</p>
      </div>
      <div className="cv-book-bd">
        {err && <div className="cv-err">{err}</div>}
        {step === 1 ? (
          <>
            {!meta && <p className="cv-tz">Loading times…</p>}
            {meta && noSlots && <div className="cv-err">{meta.failed ? 'We could not load times just now.' : 'Every time this fortnight is taken.'} Continue and we will email you to agree a time, or write to {SUPPORT_EMAIL}.</div>}
            {meta && !noSlots && <>
              <p className="cv-tz">Times are in India Standard Time</p>
              <div className="cv-days">{days.map((d) => { const l = dayLabel(d); return <button key={d} className={d === day ? 'on' : ''} onClick={() => { setDay(d); setSlot(''); }}><small>{l.w}</small><b>{l.d}</b><small>{l.m}</small></button>; })}</div>
              <div className="cv-times">{times.map((s) => <button key={s.start} disabled={!s.available} className={s.start === slot ? 'on' : ''} onClick={() => { setSlot(s.start); setErr(''); }}>{clock(s.start)}{!s.available && <small>Full</small>}</button>)}</div>
              {slot && <div className="cv-chosen cv-pop"><IconCalendarEvent size={16} /> <span><b>{longWhen(slot)}</b> IST</span></div>}
            </>}
            <div className="cv-actions"><button onClick={next} disabled={!meta} className="cv-btn soft">Continue <IconArrowRight size={16} /></button></div>
          </>
        ) : (
          <>
            <div className="cv-form">
              <Field label="Your name *" icon={IconUser}><input ref={firstRef} className="cv-input ic" value={f.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" placeholder="Dr. Ananya Rao" /></Field>
              <Field label="Clinic name *" icon={IconBuilding}><input className="cv-input ic" value={f.clinic} onChange={(e) => set('clinic', e.target.value)} autoComplete="organization" placeholder="Bright Smile Dental" /></Field>
              <Field label="Work email *" icon={IconMail}><input type="email" className="cv-input ic" value={f.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" placeholder="you@clinic.com" /></Field>
              <Field label="Phone / WhatsApp *" icon={IconPhone}><input inputMode="tel" className="cv-input ic" value={f.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" placeholder="+91 98450 12345" /></Field>
              <Field label="City" icon={IconMapPin}><input className="cv-input ic" value={f.city} onChange={(e) => set('city', e.target.value)} placeholder="Bengaluru" /></Field>
              <Field label="Clinic size"><select className="cv-input" value={f.size} onChange={(e) => set('size', e.target.value)}><option value="">Choose…</option>{(meta?.sizes || []).map((x) => <option key={x}>{x}</option>)}</select></Field>
              <Field label="What do you use today?" wide><input className="cv-input" value={f.software} onChange={(e) => set('software', e.target.value)} placeholder="A register, Excel, Practo, another software…" /></Field>
              <Field label="Anything you want us to cover?" wide><textarea className="cv-input" value={f.message} onChange={(e) => set('message', e.target.value)} placeholder="Languages you serve, branches, what you want the assistant to handle…" /></Field>
            </div>
            <div className="cv-actions">
              <button onClick={() => { setStep(1); setErr(''); }} className="cv-btn ghost"><IconChevronLeft size={16} />Back</button>
              <button onClick={submit} disabled={busy} className="cv-btn soft">{busy ? 'Booking…' : 'Confirm demo call'}</button>
            </div>
            <p className="cv-tiny">We use your details only to arrange this call. No spam, and no card.</p>
          </>
        )}
      </div>
    </div>
  );
}

function BookingModal({ source, plan, onClose }) {
  useEffect(() => { const k = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="cv-modal" onClick={onClose} role="dialog" aria-modal="true" aria-label="Book a demo call">
      <div className="cv-modal-box cv-pop" onClick={(e) => e.stopPropagation()}>
        <DemoBooking source={source} plan={plan} onClose={onClose} />
      </div>
    </div>
  );
}

function DemoSection() {
  const [meta] = useSlots();
  return (
    <section id="demo" className="cv-sec tint">
      <div className="cv-wrap cv-demo">
        <div>
          <div className="cv-head">
            <span className="cv-eyebrow">Book a demo call</span>
            <h2 className="cv-h2">See it with <Em>your own clinic</Em> in mind.</h2>
            <p className="cv-sub">A 30-minute video call with someone who knows the product. No slides: we use the real thing, and we leave time for your questions.</p>
          </div>
          <Agenda items={meta?.agenda?.length ? meta.agenda : FALLBACK_AGENDA} />
        </div>
        <Reveal delay={100}>
          <div className="cv-demo-side">
            <DemoBooking source="demo-section" title="Pick a time that suits you" />
            <div className="cv-prep"><IconBulb size={18} /><div><b>Helpful to have open</b>Your current appointment book or software, and a rough idea of how many dentists and chairs you run.</div></div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ── pricing ────────────────────────────────────────────────────────────────────
const TIERS = [
  { name: 'Solo clinic', who: 'One dentist, one chair or two', points: ['AI front desk, online booking and kiosk', 'Reminders, recalls and receipts', 'Owner dashboard and growth tab'] },
  { name: 'Clinic', who: 'Two to eight dentists', featured: 'Most clinics', points: ['Everything in Solo clinic', 'Roles for front desk, dentists and hygienists', 'Marketing approvals and campaign results', 'Virtual assistant for calls'] },
  { name: 'Group', who: 'Several branches', points: ['Everything in Clinic', 'Per-branch hours, queues and numbers', 'FHIR API, webhooks and EHR export', 'Priority support and onboarding help'] },
];
function Pricing({ onPick }) {
  return (
    <Section id="pricing" eyebrow="Pricing" center title={<>Free for 30 days. Then priced for your <Em>chair count</Em>.</>} sub="No card to start. We share the plan that fits on the demo call, so you never pay for what you do not use.">
      <div className="cv-tiers">
        {TIERS.map((t, i) => (
          <Reveal key={t.name} delay={i * 110}>
            <div className={`cv-tier ${t.featured ? 'hot' : ''}`}>
              {t.featured && <span className="badge">★ {t.featured}</span>}
              <h3>{t.name}</h3>
              <p className="who">{t.who}</p>
              <div className="price">Free for 30 days</div>
              <p className="pnote">then priced for your clinic, shared on the demo call</p>
              <Check items={t.points} />
              <div className="btns">
                <a href="#/signup" className={`cv-btn block ${t.featured ? 'primary cv-shine' : 'ghost'}`}>Start free trial</a>
                <button onClick={() => onPick(t.name)} className="cv-btn text block">Talk to us →</button>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

// ── FAQ ────────────────────────────────────────────────────────────────────────
const FAQ = [
  ['Will it really speak Kannada, Hindi or Telugu?', 'Yes. On WhatsApp and the website it handles English, Hindi, Kannada and Hinglish. On calls it recognises all 22 scheduled languages of India plus English, from the script or from common Roman-letter words, so code-mixed Kanglish, Hinglish and Tanglish work too.'],
  ['Is it really ready to use in ten minutes?', 'The setup is five short screens: clinic address, opening hours, dentists, services and launch. You can book your first patient straight after. Importing your existing patients from a CSV takes a little longer, and we help with that on the demo call.'],
  ['Does it send WhatsApp messages and SMS?', 'Yes, once you connect your WhatsApp Business account or an SMS provider. Until then messages wait in an outbox you can see, so nothing is lost and nothing is sent by surprise.'],
  ['What does the assistant say to patients?', 'Only what you approve: your fees, hours, address and policies. It never gives medical advice. Pain, medicines, billing disputes and complaints are handed to your team.'],
  ['Is it just a receptionist, or the whole practice?', 'Both. The AI front desk is the front door, and behind it Clinovara runs scheduling, forms, the kiosk and queue, the dentist’s workspace, treatment plans, fees, receipts, marketing and insights. Everything talks to everything else.'],
  ['Who can see patient data?', 'Each clinic’s data is kept separately, and every role sees only what it needs. Patients on your website can see their own chat and nothing else. Consent follows the Digital Personal Data Protection Act, 2023.'],
  ['Can I keep my current practice software?', 'Yes. Clinovara can read and write patients and fees by CSV, exposes a FHIR R4 API and signed webhooks, and sends a FHIR record of each closed case to your EHR.'],
  ['Do my patients need to install anything?', 'No. They use your clinic website, WhatsApp, or the kiosk. Forms open from a link on their phone.'],
  ['What happens after the 30-day trial?', 'Nothing automatic. No card is taken at sign-up. We will talk about plans before the trial ends, and your data stays yours.'],
  ['How is marketing kept under control?', 'Every message and campaign waits for an owner or admin to approve it. Only patients who agreed to be contacted receive anything, between 09:00 and 20:00, with an opt-out line.'],
];
function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <Section id="faq" eyebrow="FAQ" title="Questions, answered.">
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
        <div className="cv-gridbg" style={{ opacity: 0.3 }} />
        <Blob style={{ left: '-2.5rem', top: '-4rem', width: '18rem', height: '18rem', background: 'rgba(255,255,255,.15)' }} />
        <Blob style={{ right: 0, bottom: '-5rem', width: '20rem', height: '20rem', background: 'rgba(125,211,252,.25)' }} />
        <Sparkle style={{ left: 40, top: 40, width: 32, height: 32, color: 'rgba(255,255,255,.4)' }} />
        <Sparkle style={{ right: 64, bottom: 40, width: 24, height: 24, color: 'rgba(255,255,255,.4)' }} />
        <div className="in">
          <h2>Give your front desk the day off from the <span className="cv-serif">phone</span>.</h2>
          <p>Start free today, or book a 30-minute call and we will walk you through it with your clinic in mind.</p>
          <div className="cv-cta-row">
            <a href="#/signup" className="cv-btn white lg cv-shine">Start 30-day free trial</a>
            <button onClick={onDemo} className="cv-btn outline-white lg">Book a demo call</button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer({ onDemo }) {
  return (
    <footer className="cv-foot">
      <div className="cv-foot-grid">
        <div><Logo /><p>The AI front office for dental clinics in India: answering, booking, checking in and following up, in every Indian language.</p></div>
        <div className="cv-foot-col"><b>Product</b><div><button onClick={() => go('frontdesk')}>AI front desk</button><button onClick={() => go('product')}>Product tour</button><button onClick={() => go('platform')}>Platform</button><button onClick={() => go('pricing')}>Pricing</button><a href="#/login?demo=1">Demo clinic</a></div></div>
        <div className="cv-foot-col"><b>Company</b><div><button onClick={onDemo}>Book a demo call</button><a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a><button onClick={() => go('faq')}>FAQ</button></div></div>
        <div className="cv-foot-col"><b>Get started</b><div><a href="#/signup">Start free trial →</a><a href="#/login">Log in</a></div></div>
      </div>
      <div className="cv-foot-bot">
        <span>© {new Date().getFullYear()} Clinovara. Made for clinics that would rather look after patients than the phone.</span>
        <div><a href="#/privacy">Privacy Policy</a><a href="#/terms">Terms of Service</a></div>
      </div>
    </footer>
  );
}
