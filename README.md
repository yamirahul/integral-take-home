# Integral Take-Home Challenge

## Your Mission

Welcome to Integral's Take-Home Challenge! We need your help building a privacy-conscious clinical trial enrollment system.

**The Scenario:** A pharmaceutical research company is running multiple clinical trials and needs a secure platform where patients can submit enrollment applications. Trial coordinators must screen applications against eligibility criteria while protecting patient privacy during the initial review process. Only after a patient progresses through screening should their full personal information be revealed.

**Your task:** Build a web application that balances thorough data collection with privacy protection, enabling patients to submit comprehensive enrollment applications while allowing trial coordinators to perform initial screenings with masked personally identifiable information (PII).

## The Challenge

Build a web app where:

- A user can login as a **Patient** or **Reviewer** (Trial Coordinator)
- A **Patient** submits an enrollment application with personal information and supporting documents
- The enrollment application appears in a **Review Queue** for trial coordinators
- A **Reviewer** can toggle between **privileged** (full data) and **redacted** (masked PII) views
- Reviewers can **update status** (Pending → In Review → Approved/Rejected)
- The system records an **audit trail** of all actions for compliance
- Patients can upload supporting documents (medical records, insurance cards, etc.)

## Setup

Requires Node `^20.19 || ^22.12 || >=24.0` (see `.nvmrc` — `nvm use` will pick it up).

1. Clone the repository to your local machine
2. Copy the environment file: `cp .env.example .env` (includes a dev `AUTH_SECRET` used to
   sign session cookies — replace it with your own random value for anything beyond local dev)
3. Install dependencies: `npm install`
4. Generate Prisma client: `npx prisma generate`
5. Run database migrations: `npx prisma migrate dev`
6. Seed the database: `npm run db:seed`
7. Start the development server: `npm run dev`
8. Visit `http://localhost:3000/` in your browser
9. Sanity check that the database is wired up: `curl http://localhost:3000/api/users`
   should return the two demo users below

A pre-seeded `dev.db` is checked in, so steps 5 and 6 are no-ops on a fresh clone. Re-seeding
regenerates record IDs, so `dev.db` will show up as modified in `git status` — that's expected,
and committing it is fine.

## Design Inspiration

Design references and mockups are available in the `/public/design-inspiration/` folder. You can view them at:

- `http://localhost:3000/design-inspiration/[filename]`

These are provided as optional visual guidance. Feel free to implement your own design approach.

**Heads up:** the mockups are from an earlier iteration of this exercise and are intentionally
not authoritative — they label the submitter role "Client" rather than "Patient", show a
"Full Address" field that isn't in the schema, and don't show document uploads. Where they
disagree with this README or `prisma/schema.prisma`, this README and the schema win.

## Database Schema

The project uses Prisma with SQLite. The schema is defined in `prisma/schema.prisma`:

### User

- `id`, `email`, `name`, `role` (PATIENT or REVIEWER), `organization`, `password`
  (scrypt hash, see `src/lib/auth.ts`)
- Patients submit enrollment applications, Reviewers (trial coordinators) screen them

### Authentication

- Credential login (email + password) against the `User` table, no third-party auth
  library — see the FAQ below.
- `POST /api/auth/login` verifies the password (`src/lib/auth.ts`, Node's built-in
  `scrypt`) and sets an httpOnly, HMAC-signed session cookie (`src/lib/session.ts`,
  Web Crypto) containing the user's id and role. No `Session` table — the signature is
  what makes the cookie trustworthy, so there's nothing to look up server-side.
- `POST /api/auth/logout` clears the cookie. `GET /api/auth/me` returns the current
  user (used by client components; server components/route handlers can call
  `getCurrentUser()` from `src/lib/current-user.ts` directly).
- `src/proxy.ts` (Next.js 16's replacement for `middleware.ts`) gates `/intake/*` to
  signed-in PATIENTs and `/queue/*` to signed-in REVIEWERs, redirecting otherwise — so
  route protection can't be forgotten on a new page under either path. It also makes
  `/` a sign-in-only page: an authenticated visitor is redirected straight to their
  home (`/intake` or `/queue`) before the sign-in form ever renders, and a signed-out
  visitor to a protected route is bounced back to `/`.

### Intake

- Applicant information: `clientName`, `clientEmail`, `clientPhone`, `dateOfBirth`, `ssn`
- Application details: `description`, `notes`
- Status: `PENDING`, `IN_REVIEW`, `APPROVED`, `REJECTED`
- Relations: `submittedBy` (User), `reviewer` (User, optional), `documents` (Document)

### AuditLog

- `action`: Type of action (CREATED, STATUS_CHANGED, VIEWED, ASSIGNED, DOCUMENT_UPLOADED)
- `details`: JSON string with additional context
- Relations: `user` (who performed the action), `intake` (which intake)

### Document

- Supporting files uploaded by an applicant (medical records, insurance cards, prescriptions, ID photos, etc.)
- `fileName`, `fileType`, `fileSize`, `filePath`, `description`
- Relations: `intake` (cascade deletes with the intake)
- **Note:** This model is already provided. Your task is the upload handling and file
  storage, not the schema design.

### Document uploads & storage (Goal 3)

`Document` is scoped to exactly one `Intake` in the schema above, and per the note, that
wasn't redesigned. "Upload once, reuse across every application" is built on top of it
instead:

- Files are stored on disk under `storage/` (gitignored — not committed like `dev.db` is),
  named by the **SHA-256 hash of their contents** (`src/lib/documents.ts`). Identical bytes
  always resolve to the same path, so uploading the same file twice, or reusing a document
  on a second intake, never writes a duplicate to disk — it only adds another `Document`
  row pointing at the same stored file.
- `POST /api/documents/attach` is that reuse action: given a `documentId` you already own
  and one or more `intakeIds`, it creates a new `Document` row per intake, each with the
  same `filePath` — no re-upload, no new bytes written. `POST /api/documents` (the upload
  route itself) takes multiple `intakeIds` too, so a fresh upload can attach to several
  applications in the same request the file is written in.
- The `/documents` page computes a per-patient "library" by grouping their `Document` rows
  by `filePath` — rows sharing a `filePath` are the same file attached to multiple
  applications, shown as one library entry with a chip per attached application.
- Files are **never** served as static assets (nothing under `storage/` is inside
  `public/`). The only way to read one is `GET /api/documents/[id]/file`, which checks
  the requester is either the uploading Patient or a Reviewer before streaming bytes.
- Accepted: PDF and photos (JPEG/PNG/WEBP/HEIC), up to 10MB, validated server-side
  regardless of what the browser's file picker allowed through.

### Review Queue & data minimization (Goal 4)

`/queue` is a Reviewer's landing page (`src/proxy.ts` sends them straight there on
sign-in) — a table of every application, with stat-card counts by status, search
(name/ID/email), a status filter, and self-assignment.

- `src/lib/intakes.ts`'s `SAFE_INTAKE_SELECT` is the important part: the query behind
  both the queue table and a patient's own "Your Applications" list **never selects**
  `ssn`, `clientPhone`, `dateOfBirth`, `description`, or `notes` — not because they're
  masked, but because neither list has ever needed to display them. The
  privileged/redacted toggle the README's Privacy Model describes (Goal 5) applies to
  the single-intake *detail* fetch, which is the only place those fields get requested
  at all — so there was nothing to redact in the list endpoint in the first place.
- `PATCH /api/intakes/[id]` currently handles Reviewer self-assignment only
  (`{ reviewerId: <self> }` to claim, `{ reviewerId: null }` to release) — a Reviewer
  can't assign an application to someone else, or release someone else's claim. Writes
  an `ASSIGNED` audit entry. Structured so Goal 6 can extend the same handler with a
  `status` field for the PENDING → IN_REVIEW → APPROVED/REJECTED transitions.
- `/queue/[id]` exists only as a placeholder so the table's "View" action isn't a dead
  link — it shows the same safe fields as the table, with a note that the full record
  (privileged/redacted PII, status changes, audit trail) is Goal 5/6/7. Expect that file
  to be replaced when Goal 5 lands.

### Detail View & the privileged/redacted toggle (Goal 5)

`GET /api/intakes/[id]` is the one query in the app that ever requests `ssn`,
`clientPhone`, `dateOfBirth`, `description`, or `notes` (`getIntakeDetail()` in
`src/lib/intakes.ts`) — everything else (Goal 4's lists) deliberately never fetches them.

- **The toggle is a real server round trip, not a client-side hide/show.** A page load
  always fetches the redacted view — masked `ssn`/`clientPhone`/`dateOfBirth`
  (`src/lib/redact.ts`) never touch the initial HTML or RSC payload for a Reviewer.
  Clicking "Privileged View" makes a fresh `GET /api/intakes/[id]?view=privileged`
  request; only then does the server send the unmasked fields. A pure client-side toggle
  that just hid already-loaded PII would defeat the point — it'd still be sitting in the
  page source and React DevTools even while "hidden."
- Every `?view=privileged` request from a Reviewer writes a `VIEWED` audit log entry
  (`{ view: "privileged" }`) — the sensitive action (unmasking someone's SSN) is what's
  worth recording, the way a real compliance system logs "break-glass" access. Viewing
  the default redacted state isn't logged.
- A Patient's own detail page (`/intake/[id]`) reuses the same `IntakeDetail` component
  with the toggle turned off — the README's Privacy Model says a Patient always sees
  their own data complete and unmasked, so there's no redacted state to switch out of.
  `getIntakeDetail()` enforces this at the data layer regardless of what's requested, not
  just in the UI.
- Supporting documents are listed on the detail page (both roles) and are clickable —
  each opens `GET /api/documents/[id]/file` (already auth-gated, unchanged from Goal 3)
  in a new tab.

### Status Updates (Goal 6)

`PATCH /api/intakes/[id]` (the same endpoint Goal 4 built for self-assignment) now also
accepts a `status` field — either key, or both, in one request.

- **Not restricted to a linear pipeline.** Any Reviewer can set any of the 4 statuses
  (`PENDING`, `IN_REVIEW`, `APPROVED`, `REJECTED`) at any time, including moving
  "backwards" — a wrong call is correctable without a special "reopen" flow. What's
  enforced instead is that every change is real and recorded: each actual transition
  writes its own `STATUS_CHANGED` audit entry (`{ from, to }`); re-setting the status it's
  already at is a `200` no-op, not a fake audit entry.
- The status control on the Reviewer's detail view (`/queue/[id]`) uses the same 4-color
  vocabulary as the badges and queue stat cards from `reviewer-dashboard.png` — amber
  Pending, blue In Review, green Approved, red Rejected — so status means the same thing
  everywhere it appears in the app. It doesn't appear on a Patient's own detail page; only
  a Reviewer can change status.
- The Review Queue table also has an inline status `<select>` per row (styled to the same
  4 colors) — a second, faster path for the common case of not needing the full record
  open first. Both it and the detail view's control call the exact same `PATCH`, so
  there's one source of truth for what counts as a real change.

### Audit Trail (Goal 7)

Every prior goal was already writing `AuditLog` rows as it went — `CREATED` (Goal 2),
`DOCUMENT_UPLOADED` (Goal 3), `ASSIGNED` (Goal 4), `VIEWED` (Goal 5), `STATUS_CHANGED`
(Goal 6). This goal is entirely about displaying what's already being recorded, not
recording anything new.

- `src/lib/audit.ts` — one query (global, or filtered to a single `intakeId`), used by
  both surfaces below, same pattern as `src/lib/intakes.ts`.
- `src/lib/audit-format.ts` — turns each entry's `action` + JSON `details` into one plain
  sentence ("Dr. Sarah Chen changed status from Pending to In Review."), client-safe (no
  Node dependencies) so it runs in the browser, not just the server.
- **`/queue/audit`** — a new Reviewer-only page (added to the header's nav, next to
  Review Queue) listing every action across every application, searchable by name/ID and
  filterable by action type — reuses `queue.module.css`'s card/toolbar chrome rather than
  duplicating it a third time.
- **Per-application history** — the same list, filtered to one `intakeId`, embedded at
  the bottom of the Reviewer's detail view (`/queue/[id]`). Not shown on a Patient's own
  detail page (`/intake/[id]`) — the audit trail is a Reviewer/compliance surface, the
  same scope line Goal 5's toggle and Goal 6's status control already drew.
- `src/components/AuditLog.tsx` is the shared list renderer both surfaces use — one
  component, an `showApplication` prop toggling whether each row also names which
  application it belongs to (needed on the global list, redundant on the per-application
  one).

## Demo Users

The database is seeded with two demo users. Both use the password `password123`
(see `prisma/seed.ts`) — the password field is real (scrypt-hashed, checked at
login), this is just a shared fixture for a take-home, not a real secret.

| Email               | Role     | Organization                 |
| ------------------- | -------- | ---------------------------- |
| `patient@demo.com`  | PATIENT  | Trial Participant            |
| `reviewer@demo.com` | REVIEWER | PharmaCorp Trial Coordinator |

## Project Structure

```
src/
├── proxy.ts                  # Route guard (Next 16's middleware.ts rename) — auth + role gating
├── app/
│   ├── layout.tsx            # Root layout
│   ├── globals.css           # Global styles
│   ├── page.tsx              # "/" — sign-in page (Patient/Reviewer toggle), default entry point
│   ├── intake/
│   │   ├── page.tsx          # Server Component: auth + initial data for /intake
│   │   ├── IntakeView.tsx    # Enrollment form, success screen, "Your Applications" list
│   │   ├── intake.module.css
│   │   └── [id]/
│   │       └── page.tsx      # Patient's own detail view — IntakeDetail with the toggle off (Goal 5)
│   ├── documents/
│   │   ├── page.tsx          # Server Component: auth + initial data for /documents
│   │   ├── DocumentsView.tsx # Upload form + per-patient document library (Goal 3)
│   │   └── documents.module.css
│   ├── queue/
│   │   ├── page.tsx          # Server Component: auth + initial data for /queue
│   │   ├── QueueView.tsx     # Stat cards, search/filter, table, self-assign + inline status (Goals 4 & 6)
│   │   ├── queue.module.css
│   │   ├── [id]/
│   │   │   └── page.tsx      # Reviewer's detail view — IntakeDetail with toggle + status + audit trail on
│   │   └── audit/
│   │       ├── page.tsx          # Server Component: auth + all audit log entries (Goal 7)
│   │       └── AuditTrailView.tsx # Search + action-type filter over the full log
│   └── api/
│       ├── auth/
│       │   ├── login/route.ts    # POST — verify credentials, set session cookie
│       │   ├── logout/route.ts   # POST — clear session cookie
│       │   └── me/route.ts       # GET — current user
│       ├── intakes/
│       │   ├── route.ts          # GET (role-scoped list) / POST (create) intakes
│       │   └── [id]/
│       │       └── route.ts      # GET (privileged/redacted toggle, Goal 5) / PATCH assign + status (Goals 4 & 6)
│       ├── documents/
│       │   ├── route.ts          # GET (library) / POST (upload) documents
│       │   ├── attach/route.ts   # POST — reuse an existing document on another intake
│       │   └── [id]/
│       │       ├── route.ts      # DELETE — remove one attachment
│       │       └── file/route.ts # GET — stream file bytes (auth-gated)
│       └── users/
│           └── route.ts          # GET users (reference example)
├── components/
│   ├── AppHeader.tsx         # Shared top bar (brand, role-specific nav, user, logout) — every page
│   ├── AppHeader.module.css
│   ├── LogoutButton.tsx
│   ├── AuditLog.tsx          # Shared audit list renderer, used by /queue/audit and /queue/[id] (Goal 7)
│   ├── AuditLog.module.css
│   ├── IntakeDetail.tsx      # Shared detail view, used by both /queue/[id] and /intake/[id] (Goal 5)
│   └── IntakeDetail.module.css
├── lib/
│   ├── prisma.ts             # Prisma client singleton
│   ├── auth.ts               # Password hashing (scrypt)
│   ├── session.ts            # Signed session cookie (Web Crypto — Edge + Node safe)
│   ├── current-user.ts       # getCurrentUser() for Server Components/route handlers
│   ├── intakes.ts            # Shared intake queries: safe-field lists (Goal 4) + full detail w/ redaction (Goal 5)
│   ├── redact.ts             # SSN/phone/DOB masking for a Reviewer's redacted view (Goal 5)
│   ├── documents.ts          # Content-addressed file storage (server-only, Node fs/crypto)
│   ├── audit.ts              # Shared audit log query — global or filtered to one intake (Goal 7)
│   ├── audit-format.ts       # Client-safe "action + details -> one sentence" formatting (Goal 7)
│   ├── format.ts             # Client-safe display formatting (shortRef, formatFileSize, formatDateTime)
│   └── intake-status.ts      # Shared IntakeStatus type + labels
├── styles/
│   └── shell.module.css      # Shared card/field/button/badge primitives, composed by pages
prisma/
├── schema.prisma             # Database schema
├── seed.ts                   # Seed script
└── migrations/                # Migration history
storage/documents/            # Uploaded files, content-addressed (gitignored — see Goal 3 above)
dev.db                        # SQLite database (repo root)
```

`GET /api/users` was implemented as the starting reference for the Prisma + route handler
pattern. All 7 required goals are now built: auth, the enrollment form, document uploads,
the review queue, the detail view, status updates, and the audit trail.

## Goals

### Required

1. **User Authentication**: Implement an authentication system for patient and reviewer login
2. **Enrollment Application**: Implement the application form for patients to submit their information
3. **Document Uploads**: Allow patients to upload supporting documents (medical records, insurance cards, prescriptions, etc.)
4. **Review Queue**: Display a list of applications for trial coordinators to manage
5. **Detail View**: Show application details with toggle between privileged and redacted views for sensitive fields (phone, DOB, SSN)
6. **Status Updates**: Allow reviewers to change application status
7. **Audit Trail**: Record and display all actions taken on applications for compliance

### Privacy Model: Privileged vs Redacted Views

The system implements a privacy-conscious review process:

- **For Patients**: Always see their own complete, unmasked information
- **For Reviewers**: Can toggle between two views:
  - **Redacted View** (default): Masks PII during initial screening (e.g., SSN shows as `***-**-6789`, phone as `***-***-1234`)
  - **Privileged View**: Shows complete data when reviewer needs full information (e.g., after initial screening passes)

This approach protects patient privacy during the initial eligibility screening while allowing full access when necessary for enrollment processing.

## Bonus Ideas

- Filter/search in the review queue (by status, date range, eligibility criteria)
- Pagination for large datasets
- Document preview/viewer for uploaded files
- Real-time updates when applications change status
- Export audit logs for compliance reporting
- Bulk actions for reviewers (approve/reject multiple applications)
- Email notifications when application status changes

## Available Scripts

- `npm run dev` - Start Next.js development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run the TypeScript compiler with no emit
- `npm run db:migrate` - Run Prisma migrations
- `npm run db:seed` - Seed the database
- `npm run db:reset` - Reset database and re-seed

## Time Allocation

Please limit yourself to **4 hours** on this project. We're interested in how you approach problems and prioritize work within time constraints, not just completion.

**Important:**

- **Track your time**: Note when you start and stop working
- **Commit frequently**: Make regular git commits as you work. This helps us understand your development process
- **Include in your submission**:
  - Total time spent (e.g., "Time spent: 3.5 hours")
  - What you prioritized and why
  - What you would improve with more time
  - Loom recording preferred

We value quality decision-making over feature completion.

## AI Disclaimer

You are welcome to use AI tools (e.g., GitHub Copilot, ChatGPT, Claude) to assist with this challenge. However, you are fully responsible for all code submitted. We will evaluate the quality, architecture, and implementation of your solution regardless of how it was created. Make sure you understand and can explain any code you submit.

## Submission

Once you've completed the challenge, please commit your changes, push them to your own forked GitHub repository, and share the link with us. Alternatively, emailing a zip file of the repository is acceptable — if you zip it, please exclude `node_modules/` and `.next/`.

## FAQs

**Q: Can I modify the Prisma schema?**
A: Yes! Feel free to modify the schema to better suit your approach. Note, once you modify the schema file you'll have to issue a migration via `npx prisma migrate dev` and restart your server.

**Q: Can I add additional libraries?**
A: Yes, but keep in mind the time constraint. The existing setup should be sufficient for the core requirements.

**Q: How should I handle authentication?**
A: For simplicity, you can use a basic approach (e.g., credentials). Full authentication is a bonus.

We wish you the best of luck and look forward to reviewing your solution!
