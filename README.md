# Clinovara — dental front office for India

React + Express product for dental clinics and multi-branch dental hospitals. Clinics register, set up, and go live on their own; every clinic has isolated data. Demo clinic: **SmileCare Dental**, two branches in Bengaluru.

## Run it

```
npm run setup      # installs backend + frontend
npm run dev        # backend http://localhost:4200, frontend http://localhost:5190
```

Open http://localhost:5190. Register a clinic, or log in to the demo: `demo@smilecare.example` / `demo1234` (also `frontdesk@…` and `vikram@…` with the same password for the front-desk and dentist roles). The demo clinic's "today" is regenerated automatically every time the backend starts on a new calendar day — the kiosk, arrivals board and doctor's day always have something due today, with no manual reset needed.

Production-style: `npm run build` then `npm start` (backend serves the built frontend on 4200). Tests: `npm test` (36 backend tests, vitest).

## Enabling Claude

Copy `backend/.env.example` to `backend/.env` and add your key from [console.anthropic.com](https://console.anthropic.com/settings/keys):

```
ANTHROPIC_API_KEY=sk-ant-...
```

`npm run dev` / `npm start` load it automatically (Node's built-in `--env-file-if-exists`, no extra dependency). Every AI-touching feature checks for this key at request time and already runs on Claude the moment it is set, nothing else to turn on: the AI front desk (`domain/frontDesk.js`), the virtual assistant for calls (`domain/assistant.js`, which reuses the front desk's engine), and marketing draft generation (`domain/marketing.js`) — all `claude-opus-5`, all falling back to the rule engine automatically if a call to Claude ever fails. Booking, escalation and marketing approval are still always enforced by server-side rules regardless of engine; Claude only ever supplies the conversational text and intent, never the final action.

## From sign-up to go-live

1. **Register** (`#/signup`): name, mobile, email, password, clinic name, city. Optional sample data. Creates the owner account, the clinic, and a 30-day trial.
2. **Log in** with email + password or mobile OTP; password reset by OTP. Invitations (`#/invite/<token>`) create staff logins with roles: owner, admin, front desk, dentist, hygienist. Owners/admins change settings, team, integrations and approve marketing; everyone else uses the daily screens.
3. **Onboarding wizard** (`#/onboarding`) with a checklist computed from real data: clinic profile (Dental Council reg., Clinical Establishments Act no., GSTIN), branches with hours, chairs, kiosk codes, ABDM HFR ID and public holidays; dentists with council reg. no., HPR ID, fees, branches, plus team invites; visit types from dental presets; payment modes and schemes (UPI/cash/card/cashless, PM-JAY, CGHS, ESIC); languages and WhatsApp templates; AI front-desk answers and escalation words; patient CSV import; marketing (review link, thank-yous, prompt approval); integrations; go-live (kiosk URL, display URL, test booking) → **Launch**.

## Features

| Feature | Where |
|---|---|
| AI front desk | **Front desk inbox** + patient chat (`#/patient?t=<clinic>`). English/Hindi/Kannada/Hinglish on WhatsApp, SMS, web, calls; books real slots at the right branch with fees; hands clinical/sensitive questions to staff; handles family phones. |
| Smart scheduling | **Schedule**: per-branch, per-dentist; leave blocks; holidays; waitlist auto-offers; reminders 24h/2h. |
| Pre-visit forms | Patients fill six sections at `#/forms/<token>` in their language, incl. insurance/scheme, ABHA and marketing opt-in. |
| Kiosk | `#/kiosk?t=<clinic>&code=<branch>`: identify by mobile / ABHA / name+DOB, family member choice, forms, insurance, consent, OPD token, privacy reset. |
| Arrivals & queue | Lanes, tokens, call-next per dentist, collect payment, help requests; `#/board?t=<clinic>` waiting-room display. |
| Doctor's home | Dentist workspace: today's patient card with alerts, guided finish-visit (notes, plan, next visit, aftercare in the patient's language, close the case), chart, my patients, week, numbers. |
| **Procedure & fee catalogue** | **Settings → Procedures & fees**: the owner sets every procedure's name, category, fee and minutes; a fee policy (fixed, range or flexible) decides how much room a dentist has to change a price, with a note required on any change. Dentists pick from this list when they finish a visit; the AI front desk quotes the same fees to patients. |
| **Case closing & EHR export** | Finishing a visit can also **close the case** (outcome + notes) and sends a FHIR bundle (Patient, Encounter, CarePlan, a visit-summary Composition) to the clinic's EHR, or queues it under Settings → Integrations → EHR record queue until one is connected. Treatment plans can be closed the same way from **Treatment plans**, and a patient's chart shows every export with a resend button. |
| Treatment plans | FDI tooth numbers, ₹ estimates, questions, follow-ups, book next visit, nudge, close the case. |
| Patient messages | Reminders, prep, forms, tokens, recalls, post-visit check-ins, per-language templates. |
| **Marketing with human approval** | **Marketing**: AI drafts thank-yous, Google review requests, recalls, unscheduled-treatment nudges, festival greetings, offers, referrals, win-backs from **prompts an owner must approve first**. Campaigns go draft → pending approval → approved → sent, with an audit trail; per-visit thank-yous and review requests queue for approval (or send automatically from a pre-approved prompt). Opt-in only, send window 09:00–20:00, opt-out line on every message. |
| **Virtual assistant for calls** | Answers the phone, mainly after hours and at night, in the caller's own language — all 22 scheduled languages of India plus English, detected automatically by script or by common Roman-letter words (Hinglish, Kanglish, Tanglish…). Books, reschedules, cancels and answers general questions using the same rules as WhatsApp; any clinical, medicine or diagnosis question is written down for the dentist and never answered. **Calls** page lists every call with its transcript and outcome; Settings → Virtual assistant has a "Try a call" simulator. |
| Patients | Directory, ABHA, schemes, family links, CSV import/export. |
| Insights | Unanswered inquiries, booking rate, cancellations, check-in delays, recalls, unscheduled treatment, collections by dentist and branch, virtual-assistant call volume and language mix. |


## Workspaces

Every login belongs to one of three workspaces. **Admin** (owner/admin roles) sees everything and can preview the other two with the "view as" switch in the sidebar. **Front desk** runs the day: arrivals and queue, callbacks, calls, inbox, schedule, patients, pre-visit forms, messages, and marketing drafts. **Doctor** (dentist/hygienist) lands on **My home** (`#/doctor`), written in plain words for a dentist who never reads a manual — and it is the *only* thing in their sidebar: no branch switcher, no clinic-wide inbox, schedule, patient list or kiosk/waiting-room links, since a dentist's day is his own, not the whole clinic's. Front desk inbox, Schedule and Treatment plans stay reachable from links inside My home (answering one patient's WhatsApp message, seeing his week) without cluttering the sidebar with pages built for someone running the whole desk.

## The doctor's home

- **Today**: one big card for the patient in the chair or next in line (token, age, what they wrote on the form, medical alerts from the form such as blood thinners, allergies, pregnancy, anxiety), with three actions: **Call in** (shows on the waiting-room display), **Seated**, **Finish visit**. Below it the day's list, questions and escalations that need the dentist's reply, and what is coming up.
- **Finish visit** is one guided screen in four short steps: what you did (findings, procedure, advice, medicines), treatment to recommend (presets, tooth number, priority, ₹ estimate), next visit (book now into the first free slot with the AI-estimated length, or ask the front desk), and an **aftercare message** auto-suggested from the procedure and rendered in the patient's language, editable before it goes out on WhatsApp. One tap writes the notes, records the plan, books the visit, sends the instructions, marks the visit done and hands payment to the front desk. Aftercare templates live in `settings.aftercare` (8 dental defaults).
- **Chart**: health and concerns from the form, past visits with the dentist's notes, treatment plans with patient questions, and every message sent.
- **My patients**: everyone the dentist has seen or is booked with, last seen, next visit, treatment not yet done, alert count, search by name or mobile.
- **My week**: seven-day chair time, booked-ahead list with form status, leave and blocked time (request it here; the front desk is told about clashes), and the private calendar subscription link.
- **Treatment plans**, **My numbers** (visits, no-shows, cancellations, collections, patients, average length, by visit type) and **How this works** (the visit step by step, the words on screen, who does what).

API: `GET /api/doctor/dashboard`, `/patients`, `/chart/:patientId`, `/aftercare?q=`, `PATCH /visits/:id/notes`, `POST /visits/:id/finish` (accepts `plan[].procedureId` from the catalogue, `closeCase: {outcome, notes}`, `sendToEhr`), `POST /patients/:id/send-to-ehr`. Deep links: `#/doctor?tab=week`, `?chart=<patientId>`, `?finish=<visitId>`.

## Procedures, fees and who can change them

- **Settings → Procedures & fees**: the owner/admin maintains the catalogue (`settings.procedures`, 28 dental defaults across diagnosis, preventive, restorative, endodontics, prosthodontics, cosmetic, oral surgery, implants, orthodontics, pediatric and periodontics) and the fee policy (`settings.fees`): **fixed** (the catalogue fee is always used), **range** (a dentist may quote between a min and max fee) or **flexible** (any fee, with a note). `allowCustom` lets a dentist add a procedure not in the list.
- Every price a dentist records passes through `priceItem()` server-side (`domain/catalogue.js`), so the policy is enforced no matter what the client sends; out-of-range or unexplained fee changes are rejected with a message the dentist can act on.
- The AI front desk quotes the same catalogue fees to patients who ask "how much" (toggle: "Let the AI front desk quote these fees").

## Closing a case and sending it to the EHR

- Finishing a visit (`POST /api/doctor/visits/:id/finish`) can include `closeCase: {outcome, notes}`, which marks the treatment plan closed and writes a closing note into the visit. Treatment plans can also be closed directly from the **Treatment plans** page once every visit for that concern is done.
- Closing (or finishing any visit, unless `sendToEhr: false`) builds a FHIR R4 transaction Bundle — Patient, Practitioner, Encounter, CarePlan, recent Communications, and a Composition document carrying the dentist's notes — and sends it to the EHR's FHIR base URL set under Settings → Integrations. Without one connected, it queues in `db.ehrOutbox` and can be resent with one click once a URL is added.
- The queue is visible in two places: **Settings → Integrations → EHR record queue** (clinic-wide) and each patient's **chart → EHR tab** (per patient), both with a Resend button for anything not yet delivered.

## Virtual assistant for calls

- Answers the phone — mainly after hours and at night, or any time nobody at the front desk picks up — using the exact same booking, rescheduling and escalation rules as the WhatsApp/web front desk (`domain/frontDesk.js`), so nothing about availability, fees or policy is duplicated or can drift.
- **Language**: `domain/assistant.js` covers the 22 scheduled languages of India plus English. It detects the caller's language from their script (Devanagari, Tamil, Telugu, Kannada, Malayalam, Bengali, Gujarati, Gurmukhi, Odia, or Arabic script for Urdu/Kashmiri/Sindhi) or, for romanised speech, from common Hindi/Kannada/Tamil/Telugu/Malayalam/Marathi/Bengali/Gujarati/Punjabi words (Hinglish, Kanglish, Tanglish and similar). Its own sentences (greeting, closed notice, "I can't give medical advice", emergency line, goodbye) are written out for 13 languages; the rest fall back to Hindi + English until Claude is connected, which then replies fluently in the caller's language.
- **Never acts like a doctor**: any clinical, medication or "is this normal" question is acknowledged, written into a plain-language note for the dentist, and — for anything urgent — read the practice's emergency line, exactly like the WhatsApp escalation path.
- **API**: `POST /api/calls` (start), `POST /api/calls/:id/messages` (each caller turn), `POST /api/calls/:id/end` (finish; writes a summary and files a callback if a person is needed), `GET /api/calls` (log). A phone system integrates the same way a chat widget would.
- **UI**: the **Calls** page (front desk/admin) lists every call with its outcome, language and transcript; **Settings → Virtual assistant** turns it on/off, sets when it answers, and has a **Try a call** simulator to test any language before going live.

## After hours, missed calls, missed appointments

- Outside opening hours (per branch, holidays included) the AI says when the clinic opens, still books and reschedules, adds the emergency line to anything about pain, and files a **callback** for the morning when a person is needed.
- **Missed calls**: `POST /api/callbacks/missed-call` from a phone system (or the "Log a missed call" button) messages the patient on WhatsApp and adds a callback.
- **Missed appointments**: patients not checked in `rules.noShowAfterMinutes` after their start are marked no-show, messaged to rebook, and added to callbacks with a Rebook button.
- The **Callbacks** page lists all three, high priority first, with attempt logging.

## AI time estimates

`GET /api/estimates/visit-types` compares each visit type's scheduled length with what actually happened (arrival to done, per type and per dentist) and suggests a length with the reason; Settings shows the suggestion next to each visit type. `POST /api/estimates/appointment` estimates one booking from the visit type, the notes (procedures and tooth numbers), the dentist's pace, and the patient (first visit, anxiety, young child). The booking dialog shows the estimate with its breakdown and books for that length, and availability search honours it.

## Calendar integration

Settings → Integrations → Calendar feeds gives each dentist a private iCalendar subscription link (Google Calendar "From URL", Outlook "Subscribe from web", iPhone subscribed calendar) that includes appointments and leave blocks; only an owner/admin can turn this on. Every appointment also has its own add-to-Google, Outlook and `.ics` links (`GET /api/calendar/links/:id`), open to any staff role — so a dentist gets calendar syncing two ways: **My home → My week** always shows a calendar icon next to each of his own upcoming visits to add just that one, and once an owner enables the whole-schedule feed, the same page offers the one-time subscription link too. Patients get a per-appointment `.ics` without their details exposed.

## Receipts

Recording a payment issues a numbered receipt (`RCP/26-27/0001`, per Indian financial year, never reused; prefix, optional GST-inclusive split and footer in Settings → Payments). The Collect-payment dialog opens it straight away: print it, or **Send to patient** on their WhatsApp thread. `GET /api/arrivals/:appointmentId/receipt`, `POST …/receipt/send`. Amounts are written in words in the Indian system (lakh/crore).

## EHR / HMIS integration

- **FHIR R4** at `/api/fhir` (Patient incl. `$everything`, Practitioner, Location, Appointment, Encounter, Consent, QuestionnaireResponse, CarePlan, Communication, Bundle). Auth by API key (`x-api-key`) generated in Settings → Integrations; `?t=<clinic>` works while no key is set. ABHA as NDHM identifiers.
- **Webhooks** signed with HMAC-SHA256 for appointment, patient, arrival, forms, consent, treatment, escalation, message, payment and campaign events.
- **CSV import/export** with Indian date and mobile formats: patients (`GET /api/patients/export.csv`, `POST /api/patients/import`) and the procedure & fee catalogue (`GET /api/settings/procedures/export.csv`, `POST /api/settings/procedures/import`, owner/admin only) share the same parser (`csvCell`/`parseCsv` in `lib.js`) — export to bulk-edit fees in a spreadsheet, then re-import; rows match by `id`, then by name, so editing the export and re-importing updates in place instead of duplicating.
- Connector settings for WhatsApp Business API, SMS gateways, external FHIR base URL and ABDM HIP are stored but not yet wired to send.

## AI engine

Rule engine by default. Set `ANTHROPIC_API_KEY` to use Claude (`claude-opus-5`, JSON-schema output, server-side fallbacks) for the front desk and marketing drafts; falls back to rules on error. Booking, escalation and approvals are always enforced by server-side rules.

## What is simulated

Outbound WhatsApp/SMS/email (outbox + inbox mirror; OTPs and invite links are shown on screen), insurance card scanning (fields only), payments (recorded, no gateway), and provider/ABDM connectors.

## Data

`backend/data/platform.json` (accounts, clinics, memberships, invites, sessions) and `backend/data/tenants/<id>.json` per clinic. Settings → Data: JSON export/import, FHIR Bundle export, patients CSV export/import, reset demo — all downloads go through an authenticated fetch-and-save helper (`downloadFile` in `lib/api.js`), not a plain link, since the API needs the bearer token. Settings → Procedures & fees: CSV export/import for the catalogue. Ports 4200/5190 avoid this machine's other projects (4000/5173, 4100/5180).
