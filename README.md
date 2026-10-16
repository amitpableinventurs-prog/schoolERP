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
src/
  pages/staff/    Staff screens
  pages/portal/   Student portal (also shown to parents through lib/scope.jsx)
  pages/parent/   Parent home and child overview
  components/     UI kit, charts, layout, printable documents
```
