import React from 'react';
import Logo from '../components/Logo.jsx';

export const SUPPORT_EMAIL = 'support@clinovara.com';
const UPDATED = '28 October 2026';

const TERMS = [
  ['The service', 'Clinovara is a front-office service for dental clinics: scheduling, patient communication, check-in, forms, treatment plans and marketing tools. It supports your clinic staff and does not provide medical advice or replace clinical judgement.'],
  ['Your account', 'You must give accurate registration details and keep your password secret. The person who registers a clinic is its owner and is responsible for the staff they invite and for activity under their clinic account.'],
  ['Free trial and fees', 'New clinics get a 30-day free trial. We will tell you before any paid plan begins, and you can stop at any time. Fees already paid for a period are not refunded unless the law requires it.'],
  ['Your data', 'You own the clinic and patient data you put into Clinovara. You promise you have the right to store it, that you have obtained patient consent where the law requires it, and that you will use the service lawfully. You can export your data and ask us to delete it when you leave.'],
  ['Acceptable use', 'Do not use Clinovara to send unsolicited messages, to attack or probe the service, to store data you have no right to hold, or to resell access without our written agreement. Marketing messages may be sent only to patients who have opted in.'],
  ['Availability', 'We work to keep the service running but cannot promise it will always be uninterrupted or error-free. Messages and reminders depend on third-party providers and may be delayed.'],
  ['Liability', 'To the extent the law allows, our liability is limited to the fees you paid in the three months before the claim, and we are not liable for indirect or consequential loss.'],
  ['Changes and ending', 'We may update these terms and will notify you of material changes. You may close your clinic at any time. We may suspend an account that breaks these terms.'],
  ['Contact', `Questions: ${SUPPORT_EMAIL}.`],
];
const PRIVACY = [
  ['Who we are', 'For the patient and clinic data you enter, your clinic is the data fiduciary under the Digital Personal Data Protection Act, 2023 and Clinovara is its processor. For account and billing details of clinic owners and staff, Clinovara is the fiduciary.'],
  ['What we collect', 'Account details (name, email, phone, password hash), clinic profile, and the patient, appointment, form, treatment and message records your clinic enters. We also keep basic technical logs for security.'],
  ['Why we use it', 'To run the service you asked for: scheduling, reminders, check-in, forms, billing records and the AI front desk. We do not sell personal data and do not use patient records to advertise to third parties.'],
  ['Verification codes', 'We send one-time codes to your email to confirm you own it. Phone verification will be added when SMS delivery is available.'],
  ['AI features', 'When the AI front desk or marketing drafting uses Claude, the text needed for that request is sent to Anthropic to generate the reply. Clinical questions are handed to your staff and are not answered by the AI.'],
  ['Sharing', 'We share data only with service providers needed to run Clinovara (hosting, email and messaging delivery), with integrations you switch on, or when the law requires.'],
  ['Security and retention', 'Each clinic is stored separately, passwords are hashed, and access is limited by role. We keep data while your clinic account is active and delete it within 30 days of a verified closure request, except where the law requires us to keep it.'],
  ['Your rights', `Patients and clinic users can ask the clinic (or us, for account data) to access, correct or erase their data, and can withdraw consent. Write to ${SUPPORT_EMAIL}; we respond within 30 days.`],
  ['Contact and grievances', `Grievance contact: ${SUPPORT_EMAIL}.`],
];

export default function Legal({ kind }) {
  const terms = kind === 'terms'; const rows = terms ? TERMS : PRIVACY;
  return (
    <div className="auth" style={{ alignItems: 'start' }}>
      <div className="auth-card" style={{ width: 'min(720px, 100%)' }}>
        <a href="#/" className="row" style={{ color: 'inherit' }}><div className="brand-mark"><Logo /></div><div className="brand-name">Clinovara</div></a>
        <div><h1>{terms ? 'Terms of Service' : 'Privacy Policy'}</h1><p className="tiny muted">Last updated {UPDATED}</p></div>
        {rows.map(([h, p], i) => <div key={h}><h3 style={{ fontSize: 16 }}>{i + 1}. {h}</h3><p className="small" style={{ marginTop: 4 }}>{p}</p></div>)}
        <div className="tiny muted"><a href={terms ? '#/privacy' : '#/terms'}>{terms ? 'Privacy Policy' : 'Terms of Service'}</a> · <a href="#/signup">Back to registration</a></div>
      </div>
    </div>
  );
}
