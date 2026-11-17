/**
 * Real outbound messaging. Each provider switches on when its environment variables are present:
 *   SMS (Twilio):        TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM  (a number, or a messaging service SID starting MG)
 *   WhatsApp Cloud API:  WHATSAPP_TOKEN, WHATSAPP_PHONE_ID
 * Indian SMS needs DLT-registered templates and a registered sender; WhatsApp messages sent outside a patient's
 * 24-hour window need a Meta-approved template. Both are account setup on the provider's side, not code.
 */
import { HttpError } from '../lib.js';

export const smsReady = () => !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
export const whatsappReady = () => !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
/** Digits only with country code, e.g. 919845012345. National numbers get the clinic's default code. */
export const intl = (phone, dial = '91') => { const d = String(phone || '').replace(/\D/g, ''); return d.length > 10 ? d : `${dial}${d}`; };

export async function sendSms(toDigits, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID; const from = process.env.TWILIO_FROM;
  const form = new URLSearchParams({ To: `+${toDigits}`, Body: body });
  form.set(from.startsWith('MG') ? 'MessagingServiceSid' : 'From', from);
  let res;
  try {
    res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, { method: 'POST', headers: { authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' }, body: form, signal: AbortSignal.timeout(10000) });
  } catch { throw new HttpError(502, 'Could not reach the SMS service. Try again in a moment.'); }
  if (!res.ok) { console.error('[sms] Twilio rejected the message', res.status, await res.text().catch(() => '')); throw new HttpError(502, 'We could not send the text message. Check the number and try again.'); }
  return { provider: 'twilio' };
}

export async function sendWhatsApp(toDigits, body) {
  let res;
  try {
    res = await fetch(`https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`, { method: 'POST', headers: { authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: toDigits, type: 'text', text: { body } }), signal: AbortSignal.timeout(10000) });
  } catch { throw new HttpError(502, 'Could not reach WhatsApp. Try again in a moment.'); }
  if (!res.ok) { console.error('[whatsapp] Cloud API rejected the message', res.status, await res.text().catch(() => '')); throw new HttpError(502, 'We could not send the WhatsApp message.'); }
  return { provider: 'whatsapp_cloud' };
}
