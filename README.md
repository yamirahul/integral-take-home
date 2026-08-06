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
│   │   └── intake.module.css
│   ├── documents/
│   │   ├── page.tsx          # Server Component: auth + initial data for /documents
│   │   ├── DocumentsView.tsx # Upload form + per-patient document library (Goal 3)
│   │   └── documents.module.css
│   ├── queue/
│   │   └── page.tsx          # Reviewer queue page (stub)
│   └── api/
│       ├── auth/
│       │   ├── login/route.ts    # POST — verify credentials, set session cookie
│       │   ├── logout/route.ts   # POST — clear session cookie
│       │   └── me/route.ts       # GET — current user
│       ├── intakes/
│       │   ├── route.ts          # GET (role-scoped list) / POST (create) intakes
│       │   └── [id]/
│       │       └── route.ts      # GET/PATCH single intake (stub — Goals 5/6)
│       ├── documents/
│       │   ├── route.ts          # GET (library) / POST (upload) documents
│       │   ├── attach/route.ts   # POST — reuse an existing document on another intake
│       │   └── [id]/
│       │       ├── route.ts      # DELETE — remove one attachment
│       │       └── file/route.ts # GET — stream file bytes (auth-gated)
│       └── users/
│           └── route.ts          # GET users (reference example)
├── components/
│   ├── AppHeader.tsx         # Shared patient-page header + nav (New Intake / Documents)
│   ├── LogoutButton.tsx
│   ├── AuditLog.tsx          # Audit trail display (stub — Goal 7)
│   └── IntakeDetail.tsx      # Privileged/redacted detail view (stub — Goal 5)
├── lib/
│   ├── prisma.ts             # Prisma client singleton
│   ├── auth.ts               # Password hashing (scrypt)
│   ├── session.ts            # Signed session cookie (Web Crypto — Edge + Node safe)
│   ├── current-user.ts       # getCurrentUser() for Server Components/route handlers
│   ├── intakes.ts            # Shared role-scoped intake query
│   ├── documents.ts          # Content-addressed file storage (server-only, Node fs/crypto)
│   ├── format.ts             # Client-safe display formatting (shortRef, formatFileSize)
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
pattern. Auth (Goal 1), the enrollment form (Goal 2), and document uploads (Goal 3) are now
built; queue/detail-view/status-updates/audit-trail (Goals 4-7) are still stubs.

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
