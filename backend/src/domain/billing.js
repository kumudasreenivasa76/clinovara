import { brandOf, find, fullName, dayKey, bad } from '../lib.js';
import { location } from './scheduling.js';
import { sendCommunication } from './messaging.js';

const DEFAULTS = { receiptPrefix: 'RCP', nextNumber: 1, gstRate: 0, footer: 'Thank you. Please keep this receipt for insurance or reimbursement claims.' };
export const billing = (db) => (db.settings.billing = { ...DEFAULTS, ...(db.settings.billing || {}) });

/** Indian financial year label for a date, e.g. 2026-10-06 -> "26-27". */
export function financialYear(iso) {
  const d = new Date(iso); const y = d.getFullYear(); const start = d.getMonth() >= 3 ? y : y - 1;
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const below100 = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`);
const below1000 = (n) => (n >= 100 ? `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${below100(n % 100)}` : ''}` : below100(n));

/** Amount in words using the Indian system (lakh, crore): 125000 -> "One lakh twenty five thousand rupees only". */
export function amountInWords(amount) {
  const rupees = Math.floor(Math.abs(Number(amount) || 0)); const paise = Math.round((Math.abs(Number(amount) || 0) - rupees) * 100);
  const parts = [];
  const crore = Math.floor(rupees / 10000000); const lakh = Math.floor((rupees % 10000000) / 100000); const thousand = Math.floor((rupees % 100000) / 1000); const rest = rupees % 1000;
  if (crore) parts.push(`${below1000(crore)} crore`);
  if (lakh) parts.push(`${below100(lakh)} lakh`);
  if (thousand) parts.push(`${below100(thousand)} thousand`);
  if (rest) parts.push(below1000(rest));
  let words = parts.join(' ') || 'zero';
  words = `${words[0].toUpperCase()}${words.slice(1)} rupees`;
  if (paise) words += ` and ${below100(paise)} paise`;
  return `${words} only`;
}

/** Assigns the next receipt number the first time a payment is recorded; stable afterwards. */
export function assignReceiptNo(db, appt) {
  if (appt.receiptNo) return appt.receiptNo;
  const b = billing(db);
  appt.receiptNo = `${b.receiptPrefix}/${financialYear(appt.paidAt || new Date().toISOString())}/${String(b.nextNumber).padStart(4, '0')}`;
  b.nextNumber += 1;
  return appt.receiptNo;
}

/** Everything a printed or messaged receipt needs, built from the recorded payment (never from the live fee). */
export function buildReceipt(db, appointmentId) {
  const a = find(db.appointments, appointmentId, 'Appointment');
  if (!a.paidAt) bad('No payment has been recorded for this visit yet');
  const patient = find(db.patients, a.patientId, 'Patient');
  const visit = db.visits.find((v) => v.appointmentId === a.id);
  const vt = db.settings.visitTypes.find((v) => v.id === a.visitTypeId);
  const prov = db.settings.providers.find((p) => p.id === a.providerId);
  const b = billing(db); const p = db.settings.practice;
  const total = Number(a.paidAmount) || 0;
  const gstRate = Number(b.gstRate) || 0;
  const taxable = gstRate ? Math.round((total / (1 + gstRate / 100)) * 100) / 100 : total;
  const gst = Math.round((total - taxable) * 100) / 100;
  const description = [vt?.name || 'Dental visit', visit?.doctorNotes?.procedureDone].filter(Boolean).join(' — ');
  return {
    receiptNo: a.receiptNo || null, branding: brandOf(db.settings),
    date: dayKey(a.paidAt), paidAt: a.paidAt,
    clinic: { name: p.name, address: p.address, phone: p.phone, email: p.email, gstin: p.gstin, registrationNumber: p.registrationNumber, clinicalEstablishmentNo: p.clinicalEstablishmentNo, branch: location(db, a.locationId)?.name || '' },
    patient: { id: patient.id, name: fullName(patient), phone: patient.phone },
    provider: prov ? { name: prov.name, registrationNo: prov.councilRegNo || '' } : null,
    items: [{ description, amount: taxable }],
    gstRate, taxable, gst, total,
    mode: a.paymentMode, reference: a.paymentReference || '',
    insurance: a.paymentStatus === 'insurance',
    words: amountInWords(total), footer: b.footer,
  };
}

export function sendReceipt(db, appointmentId, { by }) {
  const a = find(db.appointments, appointmentId, 'Appointment');
  if (!a.paidAt) bad('No payment has been recorded for this visit yet');
  assignReceiptNo(db, a);
  const r = buildReceipt(db, a.id); const sym = db.settings.locale?.currencySymbol || '₹';
  const body = `${r.clinic.name} — receipt ${r.receiptNo}\n${r.patient.name}, ${r.date}\n${r.items[0].description}\nPaid ${sym}${r.total.toLocaleString('en-IN')} by ${r.mode}${r.reference ? ` (ref ${r.reference})` : ''}.\n${r.footer}`;
  return sendCommunication(db, { patientId: a.patientId, type: 'receipt', body, appointmentId: a.id, by });
}
