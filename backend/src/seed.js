import { id, nowIso, addDays, addMinutes, dayKey, localDateTime } from './lib.js';
import { defaultProcedures, defaultFeePolicy } from './domain/catalogue.js';

const HOURS = { mon: ['09:00', '19:00'], tue: ['09:00', '19:00'], wed: ['09:00', '19:00'], thu: ['09:00', '19:00'], fri: ['09:00', '19:00'], sat: ['09:00', '17:00'], sun: null };

export function defaultSettings() {
  return {
    practice: {
      name: 'SmileCare Dental',
      tagline: 'Multi-branch dental care',
      phone: '+91 80 4123 4567',
      whatsapp: '+91 98450 12345',
      email: 'hello@smilecaredental.example',
      address: '12 100 Feet Road, Indiranagar, Bengaluru 560038',
      website: 'smilecaredental.example',
      hours: HOURS,
      slotMinutes: 15,
      registrationNumber: 'KMC/DC/2019/04471',
      clinicalEstablishmentNo: 'KA/BLR/CE/2019/1187',
      gstin: '29ABCDE1234F1Z5',
      city: 'Bengaluru', state: 'Karnataka',
    },
    holidays: defaultHolidays(),
    marketing: { googleReviewUrl: 'https://g.page/r/smilecare-demo/review', quietHours: { start: '09:00', end: '20:00' }, optOutText: 'Reply STOP to opt out.', autoThankYou: { enabled: true, mode: 'queue', delayMinutes: 60 }, autoReview: { enabled: true, mode: 'queue', delayHours: 4 }, festivals: [{ date: `${new Date().getFullYear()}-11-08`, name: 'Diwali' }] },
    locale: {
      country: 'IN', currency: 'INR', currencySymbol: '₹', numberLocale: 'en-IN', phoneCountryCode: '91', timezone: 'Asia/Kolkata',
      languages: [{ code: 'en', name: 'English' }, { code: 'hi', name: 'हिन्दी' }, { code: 'kn', name: 'ಕನ್ನಡ' }],
      defaultLanguage: 'en', defaultChannel: 'whatsapp',
    },
    locations: [
      { id: 'loc_indiranagar', name: 'Indiranagar', address: '12 100 Feet Road, Indiranagar, Bengaluru 560038', phone: '+91 80 4123 4567', hours: HOURS, chairs: 4, kioskCode: 'IND1', hfrId: 'IN2910001234' },
      { id: 'loc_whitefield', name: 'Whitefield', address: '4 ITPL Main Road, Whitefield, Bengaluru 560066', phone: '+91 80 4123 4599', hours: { ...HOURS, sat: ['09:00', '14:00'] }, chairs: 2, kioskCode: 'WHF1', hfrId: 'IN2910005678' },
    ],
    providers: [
      { id: 'prov_rao', name: 'Dr. Ananya Rao', role: 'Dentist', specialty: 'General & cosmetic dentistry', qualifications: 'BDS, MDS', councilRegNo: 'KSDC A-12345', hprId: '71-1234-5678-9012', locationIds: ['loc_indiranagar'], consultationFee: 500 },
      { id: 'prov_menon', name: 'Dr. Vikram Menon', role: 'Dentist', specialty: 'Endodontist', qualifications: 'BDS, MDS (Endodontics)', councilRegNo: 'KSDC A-23456', hprId: '71-2345-6789-0123', locationIds: ['loc_indiranagar', 'loc_whitefield'], consultationFee: 700 },
      { id: 'prov_khan', name: 'Dr. Sana Khan', role: 'Dentist', specialty: 'Orthodontist', qualifications: 'BDS, MDS (Orthodontics)', locationIds: ['loc_whitefield'], consultationFee: 800 },
      { id: 'prov_iyer', name: 'Dr. Arjun Iyer', role: 'Dentist', specialty: 'Pediatric dentist', qualifications: 'BDS, MDS (Pedodontics)', locationIds: ['loc_indiranagar'], consultationFee: 600 },
      { id: 'prov_reddy', name: 'Sunitha Reddy', role: 'Hygienist', specialty: 'Dental hygienist', qualifications: 'Dip. Dental Hygiene', locationIds: ['loc_indiranagar', 'loc_whitefield'], consultationFee: 0 },
    ],
    visitTypes: [
      { id: 'vt_cleaning', name: 'Cleaning & check-up', durationMin: 45, providerRole: 'Hygienist', fee: 1500, keywords: ['cleaning', 'clean', 'scaling', 'polish', 'hygiene', 'checkup', 'check-up', 'check up', 'recall', 'six month', 'safai', 'daant saaf'] },
      { id: 'vt_newpatient', name: 'New patient consultation', durationMin: 60, providerRole: 'Dentist', fee: 500, keywords: ['new patient', 'first visit', 'first time', 'never been', 'new here', 'consultation', 'consult', 'check my teeth', 'dikhana', 'pehli baar', 'x-ray', 'xray', 'opg'] },
      { id: 'vt_ortho', name: 'Braces / aligner consult', durationMin: 30, providerRole: 'Dentist', fee: 800, keywords: ['braces', 'aligner', 'aligners', 'invisalign', 'orthodont', 'crooked', 'gap in teeth', 'clips'] },
      { id: 'vt_procedure', name: 'Procedure', durationMin: 60, providerRole: 'Dentist', fee: 0, keywords: ['filling', 'crown', 'root canal', 'rct', 'extraction', 'procedure', 'treatment', 'bridge', 'implant', 'veneer', 'whitening', 'bleaching', 'cap', 'wisdom tooth'] },
      { id: 'vt_child', name: "Child's dental visit", durationMin: 30, providerRole: 'Dentist', fee: 600, keywords: ['child', 'kid', 'kids', 'son', 'daughter', 'baby', 'bachcha', 'bachche', 'beta', 'beti', 'school'] },
      { id: 'vt_followup', name: 'Follow-up', durationMin: 20, providerRole: 'Dentist', fee: 0, keywords: ['follow up', 'follow-up', 'followup', 'review', 'suture', 'stitches', 'check the'] },
      { id: 'vt_urgent', name: 'Urgent visit', durationMin: 30, providerRole: 'Dentist', fee: 700, keywords: ['pain', 'hurts', 'hurting', 'toothache', 'emergency', 'urgent', 'swelling', 'swollen', 'broken', 'chipped', 'cracked', 'knocked out', 'bleeding', 'abscess', 'pus', 'lost a crown', 'lost a filling', 'asap', 'dard', 'sujan', 'toot gaya', 'khoon'] },
    ],
    faqs: [
      { id: 'faq_hours', question: 'What are your timings?', answer: 'We are open Monday to Saturday, 9:00 AM to 7:00 PM (Whitefield closes at 2:00 PM on Saturdays). We are closed on Sundays and public holidays.', keywords: ['hours', 'timing', 'timings', 'open', 'close', 'closing', 'opening', 'sunday', 'saturday', 'holiday', 'kab khulta', 'time kya'] },
      { id: 'faq_location', question: 'Where are you located?', answer: 'Indiranagar: 12 100 Feet Road, near the metro station (two-wheeler and car parking in the basement). Whitefield: 4 ITPL Main Road, opposite the Phoenix mall. Both branches are on Google Maps as SmileCare Dental.', keywords: ['where', 'located', 'address', 'location', 'branch', 'branches', 'parking', 'directions', 'kahan', 'metro', 'map'] },
      { id: 'faq_insurance', question: 'Do you accept insurance or cashless?', answer: 'Yes. We are empanelled for cashless treatment with Star Health, HDFC ERGO, Niva Bupa, ICICI Lombard, New India Assurance and most TPAs, and we accept CGHS and ESIC referrals. Most policies cover dental only for accidents or hospitalisation, so we will check your policy before your visit. Add your policy details in the pre-visit form.', keywords: ['insurance', 'cashless', 'tpa', 'mediclaim', 'policy', 'star health', 'hdfc', 'niva', 'bupa', 'icici', 'new india', 'cghs', 'esic', 'ayushman', 'pm-jay', 'pmjay', 'covered', 'claim', 'reimburse', 'bima'] },
      { id: 'faq_payment', question: 'How can I pay and what does it cost?', answer: 'We accept UPI (GPay, PhonePe, Paytm), cash, and all debit or credit cards, and we offer no-cost EMI for treatment above ₹10,000. A first consultation is ₹500 and cleaning is ₹1,500; the dentist gives you a written estimate before any treatment.', keywords: ['payment', 'pay', 'upi', 'gpay', 'phonepe', 'paytm', 'cash', 'card', 'emi', 'cost', 'price', 'fees', 'fee', 'charge', 'charges', 'how much', 'kitna', 'rate'] },
      { id: 'faq_newpatient', question: 'What should I bring to my first visit?', answer: 'Please bring a photo ID, any previous dental x-rays or reports, a list of current medicines, and your insurance card or ABHA number if you have one. Completing the pre-visit form on your phone saves about 15 minutes at the clinic.', keywords: ['bring', 'first visit', 'what do i need', 'documents', 'forms', 'paperwork', 'reports', 'kya lana'] },
      { id: 'faq_kids', question: 'Do you treat children?', answer: 'Yes. Dr. Arjun Iyer is our pediatric dentist at Indiranagar. We recommend a first visit by age 3 and a check-up every 6 months.', keywords: ['kids', 'children', 'child', 'pediatric', 'paediatric', 'bachcha', 'bachche', 'toddler'] },
      { id: 'faq_abha', question: 'Do you support ABHA / Ayushman Bharat Health Account?', answer: 'Yes. Share your ABHA number or address in the pre-visit form and we will link your dental records to it with your consent, so any doctor you authorise can see them.', keywords: ['abha', 'ayushman bharat health account', 'health id', 'abdm', 'digital health'] },
      { id: 'faq_cancel', question: 'What is your cancellation policy?', answer: 'Please let us know at least 24 hours in advance to reschedule or cancel so we can offer the time to another patient. Reply here any time to change your appointment.', keywords: ['cancellation policy', 'cancel policy', 'late fee', 'no show', 'notice'] },
      { id: 'faq_rct', question: 'How many visits does a root canal take?', answer: 'Most root canals at SmileCare are completed in one or two visits of about an hour each, followed by a crown. The dentist will confirm after examining the tooth and x-ray.', keywords: ['root canal visits', 'rct visits', 'how many sittings', 'sittings', 'how long does root canal'] },
    ],
    escalationKeywords: ['diagnose', 'diagnosis', 'should i take', 'dose', 'dosage', 'antibiotic', 'prescription', 'prescribe', 'medication question', 'x-ray results', 'results', 'is it normal', 'infection', 'numb', 'complaint', 'refund', 'dispute', 'lawyer', 'records', 'hipaa', 'mistake', 'wrong tooth', 'allergic reaction', 'pregnant', 'blood thinner'],
    rules: {
      cancelNoticeHours: 24,
      reminderHoursBefore: [24, 2],
      waitlistAutoOffer: true,
      recallIntervalMonths: 6,
      kioskResetSeconds: 90,
      unansweredMinutes: 30,
      bookingHorizonDays: 45,
      tokensPerLocation: true,
      noShowAfterMinutes: 20,
    },
    afterHours: { enabled: true, takeMessages: true, message: { en: 'We are closed right now and open {{opens}}. I can still book or change an appointment for you, or take a message for the team to call you back first thing.', hi: 'हम अभी बंद हैं और {{opens}} खुलेंगे। मैं अब भी आपके लिए अपॉइंटमेंट बुक या बदल सकता हूँ, या टीम के लिए संदेश ले सकता हूँ ताकि वे सुबह सबसे पहले आपको कॉल करें।' }, emergency: 'If this is an emergency — uncontrolled bleeding, swelling spreading to the eye or neck, or trouble breathing — please go to the nearest emergency room or call 108.' },
    paymentModes: ['UPI', 'Cash', 'Card', 'Insurance / cashless', 'EMI'],
    insuranceOptions: [
      { id: 'private', label: 'Private insurer / TPA (cashless)', examples: 'Star Health, HDFC ERGO, Niva Bupa, ICICI Lombard, New India Assurance' },
      { id: 'pmjay', label: 'Ayushman Bharat PM-JAY' },
      { id: 'cghs', label: 'CGHS' },
      { id: 'esic', label: 'ESIC' },
      { id: 'corporate', label: 'Corporate / employer plan' },
      { id: 'self', label: 'Self-pay (no insurance)' },
    ],
    templates: [
      { id: 'tpl_reminder24', type: 'reminder', name: 'Reminder — 1 day before', body: { en: 'Hi {{firstName}}, this is {{practice}}. You have a {{visitType}} on {{when}} with {{provider}} at our {{location}} branch. Reply C to confirm or R to reschedule.', hi: 'नमस्ते {{firstName}}, {{practice}} की ओर से। आपकी {{visitType}} {{when}} को {{provider}} के साथ {{location}} शाखा में है। पुष्टि के लिए C या समय बदलने के लिए R भेजें।' } },
      { id: 'tpl_reminder2', type: 'reminder', name: 'Reminder — 2 hours before', body: { en: 'Hi {{firstName}}, see you at {{time}} today at {{practice}} {{location}}. Check in at the kiosk when you arrive and we will give you a token.', hi: 'नमस्ते {{firstName}}, आज {{time}} बजे {{practice}} {{location}} में मिलते हैं। पहुँचकर कियोस्क पर चेक-इन करें, आपको टोकन मिलेगा।' } },
      { id: 'tpl_prep', type: 'prep', name: 'Preparation instructions', body: { en: 'Hi {{firstName}}, before your {{visitType}} on {{when}}: eat a light meal, bring your previous x-rays or reports, and arrive 10 minutes early. Reply here with any questions.', hi: 'नमस्ते {{firstName}}, {{when}} की {{visitType}} से पहले: हल्का भोजन करें, पुराने एक्स-रे या रिपोर्ट साथ लाएँ, और 10 मिनट पहले पहुँचें। कोई प्रश्न हो तो यहाँ जवाब दें।' } },
      { id: 'tpl_forms', type: 'forms', name: 'Pre-visit form', body: { en: 'Hi {{firstName}}, please fill your pre-visit form before your {{visitType}} on {{when}}: {{formsLink}} — it takes about 5 minutes and saves time at the clinic.', hi: 'नमस्ते {{firstName}}, कृपया {{when}} की {{visitType}} से पहले अपना फ़ॉर्म भरें: {{formsLink}} — इसमें लगभग 5 मिनट लगते हैं।' } },
      { id: 'tpl_recall', type: 'recall', name: 'Recall — due for a cleaning', body: { en: 'Hi {{firstName}}, it has been 6 months since your last cleaning at {{practice}}. Reply BOOK and we will find a convenient time.', hi: 'नमस्ते {{firstName}}, {{practice}} में आपकी पिछली सफाई को 6 महीने हो गए हैं। BOOK भेजें, हम सुविधाजनक समय ढूँढ देंगे।' } },
      { id: 'tpl_postvisit', type: 'post_visit', name: 'Post-visit check-in', body: { en: 'Hi {{firstName}}, thank you for visiting {{practice}} today. How are you feeling? Reply here if you have any questions about your treatment or next steps.', hi: 'नमस्ते {{firstName}}, आज {{practice}} आने के लिए धन्यवाद। आप कैसा महसूस कर रहे हैं? इलाज या अगले कदम के बारे में कोई प्रश्न हो तो यहाँ जवाब दें।' } },
      { id: 'tpl_waitlist', type: 'waitlist', name: 'Waitlist offer', body: { en: 'Hi {{firstName}}, an earlier {{visitType}} opened up on {{when}} with {{provider}} at {{location}}. Reply YES within 2 hours to take it.', hi: 'नमस्ते {{firstName}}, {{when}} को {{provider}} के साथ {{location}} में {{visitType}} का पहले का समय उपलब्ध हुआ है। 2 घंटे में YES भेजें।' } },
      { id: 'tpl_unscheduled', type: 'treatment', name: 'Unscheduled treatment follow-up', body: { en: 'Hi {{firstName}}, {{provider}} recommended {{treatment}} at your last visit. Shall we find a time for it? Reply here and we will help you book.', hi: 'नमस्ते {{firstName}}, पिछली विज़िट में {{provider}} ने {{treatment}} की सलाह दी थी। क्या हम इसके लिए समय तय करें? यहाँ जवाब दें।' } },
      { id: 'tpl_missed_appt', type: 'missed_appointment', name: 'Missed appointment', body: { en: 'Hi {{firstName}}, we missed you for your {{visitType}} with {{provider}} today at {{time}}. No problem — reply here and we will find another time that suits you, or reply BOOK.', hi: 'नमस्ते {{firstName}}, आज {{time}} बजे {{provider}} के साथ आपकी {{visitType}} में आप नहीं आ सके। कोई बात नहीं — यहाँ जवाब दें, हम दूसरा उपयुक्त समय ढूँढ देंगे, या BOOK भेजें।' } },
      { id: 'tpl_missed_call', type: 'missed_call', name: 'Missed call (open hours)', body: { en: 'Hi {{firstName}}, sorry we missed your call to {{practice}}. Reply here with what you need and we will help right away, or we will call you back within the hour.', hi: 'नमस्ते {{firstName}}, {{practice}} पर आपकी कॉल हमसे छूट गई, क्षमा करें। यहाँ बताइए आपको क्या चाहिए, हम तुरंत मदद करेंगे, या एक घंटे में कॉल करेंगे।' } },
      { id: 'tpl_missed_call_closed', type: 'missed_call', name: 'Missed call (after hours)', body: { en: 'Hi {{firstName}}, thanks for calling {{practice}}. We are closed now and open {{opens}}. Reply here to book or leave a message and we will call you back first thing. For emergencies go to the nearest emergency room or call 108.', hi: 'नमस्ते {{firstName}}, {{practice}} को कॉल करने के लिए धन्यवाद। हम अभी बंद हैं और {{opens}} खुलेंगे। बुक करने या संदेश छोड़ने के लिए यहाँ जवाब दें, हम सुबह सबसे पहले कॉल करेंगे। आपातकाल में नज़दीकी अस्पताल जाएँ या 108 पर कॉल करें।' } },
      { id: 'tpl_token', type: 'token', name: 'Token issued', body: { en: 'Hi {{firstName}}, your token at {{practice}} {{location}} is {{token}}. We will call you shortly; you can watch the display board.', hi: 'नमस्ते {{firstName}}, {{practice}} {{location}} में आपका टोकन {{token}} है। हम आपको जल्द बुलाएँगे।' } },
    ],
    consentText: 'I consent to dental examination and treatment as explained to me by my dentist, including local anaesthesia and x-rays where needed. I understand the treatment plan and estimate may change after examination, that I may ask questions at any time, and that I am responsible for charges not covered by my insurance or scheme. I consent to SmileCare Dental storing my health information securely and, if I provide an ABHA ID, linking my records with my consent as per ABDM guidelines and the Digital Personal Data Protection Act, 2023.',
    integrations: {
      apiKey: '',
      webhooks: [],
      messaging: { provider: 'none', senderId: '', notes: 'Connect the WhatsApp Business API (Meta Cloud API, Gupshup, Interakt) or an SMS gateway (MSG91, Kaleyra) here. Until then messages are recorded in the outbox only.' },
      ehr: { name: '', fhirBaseUrl: '', notes: '' },
      abdm: { hipId: '', hipName: '', enabled: false },
    },
    procedures: defaultProcedures(),
    fees: defaultFeePolicy(),
    assistant: { enabled: true, answerWhen: 'closed', takeNotes: true, phrases: {} },
  };
}

const P = (firstName, lastName, dob, gender, phone, email, extra = {}) => ({
  id: id('pat'), firstName, lastName, dob, gender, phone, email,
  preferredLanguage: 'en', abhaNumber: '', abhaAddress: '', locationId: 'loc_indiranagar', city: 'Bengaluru', address: '', marketingOptIn: true,
  insurance: { type: 'self', carrier: '', memberId: '', groupNumber: '', tpa: '', cardScannedAt: null, verified: false },
  lastVisit: null, nextRecallDue: null, notes: '', tags: [], createdAt: nowIso(), ...extra,
});

export function buildSeed() {
  const settings = defaultSettings();
  const now = nowIso();
  const today = dayKey(now);
  const d = (n) => dayKey(addDays(now, n));
  const IND = 'loc_indiranagar'; const WHF = 'loc_whitefield';

  const patients = [
    P('Meera', 'Krishnan', '1988-04-12', 'female', '9845011001', 'meera.k@example.in', { abhaNumber: '91-2345-6789-0123', abhaAddress: 'meera.k@abdm', insurance: { type: 'private', carrier: 'Star Health', memberId: 'SH4471902', groupNumber: '', tpa: 'Medi Assist', cardScannedAt: null, verified: true }, lastVisit: d(-182), nextRecallDue: d(-2) }),
    P('Rohan', 'Patil', '1979-11-03', 'male', '9845011002', 'rohan.p@example.in', { preferredLanguage: 'hi', insurance: { type: 'corporate', carrier: 'HDFC ERGO (Infosys group plan)', memberId: 'HE9910023', groupNumber: 'INF-22', tpa: 'Paramount', cardScannedAt: null, verified: false }, lastVisit: d(-40) }),
    P('Lakshmi', 'Venkatesh', '1995-07-21', 'female', '9845011003', 'lakshmi.v@example.in', { preferredLanguage: 'kn', lastVisit: d(-210), nextRecallDue: d(-28) }),
    P('Suresh', 'Adiga', '1962-01-30', 'male', '9845011004', 'suresh.a@example.in', { insurance: { type: 'cghs', carrier: 'CGHS', memberId: 'CGHS-BLR-220191', groupNumber: '', tpa: '', cardScannedAt: d(-5), verified: true }, lastVisit: d(-95), notes: 'Retired central govt. Prefers morning slots.' }),
    P('Priya', 'Raman', '2001-09-09', 'female', '9845011005', 'priya.r@example.in', {}),
    P('Arjun', 'Nair', '1990-03-15', 'male', '9845011006', 'arjun.n@example.in', { insurance: { type: 'private', carrier: 'Niva Bupa', memberId: 'NB7731212', groupNumber: '', tpa: '', cardScannedAt: null, verified: true }, lastVisit: d(-150), nextRecallDue: d(30) }),
    P('Fatima', 'Sheikh', '1975-12-02', 'female', '9845011007', 'fatima.s@example.in', { preferredLanguage: 'hi', locationId: WHF, lastVisit: d(-400), nextRecallDue: d(-220) }),
    P('Aarav', 'Fernandes', '2016-05-27', 'male', '9845011008', 'fernandes.family@example.in', { lastVisit: d(-190), nextRecallDue: d(-10), notes: 'Pediatric patient — mother Anita Fernandes attends. Shares phone with sister Zoya.' }),
    P('Zoya', 'Fernandes', '2019-08-14', 'female', '9845011008', 'fernandes.family@example.in', { notes: 'Pediatric patient — shares phone with brother Aarav.' }),
    P('Grace', 'D\'Souza', '1984-08-18', 'female', '9845011009', 'grace.d@example.in', { locationId: WHF, lastVisit: d(-12) }),
    P('Omar', 'Hussain', '1998-02-06', 'male', '9845011010', 'omar.h@example.in', { locationId: WHF, lastVisit: d(-365), nextRecallDue: d(-185) }),
    P('Kavya', 'Shetty', '1993-06-30', 'female', '9845011011', 'kavya.s@example.in', { locationId: WHF, insurance: { type: 'pmjay', carrier: 'Ayushman Bharat PM-JAY', memberId: 'PMJAY-KA-88213', groupNumber: '', tpa: '', cardScannedAt: null, verified: false } }),
  ];
  const [meera, rohan, lakshmi, suresh, priya, arjun, fatima, aarav, zoya, grace, omar, kavya] = patients;

  const appt = (patient, visitTypeId, providerId, locationId, day, hhmm, status = 'scheduled', extra = {}) => {
    const vt = settings.visitTypes.find((v) => v.id === visitTypeId);
    const start = localDateTime(day, hhmm);
    return {
      id: id('apt'), patientId: patient.id, visitTypeId, providerId, locationId, start, end: addMinutes(start, vt.durationMin),
      status, source: 'staff', notes: '', reminders: [], createdAt: addDays(now, -7), confirmedAt: null,
      cancelledAt: null, cancelReason: null, fee: vt.fee || settings.providers.find((p) => p.id === providerId)?.consultationFee || 0, paymentStatus: 'unpaid', paymentMode: null, ...extra,
    };
  };

  const appointments = [
    appt(meera, 'vt_cleaning', 'prov_reddy', IND, today, '09:00', 'completed', { confirmedAt: addDays(now, -1), completedAt: localDateTime(today, '09:50'), paymentStatus: 'paid', paymentMode: 'UPI', paidAmount: 1500, paidAt: localDateTime(today, '09:52'), paymentReference: 'UPI-4471' }),
    appt(rohan, 'vt_procedure', 'prov_menon', IND, today, '10:00', 'arrived', { confirmedAt: addDays(now, -1), fee: 6000, notes: 'RCT #36 sitting 1' }),
    appt(suresh, 'vt_newpatient', 'prov_rao', IND, today, '10:30', 'arrived', { confirmedAt: addDays(now, -2) }),
    appt(grace, 'vt_cleaning', 'prov_reddy', WHF, today, '11:00', 'confirmed', { confirmedAt: addDays(now, -1) }),
    appt(priya, 'vt_newpatient', 'prov_rao', IND, today, '11:30', 'scheduled', { source: 'ai' }),
    appt(arjun, 'vt_procedure', 'prov_menon', IND, today, '14:30', 'confirmed', { confirmedAt: addDays(now, -1), fee: 6000, notes: 'RCT #46' }),
    appt(aarav, 'vt_child', 'prov_iyer', IND, today, '16:00', 'scheduled'),
    appt(kavya, 'vt_ortho', 'prov_khan', WHF, today, '16:30', 'scheduled', { source: 'patient' }),
    appt(lakshmi, 'vt_cleaning', 'prov_reddy', IND, d(1), '09:30', 'scheduled', { source: 'ai' }),
    appt(omar, 'vt_urgent', 'prov_menon', WHF, d(2), '09:00', 'scheduled', { source: 'patient' }),
    appt(grace, 'vt_procedure', 'prov_menon', WHF, d(6), '10:00', 'scheduled', { fee: 2500 }),
    appt(rohan, 'vt_cleaning', 'prov_reddy', IND, d(-3), '15:00', 'cancelled', { cancelledAt: addDays(now, -3.2), cancelReason: 'Office meeting', cancelledLate: true }),
    appt(arjun, 'vt_ortho', 'prov_khan', WHF, d(-8), '17:30', 'no_show'),
    appt(meera, 'vt_cleaning', 'prov_reddy', IND, d(-182), '09:00', 'completed', { completedAt: addDays(now, -182), paymentStatus: 'paid', paymentMode: 'Cash', paidAmount: 1200, paidAt: addDays(now, -182) }),
    appt(suresh, 'vt_procedure', 'prov_rao', IND, d(-95), '10:00', 'completed', { completedAt: addDays(now, -95), paymentStatus: 'paid', paymentMode: 'Insurance / cashless', paidAmount: 4500, paidAt: addDays(now, -95) }),
    appt(grace, 'vt_newpatient', 'prov_rao', IND, d(-12), '11:00', 'completed', { completedAt: addDays(now, -12), paymentStatus: 'paid', paymentMode: 'UPI', paidAmount: 500, paidAt: addDays(now, -12) }),
  ];
  const [aMeeraToday, aRohanToday, aSureshToday, aGraceToday, aPriyaToday, aArjunToday, aAaravToday, aKavyaToday, aLakshmi, aOmar, aGraceProc] = appointments;

  const section = (complete, data = {}) => ({ complete, updatedAt: complete ? addDays(now, -1) : null, data });
  const packet = (patient, a, status, sections) => ({
    id: id('pkt'), patientId: patient.id, appointmentId: a.id, token: id('tok').replace('tok_', ''),
    sentAt: addDays(now, -3), status, updatedAt: addDays(now, -1), remindersSent: 0,
    sections: { medicalHistory: section(false), dentalConcerns: section(false), medications: section(false), allergies: section(false), insurance: section(false), consent: section(false), ...sections },
  });
  const formPackets = [
    packet(rohan, aRohanToday, 'complete', {
      medicalHistory: section(true, { conditions: ['High blood pressure'], surgeries: '', smoker: 'no', pregnant: 'not applicable', notes: '' }),
      dentalConcerns: section(true, { concerns: 'Pain in lower left molar when chewing', lastCleaning: '6–12 months', anxiety: 'a little', bleedingGums: 'sometimes' }),
      medications: section(true, { list: 'Telmisartan 40mg daily', bloodThinners: 'no' }),
      allergies: section(true, { list: 'Penicillin', latex: 'no' }),
      insurance: section(true, { type: 'corporate', carrier: 'HDFC ERGO (Infosys group plan)', memberId: 'HE9910023', groupNumber: 'INF-22', tpa: 'Paramount', abhaNumber: '' }),
      consent: section(true, { signature: 'Rohan Patil', signedAt: addDays(now, -1) }),
    }),
    packet(suresh, aSureshToday, 'partial', {
      medicalHistory: section(true, { conditions: ['Diabetes', 'Heart condition'], surgeries: 'Knee replacement 2019', smoker: 'former', pregnant: 'not applicable', notes: '' }),
      dentalConcerns: section(true, { concerns: 'Interested in implant for missing lower molar', lastCleaning: 'under 6 months', anxiety: 'no', bleedingGums: 'no' }),
      medications: section(true, { list: 'Metformin 500mg, Atorvastatin 20mg, Ecosprin 75mg', bloodThinners: 'yes' }),
      allergies: section(false),
      insurance: section(true, { type: 'cghs', carrier: 'CGHS', memberId: 'CGHS-BLR-220191', groupNumber: '', tpa: '', abhaNumber: '' }),
      consent: section(false),
    }),
    packet(grace, aGraceToday, 'complete', {
      medicalHistory: section(true, { conditions: [], surgeries: '', smoker: 'no', pregnant: 'no', notes: '' }),
      dentalConcerns: section(true, { concerns: '', lastCleaning: 'over a year', anxiety: 'no', bleedingGums: 'no' }),
      medications: section(true, { list: 'None', bloodThinners: 'no' }),
      allergies: section(true, { list: 'None', latex: 'no' }),
      insurance: section(true, { type: 'self', selfPay: true, carrier: 'Self-pay', memberId: '', groupNumber: '', abhaNumber: '' }),
      consent: section(true, { signature: "Grace D'Souza", signedAt: addDays(now, -2) }),
    }),
    packet(priya, aPriyaToday, 'sent', {}),
    packet(arjun, aArjunToday, 'partial', {
      medicalHistory: section(true, { conditions: ['Asthma'], surgeries: '', smoker: 'no', pregnant: 'not applicable', notes: '' }),
      medications: section(true, { list: 'Salbutamol inhaler as needed', bloodThinners: 'no' }),
    }),
    packet(lakshmi, aLakshmi, 'sent', {}),
    packet(kavya, aKavyaToday, 'sent', {}),
  ];

  const visits = [
    { id: id('vis'), appointmentId: aMeeraToday.id, patientId: meera.id, locationId: IND, token: 'A01', arrivedAt: localDateTime(today, '08:52'), checkInSource: 'kiosk', status: 'done', missing: [], helpRequested: false, insuranceScannedAt: localDateTime(today, '08:54'), consentSignedAt: localDateTime(today, '08:55'), readyAt: localDateTime(today, '08:56'), calledAt: localDateTime(today, '09:02'), broughtBackAt: localDateTime(today, '09:03'), doneAt: localDateTime(today, '09:50') },
    { id: id('vis'), appointmentId: aRohanToday.id, patientId: rohan.id, locationId: IND, token: 'A02', arrivedAt: localDateTime(today, '09:48'), checkInSource: 'kiosk', status: 'ready', missing: [], helpRequested: false, insuranceScannedAt: localDateTime(today, '09:50'), consentSignedAt: addDays(now, -1), readyAt: localDateTime(today, '09:51'), calledAt: null, broughtBackAt: null },
    { id: id('vis'), appointmentId: aSureshToday.id, patientId: suresh.id, locationId: IND, token: 'A03', arrivedAt: localDateTime(today, '10:11'), checkInSource: 'desk', status: 'needs_attention', missing: ['Allergies', 'Consent'], helpRequested: true, helpNote: 'Needs larger text on the kiosk', insuranceScannedAt: null, consentSignedAt: null, readyAt: null, calledAt: null, broughtBackAt: null },
  ];

  const msg = (from, text, minsAgo, extra = {}) => ({ id: id('msg'), from, text, at: addMinutes(now, -minsAgo), ...extra });
  const conversations = [
    {
      id: id('cnv'), patientId: null, contactName: 'Tara Bhat', contactPhone: '9845099911', channel: 'whatsapp', status: 'ai',
      reason: 'New patient asking about cashless', createdAt: addMinutes(now, -14), updatedAt: addMinutes(now, -12), assignedTo: null,
      messages: [
        msg('patient', 'Hi, do you take Star Health cashless? And are you taking new patients at Whitefield?', 14, { intent: 'faq' }),
        msg('ai', 'Yes on both. We are empanelled with Star Health for cashless treatment, and Whitefield is welcoming new patients. Most policies cover dental only for accidents or hospitalisation, so we will check your policy before the visit. Would you like to book a new patient consultation? It takes about an hour.', 13, { intent: 'faq' }),
        msg('patient', 'Yes, something next week in the evening if possible', 12, { intent: 'book' }),
      ],
      unread: true,
    },
    {
      id: id('cnv'), patientId: omar.id, contactName: 'Omar Hussain', contactPhone: omar.phone, channel: 'whatsapp', status: 'needs_staff',
      reason: 'Question about antibiotic before urgent visit', createdAt: addMinutes(now, -55), updatedAt: addMinutes(now, -50), assignedTo: null,
      messages: [
        msg('patient', 'My tooth is really swollen. Should I take the leftover amoxicillin I have at home before my appointment?', 55, { intent: 'clinical' }),
        msg('ai', 'I am sorry you are dealing with that. I cannot advise on medicines, so I am passing this to our dentist and someone will reply here shortly. Your urgent visit is booked for the day after tomorrow at 9:00 AM at Whitefield. If the swelling spreads to your eye or neck or you have trouble breathing, please go to the nearest emergency room.', 54, { intent: 'clinical', escalated: true }),
        msg('patient', 'Ok thank you', 50),
      ],
      escalation: { reason: 'Medication question (clinical)', at: addMinutes(now, -54) },
      unread: true,
    },
    {
      id: id('cnv'), patientId: lakshmi.id, contactName: 'Lakshmi Venkatesh', contactPhone: lakshmi.phone, channel: 'call', status: 'closed',
      reason: 'Booked overdue cleaning', createdAt: addDays(now, -1), updatedAt: addDays(now, -1), assignedTo: null,
      messages: [
        msg('patient', '[Voice] Hi, I think I am overdue for a cleaning, can I come tomorrow morning?', 1500, { intent: 'book' }),
        msg('ai', 'Of course. I have 9:30 AM tomorrow with Sunitha Reddy, our hygienist, at Indiranagar. Shall I book it?', 1499, { intent: 'book' }),
        msg('patient', '[Voice] Yes please.', 1498),
        msg('ai', 'Done. You are booked for a cleaning and check-up tomorrow at 9:30 AM. I have sent a WhatsApp confirmation and your pre-visit form.', 1497, { intent: 'booked' }),
      ],
      unread: false,
    },
    {
      id: id('cnv'), patientId: arjun.id, contactName: 'Arjun Nair', contactPhone: arjun.phone, channel: 'whatsapp', status: 'staff',
      reason: 'Reply to reminder', createdAt: addDays(now, -1), updatedAt: addMinutes(now, -200), assignedTo: 'Front desk',
      messages: [
        msg('ai', 'Hi Arjun, this is SmileCare Dental. You have a Procedure on today at 2:30 PM with Dr. Vikram Menon at our Indiranagar branch. Reply C to confirm or R to reschedule.', 1440, { intent: 'reminder' }),
        msg('patient', 'C. Also, can I get a copy of my OPG x-ray sent to my orthodontist?', 300, { intent: 'records' }),
        msg('ai', 'Thanks, you are confirmed. For records requests I will loop in our team, who will follow up with you here.', 299, { intent: 'records', escalated: true }),
        msg('staff', 'Hi Arjun, happy to help. Please reply with the orthodontist\'s clinic name and email and we will send the OPG with a release note.', 200, { by: 'Front desk' }),
      ],
      escalation: { reason: 'Records request (sensitive)', at: addMinutes(now, -299) },
      unread: false,
    },
  ];

  const waitlist = [
    { id: id('wl'), patientId: fatima.id, visitTypeId: 'vt_newpatient', locationId: WHF, preferredDays: ['mon', 'tue', 'wed'], preferredTime: 'morning', note: 'Wants a morning consultation at Whitefield; replied BOOK to recall', createdAt: addDays(now, -4), status: 'waiting', offer: null },
    { id: id('wl'), patientId: omar.id, visitTypeId: 'vt_urgent', locationId: null, preferredDays: ['any'], preferredTime: 'any', note: 'Take anything earlier, any branch', createdAt: addDays(now, -1), status: 'waiting', offer: null },
  ];

  const treatmentPlans = [
    {
      id: id('tp'), patientId: suresh.id, appointmentId: appointments[14].id, providerId: 'prov_rao', createdAt: addDays(now, -95), approvedBy: 'Dr. Ananya Rao', approvedAt: addDays(now, -95),
      items: [
        { id: id('tpi'), procedure: 'Implant consultation — #36', tooth: '36', priority: 'recommended', status: 'scheduled', estCost: 0, note: 'Consult booked' },
        { id: id('tpi'), procedure: 'Zirconia crown — #46', tooth: '46', priority: 'high', status: 'accepted', estCost: 9000, note: 'Patient wants to wait until after Diwali' },
      ],
      patientQuestions: [{ id: id('q'), question: 'Will CGHS cover the crown?', answer: 'CGHS covers metal crowns at approved rates; zirconia difference is payable. Estimate shared.', at: addDays(now, -90), answeredBy: 'Front desk' }],
      nextSteps: 'Schedule crown prep after consult; confirm CGHS approval letter.', nextVisitScheduled: true, nextAppointmentId: aSureshToday.id,
      followUps: [{ at: addDays(now, -60), by: 'Front desk', note: 'Called re crown; patient will call back after Diwali.' }],
    },
    {
      id: id('tp'), patientId: grace.id, appointmentId: appointments[15].id, providerId: 'prov_rao', createdAt: addDays(now, -12), approvedBy: 'Dr. Ananya Rao', approvedAt: addDays(now, -12),
      items: [
        { id: id('tpi'), procedure: 'Composite filling — #26 MO', tooth: '26', priority: 'high', status: 'scheduled', estCost: 2500, note: '' },
        { id: id('tpi'), procedure: 'Night guard', tooth: '', priority: 'elective', status: 'recommended', estCost: 4500, note: 'Signs of grinding' },
      ],
      patientQuestions: [], nextSteps: 'Filling booked at Whitefield; discuss night guard at that visit.', nextVisitScheduled: true, nextAppointmentId: aGraceProc.id, followUps: [],
    },
    {
      id: id('tp'), patientId: meera.id, appointmentId: aMeeraToday.id, providerId: 'prov_rao', createdAt: addMinutes(now, -120), approvedBy: 'Dr. Ananya Rao', approvedAt: addMinutes(now, -120),
      items: [{ id: id('tpi'), procedure: 'Composite filling — #16 O', tooth: '16', priority: 'high', status: 'recommended', estCost: 2500, note: 'Early decay' }],
      patientQuestions: [{ id: id('q'), question: 'Can this wait until my Star Health policy renews in January?', answer: '', at: addMinutes(now, -110), answeredBy: null }],
      nextSteps: 'Patient left without booking. Follow up this week.', nextVisitScheduled: false, nextAppointmentId: null, followUps: [],
    },
    {
      id: id('tp'), patientId: arjun.id, appointmentId: appointments[12].id, providerId: 'prov_menon', createdAt: addDays(now, -20), approvedBy: 'Dr. Vikram Menon', approvedAt: addDays(now, -20),
      items: [
        { id: id('tpi'), procedure: 'Root canal — #46', tooth: '46', priority: 'high', status: 'scheduled', estCost: 6000, note: '' },
        { id: id('tpi'), procedure: 'PFM crown — #46', tooth: '46', priority: 'high', status: 'recommended', estCost: 5500, note: 'After RCT' },
      ],
      patientQuestions: [], nextSteps: 'RCT today; book crown 2 weeks out.', nextVisitScheduled: true, nextAppointmentId: aArjunToday.id, followUps: [],
    },
  ];

  const comm = (patient, type, body, minsAgo, extra = {}) => ({ id: id('cm'), patientId: patient.id, type, channel: 'whatsapp', body, sentAt: addMinutes(now, -minsAgo), status: 'sent', appointmentId: null, delivery: 'simulated', ...extra });
  const communications = [
    comm(rohan, 'reminder', 'नमस्ते Rohan, SmileCare Dental की ओर से। आपकी Procedure आज 10:00 AM को Dr. Vikram Menon के साथ Indiranagar शाखा में है। पुष्टि के लिए C या समय बदलने के लिए R भेजें।', 1440, { appointmentId: aRohanToday.id, lang: 'hi' }),
    comm(rohan, 'token', 'नमस्ते Rohan, SmileCare Dental Indiranagar में आपका टोकन A02 है। हम आपको जल्द बुलाएँगे।', 130, { appointmentId: aRohanToday.id, lang: 'hi' }),
    comm(arjun, 'reminder', 'Hi Arjun, this is SmileCare Dental. You have a Procedure today at 2:30 PM with Dr. Vikram Menon at our Indiranagar branch. Reply C to confirm or R to reschedule.', 1440, { appointmentId: aArjunToday.id }),
    comm(lakshmi, 'forms', 'Hi Lakshmi, please fill your pre-visit form before your Cleaning & check-up tomorrow at 9:30 AM. It takes about 5 minutes.', 1490, { appointmentId: aLakshmi.id }),
    comm(meera, 'post_visit', 'Hi Meera, thank you for visiting SmileCare Dental today. How are you feeling? Reply here if you have any questions about your treatment or next steps.', 100, { appointmentId: aMeeraToday.id }),
    comm(fatima, 'recall', 'नमस्ते Fatima, SmileCare Dental में आपकी पिछली सफाई को 6 महीने हो गए हैं। BOOK भेजें, हम सुविधाजनक समय ढूँढ देंगे।', 7000, { lang: 'hi' }),
  ];

  const blocks = [
    { id: id('blk'), providerId: 'prov_khan', locationId: WHF, start: localDateTime(d(1), '09:00'), end: localDateTime(d(1), '19:00'), reason: 'Conference (IOS Bengaluru)', createdAt: now },
    { id: id('blk'), providerId: 'prov_rao', locationId: IND, start: localDateTime(today, '13:00'), end: localDateTime(today, '14:00'), reason: 'Lunch', createdAt: now },
  ];

  const activity = [
    { id: id('act'), type: 'kiosk', text: 'Rohan Patil checked in at the Indiranagar kiosk (token A02)', at: localDateTime(today, '09:51') },
    { id: id('act'), type: 'ai', text: 'AI front desk booked a cleaning for Lakshmi Venkatesh', at: addDays(now, -1) },
    { id: id('act'), type: 'escalation', text: 'Conversation with Omar Hussain sent to staff (medication question)', at: addMinutes(now, -54) },
  ];

  // Marks the calendar day this demo was generated for. Every appointment above is anchored to "today" at
  // generation time, so once the real date moves past it the whole demo (kiosk, arrivals, doctor's day) goes
  // stale — nothing due "today" any more. registry.js checks this on startup and reseeds automatically.

  // Ninety days of past activity so dashboards and charts have something real to show. Deterministic, so reseeding never shuffles it.
  {
    let seedN = 20260101; const rnd = () => { seedN |= 0; seedN = (seedN + 0x6D2B79F5) | 0; let t = Math.imul(seedN ^ (seedN >>> 15), 1 | seedN); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const pick = (list) => list[Math.floor(rnd() * list.length)];
    const weighted = (pairs) => { let r = rnd() * pairs.reduce((a, [, w]) => a + w, 0); for (const [v, w] of pairs) { r -= w; if (r <= 0) return v; } return pairs[0][0]; };
    const firsts = ['Anil', 'Divya', 'Karthik', 'Nisha', 'Rahul', 'Sneha', 'Vivek', 'Pooja', 'Manoj', 'Ritu', 'Sanjay', 'Deepa', 'Harish', 'Latha', 'Naveen', 'Asha', 'Imran', 'Shruti', 'Gopal', 'Bhavna', 'Tarun', 'Meena', 'Ajay', 'Kiran'];
    const lasts = ['Sharma', 'Gowda', 'Iyer', 'Reddy', 'Kulkarni', 'Menon', 'Joshi', 'Pillai', 'Das', 'Hegde', 'Naik', 'Bhat', 'Rao', 'Khan', 'Singh', 'Kamath'];
    const crowd = [];
    for (let i = 0; i < 130; i += 1) {
      const loc = rnd() < 0.7 ? IND : WHF; const born = addDays(now, -Math.floor(7000 + rnd() * 18000));
      const pt = P(pick(firsts), pick(lasts), dayKey(born), rnd() < 0.5 ? 'male' : 'female', `98450${String(30000 + i * 37).slice(0, 5)}`, '', { locationId: loc });
      pt.createdAt = addDays(now, -Math.floor(rnd() * 90) - 1); crowd.push(pt);
    }
    patients.push(...crowd);
    const pool = [...patients];
    const roles = { vt_cleaning: ['prov_reddy'], vt_newpatient: ['prov_rao'], vt_ortho: ['prov_khan'], vt_procedure: ['prov_menon', 'prov_rao'], vt_child: ['prov_iyer'], vt_followup: ['prov_menon', 'prov_rao'], vt_urgent: ['prov_rao', 'prov_menon'] };
    const fees = { vt_cleaning: [1200, 1500, 1800], vt_newpatient: [500, 800], vt_ortho: [800, 3500, 6000], vt_procedure: [4500, 6000, 8500, 12000], vt_child: [600, 900], vt_followup: [400, 600], vt_urgent: [700, 1500] };
    for (let back = 90; back >= 1; back -= 1) {
      const day = d(-back); const dow = new Date(`${day}T12:00:00`).getDay(); if (dow === 0) continue;
      const base = 9 + Math.round((90 - back) / 30) * 2 + (dow === 6 ? 0 : 4); const n = Math.max(4, base + Math.floor(rnd() * 6) - 2);
      for (let k = 0; k < n; k += 1) {
        const vtId = weighted([['vt_cleaning', 30], ['vt_newpatient', 16], ['vt_ortho', 10], ['vt_procedure', 18], ['vt_child', 9], ['vt_followup', 12], ['vt_urgent', 5]]);
        const hour = weighted([[9, 8], [10, 14], [11, 14], [12, 8], [14, 11], [15, 13], [16, 14], [17, 10], [18, 5]]);
        const patient = pick(pool); const status = weighted([['completed', 80], ['no_show', 8], ['cancelled', 12]]);
        const fee = pick(fees[vtId]); const a = appt(patient, vtId, pick(roles[vtId]), patient.locationId || IND, day, `${String(hour).padStart(2, '0')}:${rnd() < 0.5 ? '00' : '30'}`, status, { source: weighted([['staff', 55], ['website', 15], ['ai', 20], ['patient', 10]]), fee, createdAt: addDays(now, -back - 3) });
        if (status === 'completed') { a.completedAt = addMinutes(a.start, 50); const mode = weighted([['UPI', 45], ['Cash', 20], ['Card', 20], ['Insurance / cashless', 15]]); if (back > 5 || rnd() < 0.8) Object.assign(a, { paymentStatus: 'paid', paymentMode: mode, paidAmount: fee, paidAt: addMinutes(a.start, 65) }); }
        if (status === 'cancelled') { a.cancelledAt = addDays(a.start, -1); a.cancelReason = 'Patient request'; }
        appointments.push(a);
      }
    }
    // Where the synthetic patients heard about the clinic, and 90 days of outreach with bookings that followed it.
    for (const pt of crowd) pt.source = weighted([['Google search', 30], ['Google Maps', 20], ['Friend or family', 24], ['Instagram or Facebook', 12], ['Walked past', 8], ['Doctor referral', 6]]);
    const sentComm = (patient, type, sentAt, body, meta = {}, by = 'Clinovara') => communications.push({ id: id('cm'), patientId: patient.id, type, channel: 'whatsapp', body, sentAt, status: 'sent', appointmentId: null, meta, by, delivery: 'simulated', lang: 'en' });
    const followWith = (patient, sentAt) => { // a booking a few days after the message, for some patients
      const later = appointments.filter((x) => x.patientId === patient.id && x.status !== 'cancelled' && x.start > addDays(sentAt, 3) && x.start < addDays(now, 0)).sort((x, y) => x.start.localeCompare(y.start))[0];
      if (later && rnd() < 0.3) later.createdAt = addDays(sentAt, 1 + Math.floor(rnd() * 3));
    };
    const camp = (name, goal, segment, backDays, count, body) => {
      const sentAt = addDays(now, -backDays); const cid = id('cmp'); const audience = [...pool].sort(() => rnd() - 0.5).slice(0, count);
      for (const pt of audience) { sentComm(pt, 'marketing', sentAt, body.replace('{{firstName}}', pt.firstName), { campaignId: cid, goal }, `Campaign: ${name}`); followWith(pt, sentAt); }
      (settings.marketingCampaigns ||= []).unshift({ id: cid, name, goal, segment, locationId: null, lang: 'en', body, notes: '', brief: '', festival: '', promptId: null, engine: 'rules', status: 'sent', createdBy: 'Kavitha Nair', createdAt: addDays(sentAt, -2), updatedAt: sentAt, approvedBy: 'Dr. Ananya Rao', approvedAt: addDays(sentAt, -1), sentAt, sentBy: 'Dr. Ananya Rao', sentCount: count, history: [{ at: addDays(sentAt, -2), by: 'Kavitha Nair', action: 'created' }, { at: addDays(sentAt, -1), by: 'Dr. Ananya Rao', action: 'approve', reason: '' }, { at: sentAt, by: 'Dr. Ananya Rao', action: 'send', reason: '' }] });
    };
    camp('Diwali greeting', 'festival', 'all', 12, 30, 'Warm Diwali wishes to you and your family, {{firstName}}, from all of us at SmileCare Dental.');
    camp('Cleaning reminder: overdue patients', 'recall', 'overdue_recall', 24, 18, 'Hi {{firstName}}, your 6-monthly cleaning and check-up at SmileCare Dental is due. Reply BOOK and we will find a convenient time.');
    camp('Win back inactive patients', 'reactivation', 'inactive_12m', 41, 22, 'Hi {{firstName}}, it has been a while since we saw you at SmileCare Dental. A check-up keeps small issues from becoming big ones.');
    camp('Whitening month offer', 'offer', 'all', 63, 26, 'Hi {{firstName}}, this month at SmileCare Dental: professional whitening at a special price. Reply YES to book.');
    for (let k = 0; k < 40; k += 1) { const pt = pick(pool); const when = addDays(now, -Math.floor(rnd() * 28) - 1); sentComm(pt, 'recall', when, `Hi ${pt.firstName}, your cleaning and check-up is due. Reply BOOK.`); followWith(pt, when); }
    for (const a of appointments.filter((x) => x.status === 'completed' && x.start > addDays(now, -30) && rnd() < 0.5)) { const pt = patients.find((x) => x.id === a.patientId); if (!pt) continue; sentComm(pt, 'thank_you', addMinutes(a.start, 120), `Thank you for visiting SmileCare Dental today, ${pt.firstName}.`); if (rnd() < 0.6) sentComm(pt, 'review_request', addMinutes(a.start, 300), `Hi ${pt.firstName}, if you were happy with your visit, a Google review would mean a lot.`); }
  }

  // Some patients wrote back after a campaign or recall, as real patients do. Closed threads, so the inbox stays as it was.
  { let n = 31; const r3 = () => { n = (n * 1103515245 + 12345) & 0x7fffffff; return n / 0x7fffffff; };
    const replies = ['Yes please, is Saturday free?', 'Thank you, can I come next week?', 'Please book me for the morning', 'Yes, what time is available?', 'Can my wife also come along?'];
    for (const c of communications) {
      if (!['marketing', 'recall', 'treatment'].includes(c.type) || c.meta?.goal === 'festival' || r3() > 0.16) continue;
      const pt = patients.find((x) => x.id === c.patientId); if (!pt) continue;
      const at = new Date(new Date(c.sentAt).getTime() + (1 + Math.floor(r3() * 20)) * 3600000).toISOString(); if (at > now) continue;
      conversations.push({ id: id('cnv'), patientId: pt.id, contactName: `${pt.firstName} ${pt.lastName}`, contactPhone: pt.phone, channel: 'whatsapp', status: 'closed', reason: 'Replied to a message', createdAt: at, updatedAt: at, messages: [{ id: id('msg'), from: 'patient', text: replies[Math.floor(r3() * replies.length)], at }], assignedTo: null, unread: false });
    } }

  // Sample booking-page traffic for the demo clinic only (a real clinic starts at zero and counts real visits).
  { let n = 77; const r2 = () => { n = (n * 1103515245 + 12345) & 0x7fffffff; return n / 0x7fffffff; };
    appointments.forEach((a, i) => { if (i % 6 === 2 && a.source !== 'ai' && a.status !== 'cancelled') a.source = 'website'; }); // some of the history came in through the booking page
    const stats = (settings.siteStats = {});
    for (let i = 90; i >= 0; i -= 1) {
      const day = dayKey(addDays(now, -i)); const dow = new Date(day + 'T12:00:00').getDay();
      const views = Math.round((dow === 0 ? 9 : 17) + r2() * 12 + (90 - i) * 0.05);
      const sources = {}; for (let k = 0; k < views; k += 1) { const x = r2(); const src = x < 0.42 ? 'google' : x < 0.68 ? 'maps' : x < 0.84 ? 'instagram' : 'direct'; sources[src] = (sources[src] || 0) + 1; }
      stats[day] = { views, slotChecks: Math.round(views * (0.35 + r2() * 0.15)), bookings: appointments.filter((a) => a.source === 'website' && dayKey(a.createdAt) === day).length, sources };
    } }

  settings.demoSeededDate = today;

  return { settings, patients, appointments, waitlist, conversations, formPackets, visits, treatmentPlans, communications, kioskSessions: [], activity, blocks, webhookLog: [], callbacks: [] };
}


/** Fixed-date national holidays; movable festivals (Holi, Ugadi, Diwali, Eid…) are added by the clinic in Settings. */
export function defaultHolidays(year = new Date().getFullYear()) {
  return [
    { date: `${year}-01-26`, name: 'Republic Day' },
    { date: `${year}-08-15`, name: 'Independence Day' },
    { date: `${year}-10-02`, name: 'Gandhi Jayanti' },
    { date: `${year}-12-25`, name: 'Christmas' },
  ];
}

const NEUTRAL_FAQ = {
  faq_insurance: 'Insurance and cashless claims depend on your policy. Please message or call the front desk and we will check what is possible before your visit.',
  faq_payment: 'Please ask our front desk which payment options we accept. The dentist gives you a written estimate before any treatment starts.',
  faq_abha: 'You can share your ABHA number in the pre-visit form if you have one. We keep it with your record, with your consent.',
  faq_rct: 'The number of visits for a root canal depends on the tooth. The dentist will confirm after examining it and taking an x-ray.',
};

/** Settings for a newly registered clinic: dental presets, no demo patients. */
export function blankSettings({ name = 'My Dental Clinic', city = '', phone = '', email = '', whatsapp = '' } = {}) {
  const s = defaultSettings();
  return {
    ...s,
    practice: { ...s.practice, name, tagline: '', phone, whatsapp: whatsapp || phone, email, address: '', website: '', registrationNumber: '', clinicalEstablishmentNo: '', gstin: '', city, state: '' },
    locations: [{ id: 'loc_main', name: 'Main branch', address: '', phone, hours: HOURS, chairs: 2, kioskCode: 'MAIN1', hfrId: '' }],
    providers: [],
    // A new clinic must not inherit the demo clinic's claims (insurers, EMI, prices, another clinic's name): neutral answers until the owner writes their own.
    faqs: s.faqs.map((f) => ({ ...f, answer: NEUTRAL_FAQ[f.id] || f.answer.replace(/SmileCare( Dental)?/g, name).replace(/Indiranagar: [\s\S]*?Both branches are on Google Maps as [^.]*\./, 'Please update the address in Settings → Approved FAQs.').replace(/Dr\. Arjun Iyer is our pediatric dentist at Indiranagar\. /, '').replace(/ \(Whitefield closes at 2:00 PM on Saturdays\)/, '') })),
    marketing: { ...s.marketing, googleReviewUrl: '' }, // never ask a new clinic's patients to review the demo clinic
    paymentModes: ['UPI', 'Cash', 'Card'],
    insuranceOptions: (s.insuranceOptions || []).map((o) => ({ ...o, examples: '' })),
    integrations: { apiKey: '', webhooks: [], messaging: { provider: 'none', senderId: '', notes: '' }, ehr: { name: '', fhirBaseUrl: '', notes: '' }, abdm: { hipId: '', hipName: '', enabled: false } },
    fees: defaultFeePolicy(),
    assistant: { enabled: true, answerWhen: 'closed', takeNotes: true, phrases: {} },
    consentText: s.consentText.replace(/SmileCare Dental/g, name),
  };
}

export function buildBlank(tenant = {}) {
  return { settings: blankSettings(tenant), patients: [], appointments: [], waitlist: [], conversations: [], formPackets: [], visits: [], treatmentPlans: [], communications: [], kioskSessions: [], activity: [{ id: id('act'), type: 'settings', text: `${tenant.name || 'Clinic'} registered on Clinovara`, at: nowIso() }], blocks: [], webhookLog: [], callbacks: [], calls: [], ehrOutbox: [] };
}

/** Dental visit-type presets offered during onboarding. */
export const VISIT_TYPE_PRESETS = defaultSettings().visitTypes.concat([
  { id: 'vt_implant', name: 'Implant consultation', durationMin: 45, providerRole: 'Dentist', fee: 1000, keywords: ['implant', 'implants', 'missing tooth', 'dental implant'] },
  { id: 'vt_whitening', name: 'Teeth whitening', durationMin: 60, providerRole: 'Dentist', fee: 8000, keywords: ['whitening', 'bleaching', 'white teeth', 'stains', 'yellow'] },
  { id: 'vt_extraction', name: 'Extraction / wisdom tooth', durationMin: 45, providerRole: 'Dentist', fee: 1500, keywords: ['extraction', 'remove tooth', 'wisdom tooth', 'pull out', 'nikalna'] },
  { id: 'vt_denture', name: 'Dentures', durationMin: 45, providerRole: 'Dentist', fee: 800, keywords: ['denture', 'dentures', 'false teeth', 'nakli daant'] },
]);
