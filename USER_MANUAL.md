# Attendance Application — User Manual

## Table of Contents
1. [Getting Started](#getting-started)
2. [Super Admin](#super-admin)
3. [Admin](#admin)
4. [Principal (Kepala Sekolah)](#principal)
5. [VP Student Affairs (VP Kesiswaan)](#vp-student-affairs)
6. [Homeroom Teacher (Wali Kelas)](#homeroom-teacher)
7. [Teacher (Guru)](#teacher)
8. [Security / Teacher on Duty (Guru Jaga)](#security--teacher-on-duty)
9. [Parent (Orang Tua)](#parent)
10. [Student (Siswa)](#student)
11. [Kiosk Scan Operations](#kiosk-scan-operations)
12. [Troubleshooting](#troubleshooting)

---

## Getting Started

### First-Time Setup
1. Open `http://localhost:3000` — the **school directory** appears
2. Select your school from the directory (or access via `/s/<CODE>`)
3. Click **"Setup Database (Data Demo)"** to seed demo data
4. Log in with a demo account (see table below)

### Terms & Conditions
On your **first login**, you must accept the Terms & Conditions checkbox before proceeding. This is a one-time requirement tracked per user — the application complies with Indonesia's **UU Perlindungan Data Pribadi (UU PDP)** and **UU Perlindungan Anak**.

### Demo Accounts

| Role | Username | Password |
|------|----------|----------|
| 🛡️ Super Admin | `superadmin` | `superadmin123` |
| 🔧 Admin | `admin` | `admin123` |
| 📊 Principal | `kepsek` | `kepsek123` |
| 📋 VP Student Affairs | `vpkes` | `vpkes123` |
| 👨‍🏫 Homeroom Teacher | `wali7a` | `wali123` |
| 👩‍🏫 Teacher | `guru1` | `guru123` |
| 🚪 Security | `jaga1` | `jaga123` |
| 👨‍👩‍👧 Parent | `ortu1` | `ortu123` |
| 🧑‍🎓 Student | `siswa1` | `siswa123` |

---

## Super Admin

The Super Admin manages **all schools** in the system. Available at the **Super Admin** menu item.

### Schools Tab
- View, create, edit, and delete schools
- Each school row shows: code, name, subscription status, expiry date, user/class count
- **Quick renew** button extends a school's subscription by 1 year directly from the table
- **Copy as template** when creating a new school — clones classes from an existing school
- **Live landing page preview** in the edit dialog — see changes as you edit

### Users & RBAC Tab
- View users across all schools (filterable by school)
- Import students and teachers via XLSX templates
- **RBAC Management** — configure role-based access per school
- Download RBAC and student import templates

### Subscriptions Tab (Langganan Tahunan)
- View all school subscriptions with status badges
- **Activate/Deactivate/Renew** subscriptions with one click
- **Renewal summary** card shows how many renewals happened this year + the most recent one
- **Calendar year picker** to view renewal history by year
- **Export** subscription history to CSV or XLSX

### Subscription Alerts
- Schools expiring within 30 days show amber warnings
- Locked schools (expired/inactive) show red alerts
- Automatic socket notifications push alerts to the dashboard

---

## Admin

The school administrator manages all data within their school.

### Dashboard
- Overview cards: attendance rate, total students, violations, merit points
- Recent attendance activity feed (real-time updates via socket)
- Subscription status card with expiry countdown

### Student & Class Management
- **Students:** CRUD operations, import via XLSX template, search and filter
- **Classes:** Create, edit, delete classes with academic year assignment

### User Management
- Create, edit, deactivate staff accounts
- Assign roles (Admin, Principal, VP, Homeroom Teacher, Teacher, Security)
- **Change Password** and **Change Email** for PIN quick-login setup

### School Settings
- **School Config:** School name, address, theme color, attendance hours
- **School Profile:** Edit landing page content (description, vision, mission, contact)
- **Subscription:** View subscription status and renewal history
- **Users:** Manage staff accounts with RBAC

### Activity Log
- View all audit events for the school
- Filter by level (JHS/SHS), category, severity, date range, username
- **Breach reporting** — report data incidents directly from the log

### Data Security
- View compliance information and data handling policies
- Access data breach exit solutions

---

## Principal

The school principal (Kepala Sekolah) has oversight access.

### Dashboard
- Full attendance statistics and student count
- Discipline alert notifications

### Available Pages
- **Dashboard:** Overview with real-time updates
- **Attendance Summary:** View and export attendance records
- **Discipline Incidents:** Review violations across all classes
- **Discipline Trends:** Analyze patterns over time
- **Analytics:** Multi-period attendance statistics
- **Reports & Export:** Export to Excel/PDF
- **Teacher Duty Roster:** View and manage duty schedules
- **Activity Log:** Monitor user activity for compliance
- **Data Security:** View data protection information
- **Settings:** School profile, subscription history

---

## VP Student Affairs

Manages discipline, merit, and student welfare.

### Available Pages
- **Attendance Input:** Manual attendance entry for students
- **Leave Requests:** Approve/reject parent leave requests
- **Discipline Incidents:** Record and manage violations
- **Merit Points:** Record student merit achievements
- **Discipline Trends:** Track behavior patterns
- **Behavior Scan:** Quick discipline recording via scan
- **Student ID Cards:** Generate and print ID cards
- **Teacher Duty Roster:** Manage duty assignments
- **Analytics:** View attendance statistics

---

## Homeroom Teacher

Manages their assigned class(es).

### Available Pages
- **Attendance Input:** Record attendance for your class
- **Attendance Summary:** View your class's attendance records
- **Leave Requests:** Review leave requests from your students' parents
- **Discipline Incidents:** Record violations for your class
- **Merit Points:** Record merit points for your class
- **Discipline Trends:** View your class's behavior patterns
- **Student ID Cards:** Generate ID cards for your class
- **Teacher Duty Roster:** View and manage duties

---

## Teacher

Records attendance and discipline for assigned classes.

### Available Pages
- **Attendance Input:** Record daily attendance via QR scan or manual entry
- **Discipline Incidents:** Record student violations
- **Merit Points:** Record student merit achievements
- **Analytics:** View attendance statistics
- **Teacher Duty Roster:** View your duty schedule

---

## Security / Teacher on Duty

Monitors attendance and handles discipline at the gate.

### Available Pages
- **Live Attendance Monitor:** Real-time display of student check-ins/check-outs
- **Attendance Input:** Manual attendance correction
- **Discipline Incidents:** Record violations observed at the gate
- **Behavior Scan:** Quick discipline recording via student scan
- **Analytics:** View attendance statistics
- **Reports & Export:** Export daily attendance reports

---

## Parent

Monitors their child's school activity.

### Available Pages
- **Dashboard:** View your child's attendance summary
- **Leave Requests:** Submit leave requests for your child
- **Analytics:** View your child's attendance statistics
- **Settings:** Account settings, PIN login setup
- **Terms & Conditions:** View accepted terms

---

## Student

Views their own school data.

### Available Pages
- **Dashboard:** View your own attendance summary
- **Student ID Card:** View/download your ID card
- **Analytics:** View your own attendance statistics
- **Settings:** Account settings, change password
- **Terms & Conditions:** View accepted terms

---

## Kiosk Scan Operations

The **/scan** page serves as a public attendance kiosk — no login required for students.

### Activation
1. Staff member (Admin, Principal, VP, Homeroom Teacher, Teacher, Security) clicks **"Aktifkan"**
2. Staff enters their credentials in the dialog
3. Kiosk activates with the current shift:
   - **PAGI (Morning):** Check-in only, from 07:00
   - **SORE (Afternoon):** Check-out only, from 12:00+

### Scanning
- **QR Mode:** Student holds their ID card QR code up to the camera
- **Face Mode:** Camera auto-detects student faces and matches against stored references
- **Manual Mode:** Staff types the student's NISN directly

### Shift Gating
- PAGI sessions **only accept check-ins** — check-out is refused
- SORE sessions **only accept check-outs** — check-in is refused
- Minimum hours guard prevents premature check-out (configurable)

### Deactivation
- Staff clicks **"Nonaktifkan"** to end the session
- Mid-day shift switch requires confirmation (warns about switching PAGI ↔ SORE)

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Camera doesn't appear | Allow camera permission in browser settings |
| QR code not reading | Clean the card, hold 15–30 cm from camera |
| Face not matching | Ensure good lighting, check face registration |
| Login fails | Check Caps Lock; reset password in Settings → Users |
| Dashboard not updating | Check socket service is running on port 3003 |
| Scan refused "Shift PAGI" | You're trying to check out during morning session; wait for SORE |
| Scan refused "Min hours" | Not enough time since check-in; wait for the minimum hours |
| School not in directory | Ensure school status is ACTIVE or TRIAL in Super Admin |
| Subscription expired | Contact Super Admin to renew the school's subscription |
| T&C checkbox not appearing | Clear browser cache and reload; it appears only on first login |
| Reports are empty | Select the correct date range in the filter |

---

## Tips for Operations

### Kiosk Hardware
- Minimum 15" monitor + HD webcam
- Ideal camera-to-face distance: 30–80 cm
- Adequate lighting (avoid backlight)
- Browser: Chrome/Chromium recommended

### QR Code Cards
- Print on **A6 (105×148mm)** or **KTP (86×54mm)** format
- Use PVC/art carton 260gsm paper
- Laminate for durability

### Best Practices
- Activate the kiosk session **before** students arrive
- Deactivate at the end of each shift
- Review the Activity Log daily for unusual patterns
- Keep student face references updated (re-register annually)
- Export attendance reports weekly for archiving
