# Attendance Application

A multi-tenant school attendance and discipline management platform with **QR Code**, **Face Recognition**, real-time **Live Dashboard** updates, and a **Terms & Conditions** framework compliant with Indonesia's **UU Perlindungan Data Pribadi (UU PDP)** and **UU Perlindungan Anak**.

Each school gets its own **branded landing page**, **per-school data isolation**, and **subscription management** — all manageable by a **Super Admin**.

---

## Features

| Feature | Description |
|---------|-------------|
| 🏫 **Multi-Tenant Schools** | Each school has its own branded landing page, theme color, logo, and per-school data isolation |
| 🎯 **QR & Face Scan** | Scan QR Code or Face Recognition for daily attendance via public kiosk (`/scan`) |
| 📡 **Live Dashboard** | Real-time attendance/discipline updates via Socket.io relay — dashboards refresh instantly |
| 📋 **Discipline & Merit** | Record student violations and merit points with severity levels and escalation alerts |
| 📊 **Analytics** | Daily, weekly, monthly, semester, and yearly attendance statistics with charts |
| 🪪 **Student ID Cards** | Generate and download student ID cards in SVG & PDF format |
| 📄 **Document Library** | Upload and share school documents (handbooks, academic calendars, memos) |
| 🔄 **Offline Sync** | Queue attendance scans offline and sync when connection is restored |
| 👥 **9 Roles (RBAC)** | Super Admin, Admin, Principal, VP Student Affairs, Homeroom Teacher, Teacher, Security, Parent, Student |
| 📤 **Export** | Export attendance summaries, violations, and subscription history to Excel/PDF/CSV |
| 🔐 **Terms & Conditions** | Mandatory T&C acceptance on first login; per-user acceptance tracking |
| 🏷️ **Subscription Management** | Yearly subscription per school with auto-renewal tracking and expiry alerts |
| 📱 **Responsive Design** | Dark/light theme, responsive across mobile, tablet, laptop, and desktop |

---

## Tech Stack

| Technology | Details |
|------------|---------|
| **Frontend** | Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS v4, shadcn/ui |
| **Backend** | Next.js API Routes (REST), Prisma ORM |
| **Database** | PostgreSQL |
| **Real-time** | Socket.io (attendance-socket mini-service on port 3003) |
| **Auth** | JWT + HttpOnly Cookies + bcrypt |
| **Face Recognition** | @vladmandic/face-api (TensorFlow.js), 128-dim descriptors |
| **QR Code** | @yudiel/react-qr-scanner + qrcode |
| **Runtime** | Bun (preferred), Node.js 20+ |
| **Export** | SheetJS (xlsx), html2canvas, jsPDF |

---

## Quick Start

### Prerequisites
- **Bun** (recommended) or Node.js 20+
- PostgreSQL 14+

### Install & Run

```bash
# 1. Clone the repository
git clone <repo-url>
cd scan-attendance-and-discipline-app

# 2. Install dependencies
bun install

# 3. Create .env.local
cat > .env.local << 'EOF'
DATABASE_URL=postgresql://user:password@localhost:5432/presensi_nusantara
EOF

# 4. Generate Prisma client & push schema
bun run db:generate
bun run db:push

# 5. Start the dev server (Turbopack)
bun run dev

# 6. (Optional) Start the live-update socket service
# It needs SOCKET_RELAY_TOKEN from .env.local: only that token holder may emit
# events, so browsers stay receive-only.
cd mini-services/attendance-socket && bun install && bun --env-file=../../.env.local index.ts
```

The app is available at **http://localhost:3000**.

#### One-command bring-up

On a machine that has the repository's local tooling, the steps above collapse into
one idempotent command:

```bash
npm run dev:up          # or: bash .zscripts/dev-up.sh
```

It starts PostgreSQL (when `DATABASE_URL` points at a local host), syncs the Prisma
schema, starts the socket service, then the dev server — and finishes by printing the
**pid that is serving on port 3000**. That is deliberately not the pid of the
`npm`/`next` wrapper it spawned: the listener is a grandchild, and reporting a wrapper
pid is how a live preview ends up registered against a process that is not serving
anything. The server states that pid about itself rather than leaving the script to infer
it: at boot it writes `.zscripts/dev-server.json` (pid, port, checkout, when), and
`dev:up` reads that, falling back to probing the OS only when the file is missing or
names another port, another checkout, or a pid that is gone — the case a probe cannot
answer at all, since the kernel names a socket's holder only when it belongs to a user
you may read. Which route answered is printed, and carried in `--json` as
`listenerPidSource`.

**Both services report themselves, through one implementation.** The socket mini-service
publishes the same document about itself when it boots — same fields, same checks, same
fallback — so neither pid `dev:up` reports is inferred from the OS any more. The shared
mechanism lives in `src/lib/service-identity.ts`; the app reaches it from
`src/instrumentation.ts` and writes `.zscripts/dev-server.json`, while the socket writes
`.zscripts/attendance-socket.json`. Which route named the socket's pid is `socketPidSource`
in `--json`, and the summary says it in words.

**The app is also asked live, and the file only corroborates.** A file describes a moment that
has passed: a server killed hard cannot delete its own claim, and if that pid is later recycled
by an unrelated process the claim still passes every check it can make on itself. An answer
cannot be stale that way — whoever answers on a port *is* the process holding it — so the app
serves its identity at `GET /api/dev-identity`, and `dev:up` takes the pid from that answer,
discarding the file's claim when the two disagree (warning, plus `listenerClaim: {pid, agrees}`
in `--json`). The route answers only from a development server and only to a loopback request;
it is in the middleware's public paths because a bring-up probe has no session to log in with.
The socket mini-service has no such route, so its claim is still believed on the file's own
checks — the live confirmation is what the app can do and the socket cannot.

**Reuse is checked, because reuse can silently serve old code.** `dev:up` never kills
anything, so a stack left running from earlier is reported and used — but a service whose
restart-required inputs changed after it started is serving code from before that change, and
calling that "reused" alone would be misleading. What counts is what the process reads *once*:
for the app that is `.env.local` (a module captured what it read at import), `package.json`,
the config files, the Prisma schema and generated client, and `src/instrumentation.ts`, which
Next runs once per server — hot-reloadable `src/**` is deliberately not among them, since an
edit there does reach the running process and warning about it would be noise. The socket
mini-service is the simpler case: it runs from source with no watcher at all, so a file under
its own directory (or the one module it imports from outside it) leaves a running copy behind
its own code. The warning names the file, how long after the start it changed, and the command
that fixes it; the summary repeats it as a `stale:` line beside the preview call it is a
caveat on; `--json` carries `services.<name>.staleness` — where `checked: false` means there
was no boot marker to compare against, which is not the same answer as current — and
`--preview` still prints its call, since the pid and the URL are current even when the code
is not.

The summary's last line is the whole **Preview-tab handoff** —
`register_preview({ url: "http://localhost:3000/", pid: … })` — rendered from that
verified pid, so opening the app in a Preview tab never means rediscovering the
listener.

It is safe to re-run: each service is probed by its TCP port first, so anything
already up is reported and left alone, and nothing is ever killed. `--no-schema` skips
`prisma generate`/`db push`; `--pid` prints only the listener pid and starts nothing;
`--preview` prints only that `register_preview` call and starts nothing — exiting
non-zero with the reason when no pid can be verified for the port, or when the URL does
not answer, instead of handing over a call that would register a dead preview. `--json`
ends the run with a machine-readable summary on stdout (progress goes to stderr), which
is what scripts — and the test below — read, and it carries the same handoff as
`preview: {url, pid, httpCode, ready, register, note}` so a caller can run
`.preview.register` verbatim; `--help` lists the rest.
Logs land in `.zscripts/dev-up.log` and `.zscripts/dev-up-socket.log`, the
listener pid in `.zscripts/dev-up.pid`, and each service's own boot-time claim in
`.zscripts/dev-server.json` and `.zscripts/attendance-socket.json` (none of these is
committed). `DEV_UP_LOG_DIR` moves the logs *and* those files (so a scratch run can
neither truncate a live service's log nor read its claim as its own) and `SOCKET_PORT`
moves the socket service.

Its counterpart stops exactly what that command started, and nothing else:

```bash
npm run dev:down        # or: bash .zscripts/dev-down.sh
```

It acts on the record `dev:up` wrote (`.zscripts/dev-up.state.json`) rather than sweeping
ports or matching command lines, so a service `dev:up` merely *found* running — your own
PostgreSQL, a dev server started by hand, a preview session's server — is reported and
left alone. A service it did start is stopped only while the recorded pid is still the
process the OS shows owning the recorded port; a recycled pid, or a port someone else now
serves, is refused with a warning instead of killed. PostgreSQL (`pg_ctl -m fast`, when the
local cluster's tools are present), the socket service and the dev server go down in that
dependency order, the pid file is removed only when the listener it describes is gone, and
each service's own boot-time claim goes with the process it describes — a killed service
cannot clean up after itself, and a stale claim naming a since-recycled pid is the one way
that file can be wrong. The run is safe to repeat. `--json` prints the same machine-readable shape as `dev:up`
(`services.<name>.action` ∈ `stopped|left-alone|already-down|failed`, plus `stopped`,
`stillListening` — every recorded port still served, including services deliberately left
alone — and `leaked`, the subset it owns and could not stop), and the exit status is
non-zero only when something it owns is *still* serving its port.

That idempotency is not taken on trust: `src/lib/dev-up.test.ts` runs the script twice,
checks the pid it reports against the operating system's own list of listeners on port
3000, and kills a service to watch it come back — `npm run test:dev-up` (opt-in, since
it spawns and kills real processes). The handoff is held to the same standard: the pid
in the printed call must be the pid the OS names for the port, said identically by the
summary, `--preview` and the JSON, and the three ways to have nothing to hand over —
no listener, a listener that never answers HTTP, and a clean stack — are each exercised
on a scratch port.
The same file covers `dev:down`: that it stops what `dev:up` started on a scratch port
while the live stack is untouched, that it is safe to re-run, that it never kills a pid
the record does not account for, and that it stops nothing at all when there is no record.
It also covers staleness, in both directions and for both reasons: on a scratch checkout
whose services and boot markers the test controls, the app is reported stale for a changed
`.env.local` and current again once its marker moves, an absent marker is reported as
"not checked" rather than as current, and the watcher-less socket service is reported stale
for a change to its own source.

Where a platform cannot name the pid holding a port, the suite skips the assertions that
need one and says so — in CI as a `::notice::` annotation, so a step that passed by not
checking cannot look like one that passed by checking. CI also fails the step outright if
the suite never ran.

### Initial Setup

1. Open `http://localhost:3000` — you'll see the **school directory**
2. Click a school card to enter its branded login page
3. Click **"Setup Database"** (or `POST /api/setup?force=true`) to seed demo data
4. Log in with any demo account

---

## Demo Accounts

| Role | Username | Password | Description |
|------|----------|----------|-------------|
| 🛡️ **Super Admin** | `superadmin` | `superadmin123` | Multi-school management, RBAC, subscriptions |
| 🔧 **Admin** | `admin` | `admin123` | School-level administrator |
| 📊 **Principal** | `kepsek` | `kepsek123` | School principal (Head of School) |
| 📋 **VP Student Affairs** | `vpkes` | `vpkes123` | Vice Principal for Student Affairs |
| 👨‍🏫 **Homeroom Teacher** | `wali7a` | `wali123` | Class homeroom teacher |
| 👩‍🏫 **Teacher** | `guru1` | `guru123` | Subject teacher |
| 🚪 **Security / Teacher on Duty** | `jaga1` | `jaga123` | School security / teacher on duty |
| 👨‍👩‍👧 **Parent** | `ortu1` | `ortu123` | Student's parent/guardian |
| 🧑‍🎓 **Student** | `siswa1` | `siswa123` | Student account |

> **Note:** The seeder creates 3 demo schools (SHB-001, SMPN-01, SMA-INS) with different branding and subscription statuses. All demo users belong to SHB-001 by default.

---

## Roles & Access Control (RBAC)

### Single source of truth

Every role rule lives in **`src/lib/rbac-policy.ts`**, and everything else derives
from it:

| Consumer | How it reads the policy |
|----------|------------------------|
| API route guards | `canAccessApi(role, 'GET /api/students')` — one call, no role array in the route |
| Sidebar, bottom nav, role switcher | `canAccessPage(role, page)` over `MENU` |
| Page rendering (`main-app.tsx`) | the same `canAccessPage` gate, so a page the menu hides cannot render |
| README menu matrix (below) | generated by `bun run rbac:docs` |
| RBAC sweep (`src/lib/rbac-routes.test.ts`) | probes by policy key; expectations come from `canAccessApi`, and the write probes are built from live fixtures so a permitted role has to really create the row (2xx) and clean it up |

The policy holds three tables: `ROLES`/`ROLE_LABELS`, `MENU` (which page, in which
order, for which roles) and `API_ROLES` (one entry per guarded method+route, keyed
`'GET /api/students'`). Two rules keep them small: a **`SUPER_ADMIN` passes every
gate**, so it is never listed in a role array (use `hasRole` for the rare check
that must exclude it), and tenant isolation is a separate concern
(`src/lib/school-scope.ts`), never expressed as a role list.

`src/lib/rbac-policy.test.ts` fails the suite when a copy drifts: it checks the
tables are coherent, that `nav-config.tsx` presents exactly `MENU`, that every page
`main-app.tsx` renders has a policy entry, that no route file hand-writes a role
decision (`requireRole` or `…includes(auth.role)`), and that the README matrix
still matches the renderer. Adding an endpoint or a page means editing the policy
— there is nowhere else to put it.

### Menu Access Matrix

<!-- RBAC-MATRIX:START -->
| Menu | Super Admin | Admin | Principal | VP Kes | Homeroom | Teacher | Security | Parent | Student |
|------|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|:-----------:|
| Super Admin | ✅ | — | — | — | — | — | — | — | — |
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Live Attendance Monitor | ✅ | ✅ | — | — | — | — | ✅ | — | — |
| Attendance Input | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ | — | — |
| Attendance Summary | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — |
| Leave Requests | ✅ | ✅ | — | ✅ | ✅ | — | — | ✅ | — |
| Discipline Incidents | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| Merit Points | ✅ | ✅ | — | ✅ | ✅ | ✅ | — | — | — |
| Discipline Trends | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — |
| Analytics | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Behavior Scan | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| Reports & Export | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | — | — |
| Student ID Cards | ✅ | ✅ | — | ✅ | ✅ | — | — | — | ✅ |
| Teacher Duty Roster | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| Settings | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Face Registration | ✅ | ✅ | — | — | — | — | — | — | — |
| Activity Log | ✅ | ✅ | ✅ | — | — | — | — | — | — |
| Data Rights | ✅ | ✅ | ✅ | — | — | — | — | — | — |
| Data Security | ✅ | ✅ | ✅ | — | — | — | — | — | — |
| Document Library | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| User Guide | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Terms & Conditions | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
<!-- RBAC-MATRIX:END -->

> Generated by `bun run rbac:docs` from `src/lib/rbac-policy.ts` — the menu
> (`MENU`) *is* this table, and `src/lib/rbac-policy.test.ts` fails if the two
> drift. The Super Admin column is ✅ throughout because a Super Admin passes
> every role gate (preview mode narrows the data it sees, never its access).

### CRUD Permissions

| Entity | Read | Create | Update | Delete |
|--------|------|--------|--------|--------|
| **Students** | All staff | Admin, VP, Homeroom | Admin, VP, Homeroom | Admin only |
| **Classes** | All staff | Admin only | Admin only | Admin only |
| **Users** | All staff | Admin only | Admin (others) / Self (profile) | Admin only |
| **Attendance** | School-scoped | Staff (scan/input) | Admin, VP, Homeroom | — |
| **Violations** | School-scoped | Staff | Admin, VP | Admin, VP |
| **Merit Points** | School-scoped | Staff | Admin, VP | Admin, VP |
| **Permissions** | School-scoped | Admin, Homeroom, Parent, Student | Admin, Homeroom, VP | Admin only |
| **Categories** | School-scoped | Admin, VP | Admin, VP | Admin, VP |
| **Schools** | Public (directory) | Super Admin | Super Admin | Super Admin |
| **Subscriptions** | Super Admin + own school | Super Admin | Super Admin | — |
| **Audit Logs** | School-scoped (Admin, Principal) | System + breach reports | — | — |

### Data Isolation

- **Super Admin** can see data from all schools; a **school preview mode** lets them view the app as any school's user
- **A super admin passes every role guard.** `canAccessApi` / `canAccessPage` (`src/lib/rbac-policy.ts`) return true for `SUPER_ADMIN` before consulting the endpoint's or page's list, so the platform account can reach every school-scoped API and every page; preview mode narrows the *data* it sees, never its access. The bypass is applied in one place and `SUPER_ADMIN` is therefore never listed in a role array — a `403` for Super Admin is not an expressible expectation, and the RBAC sweep (`src/lib/rbac-routes.test.ts`) reads the same table the guards do instead of keeping its own copy of the lists
- **Reports & Export is not a teacher's endpoint.** `/api/export` and `/api/export-pdf` are school-wide (the `classId` filter defaults to all), which is broader than a teacher's assigned-class scope, so `EXPORT_ROLES` in the policy is Admin, Principal, VP, Homeroom and Security — one definition that the API guard, the menu item and the matrix above all read
- **All other roles** are strictly scoped to their own school via `getSchoolScope` — cross-school queries return empty
- **Students, Classes, Attendance, Violations, Good Deeds, Permissions, Alerts, Audit Logs** are all school-scoped
- **User accounts** are school-scoped for **reads and writes**, on both list endpoints (`GET /api/users` and `GET /api/auth`, the one Settings → Users renders): a school-bound actor only ever sees accounts of their own school, a super admin previewing a school sees exactly that school, and an actor with no school binding sees nobody. Writes are scoped the same way — an admin can only reset the password, re-role, move or deactivate accounts of their **own** school. A target in another school reads as not found, so the endpoint cannot be used to probe other tenants, and platform (`SUPER_ADMIN`) accounts are never manageable from inside a school
- Users **cannot escalate privileges** via self-update (role/schoolId/isActive changes require Admin)
- **A school always keeps one administrator.** Removing a school's last active `ADMIN` is refused (`409`) on every path that can do it — `PUT`/`DELETE /api/users` *and* the platform user actions of `POST /api/super-admin` (`toggle`, `delete`, `update`), since taking the role away, unsetting the school or deleting the account all leave the school unmanageable. The sanctioned platform paths stay open: disable or delete the whole school, or appoint a replacement admin first. Deactivating **your own** account is refused outright (`403`) on both `PUT` and `DELETE`, so nobody can lock themselves out
- **School assignment moves only when it is asked for.** The platform panel's user `update` (`POST /api/super-admin`) writes `schoolId` only when the request names a school; omitting the field — or sending `null` — leaves the account where it is, so an edit can no longer silently unbind an account (an unbound account can neither manage nor see anything)
- **An omitted field never means "erase it".** Every update endpoint writes only the fields the request carries, so a partial payload cannot destroy data it never mentioned. `POST /api/super-admin` (subscriptions) is the one that bites hardest: applying its create-time defaults to an existing row let an edit that only changed the price reset `status` to `ACTIVE` — re-opening a suspended school whose logins are blocked — and wipe the operator's note. `PUT /api/data-rights` no longer erases `adminNotes` when it processes a request a second time (`APPROVED` → `COMPLETED`), `PUT /api/users` treats a blank `password` as "unchanged" instead of storing `''` (which no input can hash to, bricking the account), and `POST /api/account` (`action: 'reminder'`) no longer resets a stored `CHECK_OUT`/`SHS` preference when only the switch is flipped. Sending `''`/`null` still clears a field where clearing is meaningful
- **Creates are pinned to the same tenant as writes.** `POST /api/users` accepts no school other than the one the actor is acting for: a bound actor always creates inside their own school, a super admin must leave preview mode to pick a tenant, and an actor with no school binding is refused. A platform super admin must *name* the school — an omitted `schoolId` is a `400`, not an unbound account that can neither see nor manage anything (unbound is for `SUPER_ADMIN` accounts only, and those cannot be created here). Student creation (`POST /api/students`) and the XLSX importer apply the same rule — the class, the student row and the auto-created login all land in that one school, and an import row naming another school's code is rejected

---

## Landing Pages & School Branding

### School Directory (`/`)
The root path shows a **searchable, filterable directory** of all schools:
- Cards show each school's logo, accent color, name, code, address, and subscription status
- Filter by jenjang (JHS/SHS) and search by name/code/address
- Schools are sorted: **Active** first, then **Trial**, then **Locked/Inactive**
- Inactive/expired schools show a warning and their login is blocked

### Per-School Landing (`/s/:code`)
Each school has its own branded landing page:
- Displays: logo, name, description, vision, mission, contact info, jenjang schedule
- Browser tab title and favicon follow the school's branding
- Login form with Terms & Conditions acceptance checkbox
- **School-specific theme color** applied to all UI elements

### Domain Routing
Schools can have custom domains (e.g. `shb-001.app.test`). The app resolves schools by hostname via `src/lib/school-host.ts`.

---

## Real-Time Updates (Socket.io)

The app relays events through an **attendance-socket mini-service** (port 3003):

| Event | Trigger |
|-------|---------|
| `attendance:checkin` / `attendance:checkout` | Kiosk or staff scan |
| `violation:new` | Violation recorded |
| `good-deed:new` | Merit point added |
| `permission:update` | Leave request approved/rejected |
| `alert:new` | Behavior alert escalated |
| `data:reset` | Database reseeded via `/api/setup` |
| `subscription:alert` | School subscription expiring within 30 days |

The Next.js server relays these events to the Socket.io service, which broadcasts them to all connected browsers. Dashboards, monitors, and notification toasts update in real time without page reload.

---

## API Endpoints

All endpoints are JWT-protected (except `/api/auth` POST login, `/api/setup`, and `/api/schools/public`).

### Auth
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth` | Login (accepts `acceptedTerms` for T&C) |
| `GET` | `/api/auth` | List the acting school's user accounts (feeds Settings → Users) |
| `DELETE` | `/api/auth` | Logout |

### School Directory
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/schools/public` | Public school directory (all schools or by code) |
| `GET` | `/api/school-profile` | Get own school's profile (authenticated) |
| `PUT` | `/api/school-profile` | Update own school's profile (Admin, Principal) |

### Multi-Tenant Management (Super Admin)
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/super-admin?resource=schools` | List all schools with subscriptions |
| `GET` | `/api/super-admin?resource=users` | List all users across schools |
| `GET` | `/api/super-admin?resource=subscriptions` | Subscription alerts + renewal summary |
| `POST` | `/api/super-admin` | CRUD schools, activate/deactivate/renew subscriptions, manage RBAC (user actions share the lockout guard) |
| `GET` | `/api/subscription-history?schoolId=` | Subscription audit history per school |

### Students & Classes
| Method | Path | Description |
|--------|------|-------------|
| `GET/POST/PUT/DELETE` | `/api/students` | CRUD students (school-scoped; a new student must be filed into a class of the actor's own school) |
| `GET/POST/PUT/DELETE` | `/api/classes` | CRUD classes (Admin only) |
| `GET/POST` | `/api/academic-years` | Academic years (Admin only) |

### Users
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/users` | List users (school-scoped; a super admin previewing a school sees only that school) |
| `POST` | `/api/users` | Create user (Admin only; pinned to the actor's school — a super admin previewing a school cannot place an account elsewhere, and an unbound actor cannot create one) |
| `PUT` | `/api/users` | Update user (Admin within their own school, or self; self-update limited to safe fields; cannot demote a school's last admin) |
| `DELETE` | `/api/users` | Deactivate user (Admin within their own school; never yourself, never a school's last admin) |

### Attendance
| Method | Path | Description |
|--------|------|-------------|
| `GET/POST/PUT` | `/api/attendance` | Attendance records (school-scoped) |
| `POST` | `/api/attendance/checkin` | Public check-in |
| `POST` | `/api/public-scan` | Kiosk scan (QR/Face, shift-gated) |

### Discipline
| Method | Path | Description |
|--------|------|-------------|
| `GET/POST/DELETE` | `/api/violations` | Violations (school-scoped) |
| `GET/POST/DELETE` | `/api/good-deeds` | Merit points (school-scoped) |
| `GET/POST/PUT/DELETE` | `/api/categories` | Violation/merit categories |
| `GET/POST/PUT/DELETE` | `/api/permissions` | Leave requests |
| `GET` | `/api/alerts` | Behavior escalation alerts |

### Face Recognition
| Method | Path | Description |
|--------|------|-------------|
| `GET/POST/DELETE` | `/api/face-references` | Face descriptors (school-scoped) |
| `POST` | `/api/face-verify` | Verify face against references (school-scoped) |
| `GET/POST` | `/api/face-accuracy` | Face recognition accuracy testing |

### Reports & Export
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/statistics` | Multi-period attendance statistics |
| `GET` | `/api/export` | Export Excel (Admin, Principal, VP, Homeroom, Security — school-scoped, optional `classId`) |
| `GET` | `/api/export-pdf` | Export PDF (same roles as `/api/export`) |

### Other
| Method | Path | Description |
|--------|------|-------------|
| `GET/POST` | `/api/scan-session` | Kiosk scan session management |
| `GET/POST` | `/api/scan-discipline` | Discipline scan session |
| `GET/POST/PUT/DELETE` | `/api/school-documents` | School document library |
| `GET/POST/PUT/DELETE` | `/api/duty-schedule` | Teacher duty roster |
| `GET/POST/PUT/DELETE` | `/api/geofence` | Geofence settings |
| `POST` | `/api/import` | Import students/classes via XLSX |
| `GET` | `/api/import-template` | Download XLSX import template |
| `GET/POST` | `/api/audit-logs` | Activity audit log (school-scoped) |
| `POST` | `/api/setup` | Seed/reset database |
| `GET` | `/api/school-config` | School configuration |

---

## Public Pages

| Page | URL | Description |
|------|-----|-------------|
| **School Directory** | `/` | Searchable school picker with branding cards |
| **School Landing** | `/s/:code` | Per-school branded login page (e.g. `/s/SHB-001`) |
| **Kiosk Scan** | `/scan` | Public attendance kiosk (QR/Face, shift-gated) |
| **Behavior Scan** | `/scan-discipline` | Discipline scan (login required) |

---

## Continuous Integration

Two GitHub Actions jobs (`.github/workflows/ci.yml`) gate every push to `main`
and every pull request:

| Job (required status check) | What it proves |
|-----------------------------|----------------|
| **Typecheck & unit suites** | `tsc --noEmit` produces no *new* errors (the 18 pre-existing ones are an explicit baseline) and the 11 suites that need neither a database nor a server pass |
| **Full suite (seeded PostgreSQL)** | A `postgres:16` container is started, the stack is brought up by **`npm run dev:up` — the same command this README gives a developer** (`DEV_UP_APP_TIMEOUT=300` gives a cold runner the ceiling a bespoke poll used to provide), `POST /api/setup?force=true` seeds it, one login per role is verified, then every `bun test` file runs against that database — the opt-in bring-up suite opts itself out of that step and has its own below, where it re-runs the same script against the same stack |

A red run only *blocks* a merge once both job names are listed in **Settings →
Branches → branch protection rule for `main` → Require status checks to pass
before merging** — without that setting the workflow is a warning, not a gate.

CI does not bring the stack up with steps of its own: the schema sync, the socket
service (including its own dependency install) and the dev server all come from
`npm run dev:up` → `.zscripts/dev-up.sh`. A change to how the app starts therefore cannot apply locally
and be forgotten in CI, and the job's failure artifacts are that script's own logs
(`.zscripts/dev-up.log`, `.zscripts/dev-up-socket.log`) rather than files CI opens
for itself.

The database is a throwaway container, so a failure means the code is wrong
rather than the fixture: the write probes create and delete their own rows, and
`rbac-routes.test.ts` re-checks the seeded baseline in `afterAll`.

The one suite that *publishes* product state is `terms-lifecycle.test.ts`, since
activating a T&C version is the only way to test the login blocking it causes. It
snapshots the terms table and the accounts it drives and restores both — in its last
case and again in `afterAll` if a run ended early — so a local run no longer leaves a
new version active, which used to reset every user to "pending" on the dashboard, and
which is why the local database had accumulated 53 suite-minted versions by 2026-09-18.
Seeding fresh in CI hides that, so the restore is asserted rather than assumed: the
suite's last case fails if the table or either account differs from the snapshot.

Optional repository secrets, both with CI-only fallbacks so neither is required:
`CI_JWT_SECRET`, `CI_SOCKET_RELAY_TOKEN`.

Naming the process that owns a port is not one question with one answer: `dev-up`
tries `lsof`, then `ss`, then reads `/proc` directly (nothing to install). A
listener held by *another user* — CI's Postgres arrives from a service container,
published by root's `docker-proxy` — is unnameable by any of them without root, so
that case is reported as served with an unreadable owner instead of being guessed
at. `.github/workflows/probe-lab.yml` (dispatch-only) prints all three routes for
both kinds of listener on a real runner, which is how that table in `.freebuff/run.md`
was measured rather than assumed.

To run the same suite locally, bring the stack up the way CI does — `npm run dev:up`
— seed once (`curl -X POST 'http://localhost:3000/api/setup?force=true'`), then run
every file; the unit suites alone need neither a database nor a server:

```bash
bun test              # all 17 files (dev-up.test.ts self-disables without DEV_UP_TEST=1),
                      # needs the dev server + a seeded DB
npm run test:dev-up   # + the bring-up script's own idempotency checks
```

Two deliberate omissions, both explained in the workflow comments: the schema is
built with `prisma db push` because the migration history stopped at 2026-06-03
while `schema.prisma` kept moving, and the typecheck step is a ratchet instead of
a hard gate while that backlog stands.

---

## Project Structure

```
src/
├── app/
│   ├── api/                    # REST API routes (see API section)
│   ├── scan/                   # Public attendance kiosk page
│   ├── scan-discipline/        # Discipline scan page
│   ├── s/[code]/               # Per-school landing page
│   └── page.tsx                # Root page (school directory / login)
├── components/
│   ├── ui/                     # shadcn/ui components
│   ├── dashboard/              # Feature components
│   │   ├── main-app.tsx        # App shell (sidebar, header, content)
│   │   ├── login-screen.tsx    # School directory + login
│   │   ├── nav-config.tsx      # RBAC-aware navigation
│   │   ├── super-admin-page.tsx # Super Admin (schools, RBAC, subscriptions)
│   │   ├── settings-page.tsx   # Settings (admin tabs: school config, users)
│   │   ├── school-profile-settings.tsx # School profile editor
│   │   ├── subscription-history-list.tsx # Shared subscription history component
│   │   ├── school-landing-profile.tsx # Landing page profile card
│   │   └── ...                 # Other feature pages
│   └── theme-toggle.tsx        # Dark/light mode toggle
├── lib/
│   ├── auth-utils.ts           # JWT, bcrypt (identity only — RBAC lives in rbac-policy.ts)
│   ├── rbac-policy.ts          # THE RBAC policy: roles, menu, per-endpoint access
│   ├── db.ts                   # Prisma client singleton
│   ├── school-scope.ts         # Per-school data isolation
│   ├── school-host.ts          # Hostname-based school resolution
│   ├── scan-gating.ts          # Shift-based scan rules (PAGI/SORE)
│   ├── audit.ts                # Audit logging utilities
│   ├── socket-server.ts        # Socket.io relay to mini-service
│   ├── api-fetch.ts            # Authenticated fetch wrapper
│   ├── export-utils.ts         # XLSX/CSV export helpers
│   └── stores/                 # Zustand state stores
│       ├── auth-store.ts       # Auth + school branding
│       ├── app-store.ts        # Active page, class filter
│       └── preview-store.ts    # Super Admin school preview
├── generated/prisma/           # Generated Prisma client
└── middleware.ts               # Route protection, hostname routing

mini-services/
└── attendance-socket/          # Socket.io server for live updates
    ├── index.ts                # Socket.io event relay
    └── package.json

prisma/
└── schema.prisma               # Database schema
```

---

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `JWT_SECRET` | No | `fallback-dev-secret` | JWT signing secret |
| `NEXT_PUBLIC_SOCKET_URL` | No | `http://localhost:3003` | Socket.io client URL |
| `SOCKET_SERVER_URL` | No | `http://localhost:3003` | Server-side socket relay URL |
| `SOCKET_RELAY_TOKEN` | ✅ when a socket service is used | — | Shared secret proving a socket connection is the trusted server relay. Only token holders may emit events; without it the mini-service runs listen-only and dashboards stop live-updating |
| `SOCKET_ALLOWED_ORIGINS` | No | `NEXT_PUBLIC_APP_URL` + `http://localhost:3000` | Comma-separated browser origins allowed to open a socket |
| `SCHOOL_DOMAINS` | No | — | Hostname→code mapping (e.g. `shb-001.app.test=SHB-001`) |

### School Profile Fields
Each school can be customized via Super Admin or Admin settings:
- **Basic:** name, code, address, phone, email
- **Branding:** logo, header image, theme color
- **Content:** description, vision, mission
- **Schedule:** hasJhs/hasShs, per-level start/end times
- **Domain:** custom subdomain for hostname routing

---

## Terms & Conditions

The application complies with:
- **UU Perlindungan Data Pribadi (UU PDP)** — data processing transparency, user consent, breach notification
- **UU Perlindungan Anak** — child data protection provisions

Features:
- Mandatory T&C acceptance checkbox on first login (tracked per user)
- T&C page accessible from Settings → Terms & Conditions
- **A published version is numbered above every version any account has already
  accepted**, not merely above the highest row in the table (`POST /api/terms-content`).
  Acceptance keeps the number it was made under, and that comparison is the only thing
  that decides who must read the new text — so numbering from the table alone would let
  a deleted version's number be reused for different text, which every account that
  accepted the old one would then be treated as having agreed to
- Data breach incident reporting via Activity Log → BREACH_REPORTED
- Per-school data isolation prevents cross-school data access
- Role-based access control with audit logging

---

## License

Copyright © 2024–2026. All rights reserved. For school use.
