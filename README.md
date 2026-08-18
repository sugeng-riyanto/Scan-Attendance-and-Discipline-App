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
cd mini-services/attendance-socket && bun install && bun index.ts
```

The app is available at **http://localhost:3000**.

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

### Menu Access Matrix

| Menu | Super Admin | Admin | Principal | VP Kes | Homeroom | Teacher | Security | Parent | Student |
|------|:-----------:|:-----:|:---------:|:------:|:--------:|:-------:|:--------:|:------:|:-------:|
| **Super Admin** | ✅ | — | — | — | — | — | — | — | — |
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Live Attendance Monitor | ✅ | ✅ | — | — | — | — | ✅ | — | — |
| Attendance Input | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ | — | — |
| Attendance Summary | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — | — |
| Leave Requests | ✅ | ✅ | — | ✅ | ✅ | — | — | ✅ | — |
| Discipline Incidents | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| Merit Points | ✅ | ✅ | — | ✅ | ✅ | ✅ | — | — | — |
| Discipline Trends | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — | — |
| Analytics | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Behavior Scan | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| Reports & Export | ✅ | ✅ | ✅ | ✅ | — | — | ✅ | — | — |
| Student ID Cards | ✅ | ✅ | — | ✅ | ✅ | — | — | — | ✅ |
| Teacher Duty Roster | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| Settings | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Face Registration | ✅ | ✅ | — | — | — | — | — | — | — |
| Activity Log | ✅ | ✅ | ✅ | — | — | — | — | — | — |
| Data Security | ✅ | ✅ | ✅ | — | — | — | — | — | — |
| Document Library | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| User Guide | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Terms & Conditions | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

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
- **All other roles** are strictly scoped to their own school via `getSchoolScope` — cross-school queries return empty
- **Students, Classes, Attendance, Violations, Good Deeds, Permissions, Alerts, Audit Logs** are all school-scoped
- Users **cannot escalate privileges** via self-update (role/schoolId/isActive changes require Admin)

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
| `GET` | `/api/auth` | Get current user session |
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
| `POST` | `/api/super-admin` | CRUD schools, activate/deactivate/renew subscriptions, manage RBAC |
| `GET` | `/api/subscription-history?schoolId=` | Subscription audit history per school |

### Students & Classes
| Method | Path | Description |
|--------|------|-------------|
| `GET/POST/PUT/DELETE` | `/api/students` | CRUD students (school-scoped) |
| `GET/POST/PUT/DELETE` | `/api/classes` | CRUD classes (Admin only) |
| `GET/POST` | `/api/academic-years` | Academic years (Admin only) |

### Users
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/users` | List users (school-scoped) |
| `POST` | `/api/users` | Create user (Admin only) |
| `PUT` | `/api/users` | Update user (Admin or self; self-update limited to safe fields) |
| `DELETE` | `/api/users` | Deactivate user (Admin only) |

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
| `GET` | `/api/export` | Export Excel |
| `GET` | `/api/export-pdf` | Export PDF |

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
│   ├── auth-utils.ts           # JWT, bcrypt, RBAC (requireRole, rolePermissions)
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
- Data breach incident reporting via Activity Log → BREACH_REPORTED
- Per-school data isolation prevents cross-school data access
- Role-based access control with audit logging

---

## License

Copyright © 2024–2026. All rights reserved. For school use.
