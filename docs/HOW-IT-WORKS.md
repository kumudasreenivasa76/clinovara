# How Clinovara works

Clinovara is a front-office system for dental clinics in India. It answers patient messages and calls, books appointments, sends pre-visit forms, checks patients in, runs the waiting-room queue, takes payments, and follows up afterwards. Reception, dentists and owners each get their own workspace over the same patients and appointments.

This document explains how the system is put together and how each part works, for someone who is about to run, change or deploy it. For a feature overview written for clinic owners, see the [README](../README.md).

## Contents

1. [Run it](#1-run-it)
2. [Technology](#2-technology)
3. [Repository map](#3-repository-map)
4. [How a request is handled](#4-how-a-request-is-handled)
5. [Data](#5-data)
6. [Roles and permissions](#6-roles-and-permissions)
7. [The patient journey, end to end](#7-the-patient-journey-end-to-end)
8. [The three workspaces](#8-the-three-workspaces)
9. [Pre-visit forms](#9-pre-visit-forms)
10. [Patient-facing screens and branding](#10-patient-facing-screens-and-branding)
11. [AI and the phone voice layer](#11-ai-and-the-phone-voice-layer)
12. [Integrations](#12-integrations)
13. [Security](#13-security)
14. [Configuration](#14-configuration)
15. [API reference](#15-api-reference)
16. [Tests](#16-tests)
17. [What is simulated or not built](#17-what-is-simulated-or-not-built)
18. [Deploying](#18-deploying)

---

## 1. Run it

You need Node.js 22 or newer.

```bash
npm run setup     # install backend and frontend packages
npm run dev       # backend on http://localhost:4200, frontend on http://localhost:5190
npm test          # backend test suite
npm run build     # production build of the frontend
npm start         # backend only, serving the API
```

Open http://localhost:5190. To look around without registering, go to `#/login?demo=1` and choose **As the owner**, **As front desk** or **As a dentist**. This logs you into the demo clinic, SmileCare Dental, which has sample patients and a day of appointments. The demo clinic's sample data is rebuilt once a day so "today" always has appointments.

Keys go in `backend/.env` (see [Configuration](#14-configuration)). The file is git-ignored. Without any keys the app still runs: the AI uses a built-in rule engine and outgoing messages are simulated.

## 2. Technology

| Layer | What is used |
|---|---|
| Frontend | React 19, built with Vite. Plain CSS. Icons from `@tabler/icons-react`. A hash router (`#/dashboard`, `#/kiosk`). |
| Backend | Node.js with Express 5, written as ES modules. |
| Storage | JSON files on disk, one per clinic, written by a small store module. There is no database server. |
| AI | A rule engine by default. Claude through `@anthropic-ai/sdk` when `ANTHROPIC_API_KEY` is set. |
| Tests | Vitest, against the real Express app with in-memory data. |

Everything is JavaScript. There is no TypeScript and no Python.

## 3. Repository map

```
backend/
  src/
    server.js          starts the HTTP server
    app.js             builds the Express app: authentication, tenant lookup, role table, route mounting
    registry.js        the platform store (accounts, clinics, sessions) and one store per clinic
    store.js           JSON file store, with optional encryption at rest
    seed.js            sample data for the demo clinic and defaults for a new clinic
    lib.js             shared helpers: ids, dates, errors, branding
    jobs.js            timed work: reminders, sweeps
    domain/            the rules, independent of HTTP (scheduling, visits, billing, forms, AI, voice ...)
    routes/            one file per API area; thin wrappers around domain/
  test/                Vitest suites
  .env.example         every setting the server reads
frontend/
  src/
    main.jsx, App.jsx  entry point, session handling, the staff shell and its navigation
    pages/             one file per screen
    components/        shared UI (cards, tables, modals, charts)
    lib/               API client, formatting, translations, branding, password rules
    styles.css         staff app, kiosk, display and other patient screens
    site.css           public marketing site (everything scoped under .cv)
    auth.css           login, register, reset and invite pages (scoped under .au)
docs/                  this document
scripts/               dev runner and backup
```

`domain/` holds the behaviour. A route file should only read the request, call a domain function, save and reply. When you add a rule (who may book, what a fee may be, what counts as "waiting"), put it in `domain/` so chat, phone, kiosk and staff screens all follow it.

## 4. How a request is handled

Every request under `/api` passes through one middleware in `backend/src/app.js` before any route runs. It answers three questions in order.

**Who is calling?**

- A staff member sends `Authorization: Bearer <session token>`. The session names a user and a clinic; the user's membership in that clinic gives the role.
- A patient-facing page (kiosk, waiting-room display, clinic website, patient chat, a forms link) has no login. It names the clinic with `?t=<clinic web name>` or the `x-tenant` header and gets the role `public`. Only a short allow-list of paths accepts this (`PUBLIC_TENANT` in `app.js`).
- An EHR integration calls `/api/fhir` with the clinic's API key in `x-api-key` and gets the role `integration`.
- The phone media bridge calls `/api/voice/...` as `public`, and each of those routes also requires the shared secret in `x-voice-secret`.

**Which clinic?** The clinic is taken from the session, the API key, or the clinic web name. The middleware loads that clinic's store and attaches it as `req.db`. A route can only ever see `req.db`, so one clinic cannot read another's data.

**May this role do this?** For logged-in staff, the request is checked against the role table (`ROLE_RULES` in `app.js`). If a rule matches the path and method and the role is not listed, the reply is `403`. This runs before the route, so a screen hidden in the app is also closed on the server.

After the route runs, `req.store.save()` writes the clinic's file.

Every reply carries an `X-Request-Id` header, and API replies are sent with `Cache-Control: no-store` so patient data is not kept in a browser or proxy cache. Errors thrown as `HttpError(status, message)` become JSON replies of the form `{ "error": "...", "code": "...", "requestId": "..." }`. The codes are `invalid_request`, `not_logged_in`, `not_allowed`, `not_found`, `conflict`, `expired`, `too_large`, `too_many_requests`, `provider_unreachable`, `not_configured` and `server_error`. An unexpected failure is logged on the server with its request id; the caller gets a plain message and never the internal error text. Requests slower than 1.5 seconds are logged.

## 5. Data

### Where it lives

`backend/data/` (git-ignored) holds:

- `platform.json`: user accounts with password hashes, clinics, memberships, sessions, one-time codes, website leads.
- `tenants/<clinic id>.json`: everything belonging to one clinic.

Set `CLINOVARA_DATA_DIR` to store it somewhere else. Writes are debounced, written to a temporary file and renamed into place.

### What a clinic file contains

| Collection | Holds |
|---|---|
| `settings` | Clinic profile, branches, dentists, visit types and fees, procedures, FAQs, message templates, rules, payment modes, branding, marketing, assistant, voice, integrations, your own forms |
| `patients` | Administrative patient profiles |
| `appointments` | Bookings: patient, dentist, branch, start and end, status, booking source, fee, payment, receipt number |
| `visits` | One per patient arrival: token, arrival time, queue status, what is still missing, reception's note for the dentist |
| `formPackets` | One per appointment: the standard pre-visit sections, answers to your own forms, delivery and review history |
| `conversations` | Chat threads from WhatsApp, the website and calls |
| `communications` | Every outgoing message, with whether it was sent, simulated or failed |
| `calls` | Phone calls handled by the assistant, with transcript and outcome |
| `callbacks` | People reception needs to call back |
| `deskTasks` | Tasks a dentist has asked reception to do |
| `waitlist`, `blocks` | Waiting list entries and blocked time (leave, breaks) |
| `kioskSessions` | Short-lived kiosk sessions; removed when they expire |
| `activity` | A rolling log of the last 500 things that happened |
| `treatmentPlans`, `documents`, `labCases`, `images`, `tasks` | The dentist's clinical tools |
| `webhookLog`, `ehrOutbox` | Deliveries to outside systems |

### Appointment and visit status

An appointment moves through `scheduled` → `confirmed` → `arrived` → `in_chair` → `completed`, or ends as `cancelled` or `no_show`.

When a patient arrives, a visit is created with a token. The visit has its own status: `arrived`, `checking_in`, `needs_attention`, `ready`, `called`, `brought_back`, `done`.

The dashboards turn these two into one word per appointment so every screen agrees:

| Shown as | Meaning |
|---|---|
| To confirm / Upcoming | Booked, not yet confirmed or not yet arrived |
| Confirmed | Patient has confirmed |
| Checked in / Arrived | In the building, reception still has something to finish |
| Waiting | Ready to be seen |
| Called | The dentist has called them |
| In chair / In progress | With the dentist |
| Completed | Visit closed |
| No show, Cancelled | Did not happen |

An appointment that is 20 minutes past its start with no arrival is marked as a no show automatically (`rules.noShowAfterMinutes`).

## 6. Roles and permissions

Each login has one role in a clinic: `owner`, `admin`, `front_desk`, `dentist` or `hygienist`. The server enforces this table for every staff request. The same table is shown in the app under Settings → Team → Roles and permissions, read from `GET /api/auth/permissions`.

| Area | Owner, Admin | Front desk | Dentist, Hygienist |
|---|---|---|---|
| Full data export, import and reset | Yes | No | No |
| Integrations, API keys and webhooks | Yes | No | No |
| Phone voice assistant settings | Yes | No | No |
| Clinic revenue dashboard | Yes | No | No |
| Team, roles and invitations | Yes | No | No |
| Export or import the patient list | Yes | No | No |
| Export or import the fee list | Yes | No | No |
| Change clinic settings and branding | Yes | No | No |
| Create, edit, send or delete your own forms | Yes | No | No |
| Marketing and campaigns | Yes | Yes | No |
| Front desk dashboard, tasks and handoff notes | Yes | Yes | No |
| Take payments and issue receipts | Yes | Yes | No |
| Dentist workspace | Yes | No | Yes |
| Clinical notes, prescriptions and charts | Yes | No | Yes |
| Recent activity feed | Yes | Yes | Yes |

Anything not listed (patients, appointments, arrivals, forms, conversations, callbacks) is open to every staff role.

Two finer rules live inside routes:

- `/api/insights` is open to all staff, but the route leaves revenue out of the reply for anyone who is not an owner or admin.
- A dentist linked to a provider always gets their own figures from `/api/doctor` and `/api/dentist`. Only an owner or admin may ask for another dentist's by passing `providerId`.

To change who may do what, edit `ROLE_RULES` in `backend/src/app.js`. The first matching rule wins.

## 7. The patient journey, end to end

This is the path the end-to-end test walks.

1. **Enquiry.** A patient writes on WhatsApp or the clinic website, or calls. `domain/frontDesk.js` decides the reply: it answers from the clinic's approved FAQs, fees and hours, offers real free slots, and hands anything clinical to staff.
2. **Registration.** Reception adds the patient (`POST /api/patients`), or the assistant creates them while booking. Searching by mobile number (`GET /api/patients?q=`) finds an existing patient first.
3. **Booking.** `POST /api/appointments` calls `bookAppointment` in `domain/scheduling.js`. It refuses if the branch is closed that day, the dentist already has an appointment in that time, or the time is blocked. A confirmation is sent in the patient's language.
4. **Pre-visit forms.** A form packet is created for the appointment and a link is sent. The patient fills the standard sections and any of the clinic's own forms on their phone.
5. **Check-in.** Reception (`POST /api/arrivals/:appointmentId/arrive`) or the kiosk checks the patient in. A visit is created with a token such as `A02`.
6. **Queue.** The patient appears on reception's dashboard, the dentist's queue and the waiting-room display. Reception or the dentist marks them waiting, calls them, and seats them.
7. **Visit.** The dentist starts and completes the visit. On completion they can ask reception to book the next appointment or call the patient back; that creates a task on reception's dashboard.
8. **Payment.** Reception records the payment (`POST /api/arrivals/:appointmentId/payment`). A receipt number is issued and the receipt can be printed or sent on WhatsApp.
9. **Recall.** Completing a cleaning or a new-patient visit sets the patient's next recall date. Overdue recalls show under follow-ups and feed recall campaigns.
10. **Results.** The owner's Overview reads the same appointments and payments, so collections, no shows and bookings update without any separate reporting step.

## 8. The three workspaces

The staff app has one shell (`frontend/src/App.jsx`). The role decides which workspace and sidebar a person gets. An owner or admin can switch between all three with the "view as" selector in the top bar.

### Front desk

Screen: `pages/FrontDeskHome.jsx`, at `#/home`. Data: `GET /api/frontdesk/summary`.

That one endpoint returns the whole day so the numbers on the page cannot disagree: eight counts, today's schedule with a single status per row, the live queue, each dentist's state, chairs in use, payments by method, pending confirmations, late patients, follow-ups, tasks from dentists and recent activity. Nothing is stored for the dashboard; it is all derived on each request.

From this screen reception can confirm an appointment, check a patient in, move them through the queue, call the next patient, record a payment, start or finish a dentist's task, leave a note for the dentist, and search any patient.

Other front desk screens: Arrivals and queue, Callbacks, Calls, Inbox, Schedule, Patients, Pre-visit forms, Patient messages, Marketing.

### Dentist

Screen: `pages/DentistWorkspace.jsx`, the first four tabs of `#/doctor`. Data: `/api/dentist`.

- **My dashboard:** counts, today's schedule with intake status, what needs attention, free time today.
- **Arrivals and queue:** each checked-in patient with token, queue position, wait time, intake status and reception's note. Buttons to call, start and complete the visit, and to tell reception the dentist is running late.
- **Pre visit forms:** submissions for the next seven days. The dentist reads them, marks them reviewed, or asks reception to clarify. Answers cannot be edited from here.
- **Reception tasks:** ask reception to book, call back, reschedule and so on, with priority and due date, and see when it is done.

The older clinical tabs remain below these: today's patient with a guided finish-visit form, chart, tooth chart, prescriptions with safety checks, lab cases, treatment plans, earnings.

### Owner and admin

Screens: Overview (`pages/Overview.jsx`), Insights, Marketing, Settings.

Overview compares a period with the one before it: revenue, appointments, new patients, no shows, chair use, treatments, payment methods, team performance. Settings holds everything the clinic controls: profile, branding, branches, dentists and visit types, procedures and fees, FAQs the assistant may use, payments, languages and templates, rules, the virtual assistant, team, integrations and data.

## 9. Pre-visit forms

Every appointment can have a **form packet**. A packet holds:

- six standard sections: medical history, dental concerns, medications, allergies, insurance, consent;
- answers to the clinic's **own forms**;
- how and when it was sent, reminders, and review history.

The patient opens `#/forms/<token>`; the token in the link is the only credential, and it exposes only that packet.

### The clinic's own forms

Code: `domain/customForms.js`, routes under `/api/forms/templates`, screen: Pre-visit forms → Your forms.

A form is a list of fields. Field types: a statement to read, yes or no, choose one, short answer, long answer, date, and a typed-name signature. A form goes with every visit or only chosen visit types, and can be switched on or off.

Four ways to make one:

- **Describe it.** `POST /api/forms/templates/draft` returns a draft. With an Anthropic key, Claude writes it. Without one, the server picks the closest built-in template. The draft is never saved until staff edit and save it.
- **Ready-made.** General consent, photo and review consent, parent or guardian details, health update.
- **Upload.** `POST /api/forms/templates/import` reads a `.txt` file with one question per line, or a `.csv` with the columns question, type, options, required. It guesses the answer type from how each question is written.
- **Blank.**

`POST /api/forms/templates/:id/send` sends the link to every patient with an upcoming visit the form applies to who has not answered it.

Answers are validated against the form (required fields, allowed choices) and stored on the packet under `custom[formId]`.

### Review

There are currently two review paths in the code, built separately:

- `/api/forms/:id/review` and `/api/forms/:id/clarify`, part of the intake workflow in `domain/intake.js`, which also covers delivery channels, link expiry, paper forms, attachments and an owner report.
- `/api/dentist/intake/:packetId/review` and `/clarification`, used by the dentist workspace, which record `packet.review` and create a reception task.

They do not yet share state. Anyone extending intake review should pick one and remove the other.

## 10. Patient-facing screens and branding

| Screen | Address | What it does |
|---|---|---|
| Kiosk | `#/kiosk?t=<clinic>` | Self check-in on a tablet |
| Waiting-room display | `#/board?t=<clinic>` | Now calling and next tokens, per dentist |
| Clinic website | `#/site?t=<clinic>` or `#/book?t=<clinic>` | Clinic profile, dentists, fees, online booking, chat |
| Patient chat demo | `#/patient?t=<clinic>` | Talk to the assistant as a patient would |
| Forms | `#/forms/<token>` | The patient's pre-visit forms |

### Kiosk

Code: `pages/Kiosk.jsx`, `routes/kiosk.js`.

The patient picks a language (English, Hindi, Kannada), then identifies themselves with a mobile number on an on-screen keypad, an ABHA number, or last name and birthday. If several family members share the number, they pick who they are; only a first name and initial are shown. They finish any forms, insurance and consent, and get a token ticket that says how many people are ahead of them.

A patient with no appointment can leave a name and number; reception is alerted on the arrivals board. Any patient can ask for help.

A kiosk session expires after a period without activity (`rules.kioskResetSeconds`, default 90 seconds). The screen then clears so the next person never sees the previous patient's details.

### Branding

Code: `lib.js` (`cleanBranding`, `brandOf`), `frontend/src/lib/brand.jsx`, screen: Settings → Branding.

A clinic sets a logo, a brand colour and a kiosk welcome line. The logo is shrunk in the browser before upload; the server accepts only PNG, JPG, WebP or SVG image data and refuses anything else. A colour that is not a six-digit hex falls back to the default.

The brand appears on the kiosk, the waiting-room display, the patient chat, the clinic website, the forms page, receipts, and beside the clinic's name in the staff sidebar. The page derives its shades from the one colour (`brandVars`). A clinic with no logo shows its initials in its colour. The rest of the staff app keeps the Clinovara look.

## 11. AI and the phone voice layer

### The assistant

`domain/frontDesk.js` is the single place that decides what the assistant says and does, for WhatsApp, website chat and calls. It works in two modes:

- **Rules** (default): keyword and pattern matching against the clinic's visit types, FAQs and hours.
- **Claude**: when `ANTHROPIC_API_KEY` is set and `CLINOVARA_AI` is not `rules`. Claude returns structured output; the server still applies the booking, fee and escalation rules itself.

In both modes the assistant only offers slots the scheduling engine returns, quotes only the clinic's own fees, and never answers clinical questions. Pain, medicines, diagnosis and complaints become a handover to staff.

Claude is also used for marketing drafts and form drafts, through `domain/claudeJson.js`.

### Phone voice

Code: `domain/voice.js`, `routes/voice.js`. Settings: Settings → Integrations → Phone voice assistant.

A phone call reaches Clinovara through a **media bridge**: a small service between the phone carrier (for example Exotel) and a voice model. Clinovara does not handle audio. It provides what the bridge needs, in either of two shapes:

| Provider setting | How it works | Clinovara's part |
|---|---|---|
| `openai_realtime` | The voice model hears and speaks. | Gives it instructions built from the clinic's settings and five tools. The model calls a tool when it needs the diary. |
| `claude_elevenlabs` | The bridge turns speech into text, and turns the reply back into speech. | Each caller turn goes to the same assistant that runs chat. |

The bridge's calls:

1. `POST /api/voice/incoming?t=<clinic>` with the caller's number. Returns the call id, the greeting to speak, and the session (instructions and tools).
2. Then either `POST /api/voice/calls/:id/tool` with `{ name, arguments }`, or `POST /api/voice/calls/:id/turn` with `{ text }`.
3. `POST /api/voice/calls/:id/transcript` to add lines to the call log (optional).
4. `POST /api/voice/calls/:id/end`.

Every call must send `x-voice-secret` matching `VOICE_WEBHOOK_SECRET`. With no secret set, these endpoints reply `503`.

The tools: `clinic_info`, `find_slots`, `book_appointment`, `take_message`, `end_call`. `book_appointment` only accepts a slot that `find_slots` returned in the same call, and books through the normal scheduling rules. A new caller is registered as a patient. `take_message` creates a callback for reception, marked urgent for clinical questions.

**The media bridge itself is not in this repository.** It needs a carrier account, a voice provider key, and code that speaks the carrier's and the provider's audio formats.

## 12. Integrations

Provider credentials live in the server environment, never in clinic settings. Settings → Integrations shows what is connected.

| Integration | Used for | Needs |
|---|---|---|
| Email (Resend) | Verification codes, password resets, invitations, demo confirmations | `RESEND_API_KEY`, `MAIL_FROM` |
| SMS (Twilio) | Phone verification, reminders | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` |
| WhatsApp Business | Reminders, recalls, replies | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` |
| Claude | Assistant, drafts | `ANTHROPIC_API_KEY` |
| FHIR R4 API | An EHR reading patients and appointments, and receiving closed cases | An API key created in Settings |
| Webhooks | Pushing events to another system | A URL per webhook; each delivery is signed with HMAC-SHA256 |
| Calendar feeds | Dentists subscribing in Google, Outlook or Apple Calendar | A feed key created in Settings |

`POST /api/integrations/email/test` sends one real email so an owner can confirm delivery works. When email is not connected it says so and names the missing keys.

When a provider is not connected, messages are recorded in `communications` as simulated, so nothing is lost and nothing is sent by surprise.

## 13. Security

**What is in place**

- **Passwords** are hashed with scrypt and a per-user salt. A password a person chooses must have at least 8 characters, an uppercase letter, a lowercase letter, a number and a special character. The server enforces this at registration, reset, invite acceptance and password change.
- **Sessions** are random bearer tokens. "Keep me signed in" decides whether the browser keeps the token after it closes.
- **Tenant isolation.** A route only receives its own clinic's store.
- **Role table** checked on the server for every staff request (section 6).
- **Public access is an allow-list.** A visitor can reach only the kiosk, a forms link, the display board, the clinic's public profile and booking, and chat.
- **FHIR needs the clinic's API key.** Access without a key works only for the demo clinic's sample data.
- **Voice endpoints need the bridge secret**, compared in constant time.
- **Uploads are checked.** Logos must be image data of an allowed type and size.
- **Secrets stay on the server.** Status endpoints report whether a key is set, never its value.

**Encryption**

- **At rest:** set `CLINOVARA_DATA_KEY` and every data file is written as AES-256-GCM ciphertext. Existing plain files are read once and encrypted on their next save. If a file is encrypted and the key is missing or wrong, the server stops with an error and overwrites nothing. Without the variable, files are plain JSON. Keep a copy of the key: without it the data cannot be read.
- **In transit:** the app speaks plain HTTP. Put it behind HTTPS in production.

**Not in place**

- Two-factor login.
- A searchable audit log. `activity` is a rolling list of recent events, not a full audit trail with before and after values.
- Custom roles or per-person permissions.
- A default restriction on which websites may call the API. Until `CLINOVARA_ALLOWED_ORIGINS` is set, any site may. The API uses bearer tokens, not cookies, which limits the exposure, but set the variable in production.

## 14. Configuration

All settings are environment variables, read from `backend/.env` in development. See `backend/.env.example` for the full annotated list.

| Variable | Purpose | If unset |
|---|---|---|
| `PORT` | Backend port | 4200 |
| `NODE_ENV` | `production` hides on-screen test codes | Development behaviour |
| `CLINOVARA_FRONTEND_URL` | Base address used in links sent to patients | The request's own address |
| `CLINOVARA_DATA_DIR` | Where data files are kept | `backend/data` |
| `CLINOVARA_DATA_KEY` | Encrypts data files | Files are plain JSON |
| `CLINOVARA_ALLOWED_ORIGINS` | Websites allowed to call the API from a browser, comma separated | Any website |
| `ANTHROPIC_API_KEY` | Turns on Claude | Rule engine |
| `CLINOVARA_AI` | Force `rules` or `claude` | Decided by whether a key is present |
| `RESEND_API_KEY`, `MAIL_FROM` | Email | No email is sent; codes show on screen in development |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | SMS | SMS is simulated |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` | WhatsApp | WhatsApp is simulated |
| `VOICE_WEBHOOK_SECRET` | Shared secret for the phone bridge | Voice endpoints are closed |
| `OPENAI_API_KEY` | Voice option: OpenAI Realtime | Reported as missing |
| `ELEVENLABS_API_KEY`, `SPEECH_TO_TEXT_API_KEY` | Voice option: Claude with separate speech services | Reported as missing |
| `EXOTEL_SID`, `EXOTEL_API_KEY`, `EXOTEL_API_TOKEN` | Phone carrier | Reported as missing |

The voice and carrier keys are read only to report whether they are set. The server does not call those providers itself; the media bridge does.

## 15. API reference

All paths are under `/api`. Replies are JSON. Errors are `{ "error": "message", "code": "...", "requestId": "..." }` with a 4xx or 5xx status. Staff calls send `Authorization: Bearer <token>`.

The frontend's API client (`frontend/src/lib/api.js`) gives up on a request after 20 seconds, retries a read once if the connection drops or the server answers 502, 503 or 504, never repeats a change, and shares one request between screens that ask for the same thing at the same moment. Screens that refresh on a timer pause while the browser tab is in the background. If the server cannot be reached, one banner says so and clears when a request gets through.

### Accounts

| Method and path | Purpose |
|---|---|
| `POST /auth/signup/code`, `POST /auth/signup/verify`, `POST /auth/register` | Register a clinic after verifying email and phone |
| `POST /auth/login` | Log in with email and password |
| `POST /auth/code`, `POST /auth/verify` | One-time code login and password reset |
| `POST /auth/demo` | Log into the demo clinic as a role |
| `GET /auth/me`, `PATCH /auth/me`, `POST /auth/logout`, `POST /auth/switch` | Current user, profile and password, log out, switch clinic |
| `GET /auth/invite/:token`, `POST /auth/invite/:token/accept` | Join a clinic from an invitation |
| `GET /auth/permissions` | The role table |

### Front desk

| Method and path | Purpose |
|---|---|
| `GET /frontdesk/summary` | Everything for the front desk dashboard. Optional `locationId` |
| `PATCH /frontdesk/tasks/:id` | Start, finish or reopen a dentist's task |
| `PUT /frontdesk/handoff/:appointmentId` | Reception's note for the dentist |
| `GET /arrivals` | Arrivals board for a day |
| `POST /arrivals/:appointmentId/arrive` | Check in, issue a token |
| `PATCH /arrivals/visits/:visitId` | Move a visit through the queue |
| `POST /arrivals/call-next` | Call the next ready patient |
| `POST /arrivals/:appointmentId/payment` | Record a payment |
| `GET /arrivals/:appointmentId/receipt`, `POST .../receipt/send` | Receipt, and send it to the patient |
| `POST /arrivals/:appointmentId/no-show` | Mark as a no show |
| `GET /arrivals/board` | Public: the waiting-room display |

### Patients and appointments

| Method and path | Purpose |
|---|---|
| `GET /patients`, `POST /patients`, `GET /patients/:id`, `PATCH /patients/:id` | Patient directory. `q` searches name, mobile and email. Optional `limit` and `offset`; the total is in the `X-Total-Count` header |
| `GET /patients/export.csv`, `POST /patients/import` | Owner and admin only |
| `GET /appointments`, `POST /appointments`, `GET /appointments/:id`, `PATCH /appointments/:id` | Bookings |
| `POST /appointments/:id/confirm`, `/reschedule`, `/cancel` | Change a booking |
| `GET /availability` | Free slots |
| `GET /blocks`, `POST /blocks`, `DELETE /blocks/:id` | Blocked time |
| `GET /waitlist`, `POST /waitlist`, `POST /waitlist/:id/accept`, `/decline` | Waiting list |
| `GET /reminders/due`, `POST /reminders/send` | Appointment reminders |

### Dentist

| Method and path | Purpose |
|---|---|
| `GET /dentist/dashboard` | Counts, schedule, attention items, free time |
| `GET /dentist/queue` | Arrivals and queue |
| `POST /dentist/appointments/:id/call`, `/start`, `/complete` | Move a visit; `complete` can create tasks for reception |
| `POST /dentist/delay` | Tell reception the dentist is running late |
| `POST /dentist/appointments/:id/handoff/acknowledge` | Confirm reception's note was seen |
| `GET /dentist/intake`, `GET /dentist/intake/:packetId` | Submissions, and one in detail |
| `POST /dentist/intake/:packetId/review`, `/clarification` | Record a review, or ask reception to clarify |
| `GET /dentist/followups`, `POST /dentist/followups` | Tasks for reception |

`/doctor` holds the clinical tools (dashboard, chart, finish visit, prescriptions, tooth chart, lab cases, earnings, documents).

### Forms

| Method and path | Purpose |
|---|---|
| `GET /forms` | Packets for upcoming visits |
| `POST /forms/send`, `POST /forms/:id/remind` | Send or remind |
| `PUT /forms/:id/sections/:key`, `PUT /forms/:id/custom/:formId` | Staff filling in for a patient |
| `GET /forms/templates`, `POST`, `PUT /:id`, `DELETE /:id`, `POST /:id/duplicate` | The clinic's own forms |
| `POST /forms/templates/draft`, `/import` | A draft from a description or an uploaded file |
| `POST /forms/templates/:id/send` | Send to all upcoming patients |
| `GET /forms/token/:token`, `PUT .../sections/:key`, `PUT .../custom/:formId` | Public: the patient's own link |
| `POST /forms/assign`, `GET /forms/report`, `GET` and `PUT /forms/intake-settings`, `POST /forms/:id/review`, `/clarify`, `/paper`, `/attachments` | Intake workflow |

### Kiosk, public site, conversations, calls

| Method and path | Purpose |
|---|---|
| `POST /kiosk/sessions`, `POST /kiosk/sessions/:id/identify`, `/language`, `/forms/:key`, `/insurance`, `/consent`, `/help`, `/complete`, `/end` | Public: the kiosk flow |
| `GET /public/clinic`, `GET /public/slots`, `POST /public/book` | Public: clinic website and online booking |
| `POST /conversations`, `POST /conversations/:id/messages` | Public: patient chat |
| `GET /conversations`, `POST /conversations/:id/takeover`, `/release`, `/close` | Staff inbox |
| `POST /calls`, `POST /calls/:id/messages`, `POST /calls/:id/end`, `GET /calls` | Text-based call assistant and call log |
| `GET /callbacks` | People to call back |

### Voice

| Method and path | Purpose |
|---|---|
| `GET /voice/status`, `PUT /voice/settings` | Owner and admin: provider, keys present, bridge addresses |
| `POST /voice/incoming`, `POST /voice/calls/:id/turn`, `/tool`, `/transcript`, `/end` | The media bridge; requires `x-voice-secret` |

### Owner and admin

| Method and path | Purpose |
|---|---|
| `GET /dashboard` | Period comparison for the Overview |
| `GET /insights` | Operational numbers; revenue for owners and admins only |
| `GET /settings`, `PUT /settings` | Clinic settings, including `branding` |
| `GET /team`, `POST /team/invites`, `PATCH /team/members/:id`, `DELETE /team/members/:id` | Team |
| `GET /integrations`, `GET /integrations/status`, `POST /integrations/email/test`, `POST /integrations/api-key`, webhooks | Integrations |
| `GET /marketing`, campaigns, prompts, approval queue | Marketing with owner approval |
| `GET /admin/export`, `POST /admin/import`, `POST /admin/reset` | Data export, import and reset |
| `GET /fhir/...` | FHIR R4 resources for an EHR, with the clinic's API key |

## 16. Tests

```bash
npm test
```

105 tests in `backend/test/`, run against the real Express app with in-memory data and the rule engine. They need no keys and no network.

Scenarios covered end to end:

- Register a clinic, guard routes, invite each role.
- Register a patient, find them by mobile, book, block a double booking, confirm, check in, issue a token, call, seat, complete, take a UPI payment, read the receipt, and set a recall.
- The front desk dashboard's counts moving together with check-in and payment.
- The dentist and reception handing work to each other: handoff note, intake review, clarification task, visit close, follow-up task.
- A clinic writing a form, sending it to all, a patient answering it, and staff seeing it done. Drafting from a description and from an uploaded file.
- Branding saved, cleaned and shown on every patient screen. Kiosk queue position.
- The voice layer in both shapes, including booking through tools and refusing an unoffered slot.
- Email: refusal when not connected, delivery through a stand-in provider when connected.
- Security: one clinic cannot see another's data; an outside visitor gets nothing from a real clinic; the role table for owner, front desk and dentist; data files encrypted with a key, and not overwritten when the key is wrong.

There are no automated frontend tests. Screens were checked by hand and with a browser script during development.

## 17. What is simulated or not built

**Simulated until a provider is connected**

- Outgoing WhatsApp, SMS and email.
- One-time codes: shown on screen in development when no provider can deliver them.
- Insurance card scanning at the kiosk.
- Online payment: payments are recorded by reception, not charged through a gateway.

**Not built**

- The phone media bridge (section 11).
- Invoices with line items, partial payments and refunds. Today a visit has one fee and one payment.
- Chairs as bookable resources. Chairs are counted per branch, not assigned to appointments.
- A month view in the calendar.
- Dentist working-hours and leave requests with approval, and internal staff messaging.
- An approvals centre, a full audit log, custom roles, report exports to PDF, and subscription management.
- Live push updates: screens refresh every few seconds instead.
- The clinic's own forms on the kiosk. Patients fill them from their link.

## 18. Deploying

The repository does not prescribe a host. Whatever you choose:

- Serve the built frontend (`frontend/dist`) and run `npm start` for the API.
- Put both behind HTTPS.
- Set `NODE_ENV=production`, and `CLINOVARA_FRONTEND_URL` to the public address so links in messages are correct.
- Keep the data directory on storage that survives restarts and is backed up (`npm run backup`).
- Set `CLINOVARA_DATA_KEY` before real patient data goes in, and store the key separately from the data.
- Set `CLINOVARA_ALLOWED_ORIGINS` to your frontend's address.
- Add the provider keys you need, then check Settings → Integrations and send a test email.
