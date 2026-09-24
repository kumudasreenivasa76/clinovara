import React from 'react';
import { IconArrowRight } from '@tabler/icons-react';
import Logo from '../components/Logo.jsx';

const DAY = [
  ['08:41', 'Tara Bhat', 'asks on WhatsApp whether Star Health is cashless, in Hinglish. Answered, and offered a consult on Tuesday evening.', 'AI front desk'],
  ['08:52', 'Rohan Patil', 'checks in at the kiosk in Hindi, scans his card, signs consent. Token A02 appears on the display.', 'Kiosk · token'],
  ['09:04', 'Dr. Menon', 'opens his day: A02 is ready, on blood thinners, RCT on 36 planned. He taps "Call".', "Dentist's day"],
  ['09:48', 'Suresh Adiga', 'asks for help at the kiosk. The front desk sees it, walks over, finishes his allergies section.', 'Arrivals'],
  ['10:30', 'Omar Hussain', 'asks if he should take leftover amoxicillin. The AI declines and hands him to Dr. Menon.', 'Handed to staff'],
  ['13:10', 'Grace D\'Souza', 'pays ₹2,500 by UPI at the desk. Insights now shows collections by dentist and branch.', 'Payment'],
  ['15:20', 'Meera Krishnan', 'gets a thank-you draft. The owner reads it, approves it, and it goes out at 16:20.', 'Approval queue'],
  ['18:30', 'Kavya Shetty', 'is offered a Whitefield slot that opened when someone cancelled. She replies YES.', 'Waitlist'],
];

const POINTS = [
  ['Answers patients before you can', 'WhatsApp, calls, web chat and SMS in English, Hindi, Kannada or Hinglish. Books real slots at the right branch, quotes your fees, and hands anything clinical to a person.'],
  ['A reception that runs itself', 'Self check-in by mobile, ABHA or name. Forms and consent in the patient\'s language. OPD tokens on a waiting-room display. Family phones handled.'],
  ['Fewer empty chairs', 'Reminders 24 hours and 2 hours out, recalls at six months, waitlist offers the moment a slot opens, and treatment nudges for patients who left without booking.'],
  ['The dentist is briefed', 'Medical alerts from the pre-visit form, the patient\'s own words, and the open treatment plan, on one screen, before the patient sits down.'],
  ['Marketing a human signs off', 'The AI drafts thank-yous, review requests, festival greetings and campaigns from prompts you approved. An owner approves each one before it goes out.'],
  ['Fits the software you have', 'FHIR R4 endpoints and signed webhooks for your EHR, CSV import from your current practice software, ABHA and HFR/HPR identifiers ready for ABDM.'],
];

export default function Landing() {
  return (
    <div className="landing">
      <header className="landing-head">
        <div className="row"><div className="brand-mark" style={{ background: 'var(--rail)', color: '#fff' }}><Logo /></div><div className="brand-name">Clinovara</div></div>
        <div className="row gap-6"><a className="btn ghost" href="#/login">Log in</a><a className="btn primary" href="#/signup">Register your clinic</a></div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">Front office for dental clinics in India</div>
          <h1>Your reception, answering at <em>8:41 in the morning</em> in the patient's own language.</h1>
          <p>Clinovara takes the calls and WhatsApp messages, fills the chairs, checks patients in with a token, briefs the dentist, and follows up after every visit. One clinic or twelve branches. Set up in an afternoon.</p>
          <div className="row gap-6 wrap">
            <a className="btn primary lg" href="#/signup">Start a 30-day trial <IconArrowRight size={18} /></a>
            <a className="btn lg" href="#/login?demo=1">Walk through the demo clinic</a>
          </div>
          <div className="tiny muted">No card needed. Each clinic's data is kept in its own store.</div>
        </div>
        <div className="ledger" aria-label="A day at SmileCare Dental">
          <div className="ledger-head"><b>SmileCare Dental, Indiranagar</b><span>Tuesday · sample day</span></div>
          {DAY.map(([t, who, what, tag]) => <div className="ledger-row" key={t}><span className="t">{t}</span><span><span className="who">{who}</span> <span className="what">{what}</span></span><span className="tag">{tag}</span></div>)}
        </div>
      </section>

      <section className="landing-section">
        <div><div className="eyebrow">What it does</div><h2>Six things a good front desk does, done every day without being asked.</h2></div>
        <div className="plain-list">{POINTS.map(([h, p]) => <div key={h}><h4>{h}</h4><p>{p}</p></div>)}</div>
      </section>

      <section className="landing-section">
        <div><div className="eyebrow">Setting up</div><h2>From registration to the first patient in ten steps.</h2><p className="small muted mt-8">Each step is checked against your real data, so the go-live checklist is honest. Skip and come back whenever you like.</p></div>
        <div className="col gap-16">
          <div className="steps-row">{['Clinic profile and registrations', 'Branches, timings, holidays', 'Dentists, fees, staff logins', 'Services and ₹ fees', 'Payments, cashless, PM-JAY, CGHS', 'Languages and WhatsApp templates', 'What the AI may say', 'Import patients', 'Marketing approvals', 'Kiosk, display, go live'].map((s, i) => <span key={s} className="step-chip"><span className="badge">{String(i + 1).padStart(2, '0')}</span>{s}</span>)}</div>
          <div className="callout">Built for the way Indian clinics work: ₹ fees, UPI and cashless, PM-JAY, CGHS and ESIC, Dental Council and Clinical Establishments registrations, DPDP consent, public holidays, and dentists who work across branches.</div>
        </div>
      </section>

      <footer className="row between wrap tiny muted" style={{ borderTop: '1px solid var(--border-strong)', paddingTop: 16 }}><span>Clinovara · dental-first, India-first</span><span>Messages, OTPs and invitations in the trial are shown on screen until you connect a provider.</span></footer>
    </div>
  );
}
