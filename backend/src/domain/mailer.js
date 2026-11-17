/**
 * Outbound email through Resend (https://resend.com). Configure RESEND_API_KEY and MAIL_FROM
 * (e.g. "Clinovara <hello@yourdomain.com>", on a domain verified in Resend).
 * SMS goes through Twilio (see providers.js) once its environment variables are set.
 */
import { HttpError } from '../lib.js';
import { smsReady } from './providers.js';

/** The in-browser demo is built in production mode but has nobody to protect, so it behaves like development. */
export const isProd = () => process.env.NODE_ENV === 'production' && process.env.CLINOVARA_DEMO !== '1';
export const mailConfigured = () => !!process.env.RESEND_API_KEY;
export const smsConfigured = () => smsReady();
/** Codes are shown on screen only for local development, and only when nothing can deliver them. */
export const canShowDevCodes = (channel) => !isProd() && !(channel === 'email' ? mailConfigured() : smsConfigured());
export const deliverable = (channel) => (channel === 'email' ? mailConfigured() : smsConfigured()) || !isProd();

export async function sendEmail({ to, subject, text, html }) {
  if (!mailConfigured()) throw new HttpError(503, 'Email delivery is not configured on this server');
  let res;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: process.env.MAIL_FROM || 'Clinovara <onboarding@resend.dev>', to: [to], subject, text, html }),
      signal: AbortSignal.timeout(10000),
    });
  } catch { throw new HttpError(502, 'Could not reach the email service. Try again in a moment.'); }
  if (!res.ok) { console.error('[mail] Resend rejected the message', res.status, await res.text().catch(() => '')); throw new HttpError(502, 'We could not send the email. Check the address and try again.'); }
}

export const codeEmail = (code, purpose) => {
  const what = purpose === 'reset' ? 'reset your password' : purpose === 'login' ? 'log in' : 'verify your email';
  return {
    subject: `${code} is your Clinovara verification code`,
    text: `Use this code to ${what}: ${code}\n\nIt expires in 10 minutes. If you did not ask for it, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:420px"><p>Use this code to ${what}:</p><p style="font-size:32px;letter-spacing:8px;font-weight:700;margin:16px 0">${code}</p><p style="color:#666;font-size:13px">It expires in 10 minutes. If you did not ask for it, you can ignore this email.</p></div>`,
  };
};
