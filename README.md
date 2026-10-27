# Smart Campus ERP — School • College • Coaching

One system for a school, a college and coaching batches, with Claude AI and daily automation.

**Stack:** React 19 (Vite) · Node.js (Express 5) · MongoDB (Mongoose) · Claude API (`@anthropic-ai/sdk`)

## Run it

Requirements: Node.js 20.12+ and MongoDB running on `127.0.0.1:27017`.

```bash
npm install
npm run dev          # web on http://localhost:5388, API on http://localhost:5188
```

The `.env` file is already set up for local use. On first start an empty database is filled with demo data
(7 batches, 70 students, fees, attendance, exams, tests, leads). To start over: `npm run seed`.

| Role | Login | Password |
|---|---|---|
| Super admin | admin@campus.local | admin123 |
| School / College / Coaching admin | school@campus.local, college@campus.local, coaching@campus.local | admin123 |
| Teacher | teacher@campus.local | teacher123 |
| Accountant | accounts@campus.local | accounts123 |
| Counsellor | counsellor@campus.local | counsellor123 |
| Student | admission no., e.g. `coa260001` | student123 |
| Parent | guardian mobile no., e.g. `9876500001` (two children) | parent123 |

The login page has Student / Parent / Staff tabs; each tab only accepts its own kind of account.
Every student with a guardian phone gets a parent login automatically (siblings with the same number share one login).

Change these passwords before using real data.

### Turn on AI

Put a Claude API key in `.env` and restart:

```
ANTHROPIC_API_KEY=sk-ant-...
```

A system-wide `ANTHROPIC_API_KEY` environment variable takes priority over `.env`. Everything except the AI
buttons works without a key. The model is `claude-opus-5-5` (`AI_MODEL`). If Claude declines a request, the API
retries it on a fallback model (`AI_FALLBACKS=on`; set `off` to disable).

### Production

```bash
npm run build
NODE_ENV=production npm start     # serves the built app and the API on PORT (5188)
```

Use a new random `JWT_SECRET` and strong admin password on the server.

## Platform: many clients, one central server

This server can host many client institutes. Each one has its **own MongoDB database** on your
server (`sc_<code>`); you control all of them from the **owner console** at `/owner`
(login = `OWNER_EMAIL` / `OWNER_PASSWORD` in `.env`, only on your own hosts, never on a client's domain).

In the owner console you can:

- create an institute (name, code, super admin login, optional demo data) and set its **modules**,
  subscription end date, max desktop installs, offline days;
- give it web addresses: `<code>.PLATFORM_DOMAIN` works automatically, plus any **custom domain**
  of the client (`erp.clientschool.com`), with a **Check DNS** button;
- **suspend** an institute or let its subscription end → web and desktop both lock;
- reset the institute's super admin password;
- issue **desktop installations** (Windows .exe) with their own key and modules, copy the download
  link, move a key to another computer, or **revoke** it.

The database in `MONGODB_URI` stays the **main** institute (served on `localhost` / your own domain), so
existing setups keep working. Modules: academics, online exams, LMS, fees, finance, payroll, transport,
certificates, admissions CRM, automation, AI (`shared/modules.js`); the core (students, staff, classes,
notices, settings, admins) is always on. Blocked modules disappear from menus and their API returns 403.

### Live server with client domains

1. Point your own domain at the server: `A  app.myerp.in → <server IP>` and a wildcard
   `A  *.myerp.in → <server IP>` (for `<code>.myerp.in`).
2. `.env`: `PLATFORM_DOMAIN=myerp.in`, `PLATFORM_URL=https://app.myerp.in`,
   `PLATFORM_CNAME_TARGET=app.myerp.in`, `SERVER_IP=<server IP>`, `NODE_ENV=production`.
3. Run Caddy with [deploy/Caddyfile](deploy/Caddyfile): it gets HTTPS certificates automatically,
   also for client domains (it asks `/api/platform/tls-check` first, so only domains you added work).
4. For a client domain, the client (or you) adds at their DNS provider:
   `CNAME erp → app.myerp.in` (subdomain) or `A @ → <server IP>` (main domain). Add the domain in the
   owner console and press **Check DNS**. The client's data stays on your server; they only own the name.

Back up the `keys/` folder: it signs desktop licences, and desktop apps are built with its public key.

## Windows desktop app (.exe, works offline)

The desktop app runs the same app on the client's computer with its own local database, so it works
**without internet**. Every minute it syncs with your central server: local changes go up, changes made
online come down (newer edit wins; deletes are synced too). Receipt / admission / voucher / certificate
numbers made on a desktop carry its device code (`RCP-2026-D2-00001`) so they never clash.

```bash
npm run desktop:install                                  # once: Electron + builder
npm run desktop:build -- --url=https://app.myerp.in      # → desktop/release/SmartCampus-Setup-<ver>.exe
```

The build bundles `mongod.exe` from your MongoDB install and the licence public key from `keys/`.
After building, the owner console's **Link** button gives a download URL per installation
(`/api/platform/download/<KEY>`): the file is named `SmartCampus-Setup-<KEY>.exe`, installs per-user
with a **desktop shortcut** and activates itself on first start (needs internet once, for the first
download of the institute's data). Without that file name, the app asks for the key.

The institute's **super admin** manages its own keys too, on the website under
**Super Admin → Desktop Apps**: create a key, limit its modules, **Deactivate** / **Activate** it and
**Move** it to another computer (within the owner's *max desktop installs*). Every change is in the
Activity Log. Inside the desktop app the same page shows that computer's licence and sync status.
Each key has a plan: **Monthly**, **Yearly**, a fixed date or no expiry. An expired key cannot be
activated, a running app locks at its next sync (offline apps lock on the date itself), and **Renew**
adds one month / year and unlocks it again.

## Live bus tracking (GPS)

Transport → **Live Bus Tracking** shows every bus on an OpenStreetMap map (refreshes every 10 s),
with speed, last update and today's path. Positions come from either
- the **Traccar Client** app (Android / iPhone, works in the background) or a GPS tracker that posts
  the OsmAnd protocol to `/api/gps/osmand` - device identifier = the bus's tracking token (or its
  *GPS device id*), or
- the driver's phone browser at `/track/<token>` (needs the site on **https**).

Each bus's **Setup** button creates the token and shows both options. Students and parents see their
bus, their stop, the distance and a rough ETA on their Transport page. Set stop positions in
Routes & Stops → Edit stops → **Pick** (click on the map or paste "lat, lng"). Positions stay on the
central server (the path is kept for 3 days) and are not synced to desktop apps.

Licence rules: a key binds to the first computer that activates it (**Move** in the console frees it);
the desktop gets only its installation's modules and only those collections are synced; admin logins
can only be created or promoted online; if a desktop is offline longer than the institute's
*offline days* (default 15) it locks until it syncs; revoked keys and suspended / expired institutes
lock at the next sync. AI features need the central server and are off on the desktop.
The installer is not code-signed, so Windows SmartScreen shows "More info → Run anyway" until you sign it.
`npm run desktop:stage` + `npm run desktop:dev` runs the app from source for testing.

## Modules

**Overview**
- Dashboard — students by type, today's attendance, fee collection (6 months), attendance trend, at-risk students, admissions pipeline.
- AI Assistant — chat in English/Hindi/Hinglish. It reads live data through read-only tools (students, attendance, fees, exams, leads, timetable).
- Smart Insights — every active student gets a 0–100 risk score from low attendance, low or falling marks and overdue fees. "AI plan" writes a counselling plan and a parent message.

**People** — students (admission, profile, portal login, CSV export), staff, classes/courses/batches (type, subjects, fee, installments, capacity).

**Academics**
- Attendance — daily marking and monthly register.
- Timetable — per batch or per teacher, with clash checks.
- Exams & results — marks entry, automatic totals/grades/ranks, AI report-card remarks, printable report cards, publish to students.
- Online tests — timed MCQ tests with negative marking, AI question generation, auto-grading, rank list, per-question accuracy.
- Question papers — AI-written papers with sections, marks and answer key; print or save as PDF.
- Study material and doubts — students get an instant AI explanation, teachers add their answer.

**Office**
- Fees — installment plans created on admission, collection (UPI/cash/card/bank/cheque), receipts, dues, batch summary.
- Admissions CRM — enquiries on a pipeline, conversion score, follow-up log, AI WhatsApp message, one-click admission.
- Notices — with AI drafting (English/Hindi).
- Automation — daily rules: fee reminders, absent alerts, low-attendance warnings, lead follow-ups, birthday wishes, exam and test results. Messages queue in the Outbox and open in WhatsApp pre-filled; a message is never queued twice.
- Settings — institute details, attendance threshold, pass %, staff logins and roles.

**LMS**
- Courses — modules and lessons (YouTube / Google Drive video, notes, links, quizzes), assigned to batches, publish/unpublish, per-student progress and per-lesson completion.
- Assignments — homework for a batch with due date and marks; students submit text or a Drive link; teachers grade, give feedback or ask for a redo. Daily automation reminds parents of pending work.
- Leave requests — parents/students apply from their portal; approving marks those days as Leave in attendance.

**Parent portal** — all children on one login with a child switcher; per child: overview, attendance, timetable, results and report cards, tests, course progress, homework with marks and feedback, study material, fees and receipts, notices, leave applications. Read-only except leave applications.

**Super admin & wings** — the super admin (the `.env` admin) allocates admins to the School, College and Coaching wings. A wing admin — and any staff login limited to a wing — only sees and changes that wing's batches, students, staff, attendance, exams, tests, fees, enquiries, notices, LMS and outbox; the server enforces this on every route. Re-allocating wings or disabling a login takes effect on the next request. Institute settings and automation rules are super-admin only.

**Activity log** — every create / update / delete by staff and admins, every login and failed login, with who, when, wing, module, a readable summary and the request details (passwords masked). Filter by person, wing, module, action, date and text; the Admins page shows each login's activity for the last 7 days.

**Student portal** — home, attendance, timetable, results and report cards, online tests, courses (lesson player and quizzes), assignments, study material, AI tutor, fees and receipts, notices, leave.

## Roles

| Section | Admin | Teacher | Accountant | Counsellor |
|---|---|---|---|---|
| Dashboard, students, batches, notices, automation, AI assistant | ✓ | ✓ | ✓ | ✓ |
| Attendance, exams, tests, papers, material, doubts | ✓ | ✓ | | |
| LMS courses, assignments, leave requests | ✓ | ✓ | | |
| Fees | ✓ | | ✓ | |
| Admissions CRM | ✓ | | | ✓ |
| Staff, timetable editing, staff logins (own wings) | ✓ | | | |
| Admins & wings, activity log, institute settings, automation rules | super admin only | | | |

## Code map

```
server/
  index.js        Express app, error handling, scheduler start
  models.js       All Mongoose models
  insights.js     Rule-based analytics: risk score, lead score, dashboard numbers
  ai.js           Claude: assistant tools, paper/MCQ generators, remarks, tutor, lead message, notice
  automation.js   Daily rules → Outbox
  services.js     Fee plans, payments/receipts, exam ranking, student logins
  seed.js         Demo data (`npm run seed`); seed-lms.js adds the LMS demo
  routes/         core (auth, students, staff, batches), academics, office (fees, CRM, automation, AI),
                  lms (courses, assignments, leave), portal (student; shared views), parent
  tenancy.js      Per-institute databases: models resolve to the current request's institute
  platform/       Owner console API, institutes + installations, host → institute resolver
  license.js      Signed desktop licences (Ed25519)
  sync/           Desktop sync: central.js (server side), client.js (desktop side), common.js
  desktop.js      Desktop mode: licence lock, /api/desktop status
shared/modules.js Sellable modules → menus, API paths, synced collections
desktop/          Electron app (main.js), activation screen, installer build (build.mjs)
deploy/Caddyfile  HTTPS for your domain and client domains
src/
  pages/staff/    Staff screens
  pages/portal/   Student portal (also shown to parents through lib/scope.jsx)
  pages/parent/   Parent home and child overview
  pages/owner/    Owner console (/owner)
  components/     UI kit, charts, layout, printable documents
```
