# Deploying Clinovara

One Node process serves the API and the built frontend, and stores each clinic's data as JSON files.

## Before the first clinic signs up
1. **Email (required).** Create a Resend account, verify your sending domain, set `RESEND_API_KEY` and `MAIL_FROM`.
   Without it, production sign-up refuses to send codes (by design: codes are never shown on screen in production).
2. **Public URL.** Set `CLINOVARA_FRONTEND_URL` to the public address with a trailing slash. Links in invitations, forms and reminders use it.
3. **HTTPS.** Use a host that terminates TLS (Render, Railway, Fly) or put Caddy/nginx in front.
4. **Persistent storage.** Mount a disk at `/data` (`CLINOVARA_DATA_DIR=/data`). Without it, data is lost on every deploy.
5. **Backups.** Run `npm run backup` daily (cron or the host's scheduler) and copy `backups/` off the machine.
6. **Legal.** Have a lawyer review the Terms and Privacy pages and set a real contact address in `frontend/src/pages/Legal.jsx`.

## Optional providers (each switches on when its variables are set)
| Feature | Variables |
|---|---|
| Claude AI (patient chat, marketing drafts, staff assistant) | `ANTHROPIC_API_KEY` |
| SMS and phone verification | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` |
| WhatsApp reminders | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` |

India notes: SMS needs DLT-registered templates and sender IDs; WhatsApp messages outside a patient's 24-hour window need a Meta-approved template.
Until SMS is configured, production sign-up skips phone verification and stores the number as unverified.

## Run it
- **Render:** connect the repo and use `render.yaml` (a Blueprint).
- **Docker anywhere:** `docker build -t clinovara .` then `docker run -p 4200:4200 -v clinovara-data:/data --env-file backend/.env clinovara`
- **No Docker:** `npm run setup && npm run build && NODE_ENV=production npm start`

Health check: `GET /api/health`. It reports whether email and SMS verification are deliverable.

## Scaling note
Data lives in files on one machine, so run a single instance. Moving to a database is the next step once you have many active clinics.
