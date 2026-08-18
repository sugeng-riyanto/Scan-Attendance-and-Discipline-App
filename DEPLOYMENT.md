# Deployment Guide — Attendance Application

A complete guide for school IT staff to deploy and configure the Attendance Application for production use.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Step 1: Create a Database](#step-1-create-a-database)
3. [Step 2: Deploy to Vercel](#step-2-deploy-to-vercel)
4. [Step 3: Initialize the Database](#step-3-initialize-the-database)
5. [Step 4: Configure Your School](#step-4-configure-your-school)
6. [Step 5: Import Student Data](#step-5-import-student-data)
7. [Step 6: Set Up Staff Accounts](#step-6-set-up-staff-accounts)
8. [Step 7: Configure Scan Kiosk](#step-7-configure-scan-kiosk)
9. [Step 8: Test Everything](#step-8-test-everything)
10. [Troubleshooting](#troubleshooting)
11. [Cost Estimate](#cost-estimate)
12. [Security Checklist](#security-checklist)

---

## Prerequisites

Before you begin, make sure you have:

- [ ] A GitHub account (free) — [github.com](https://github.com)
- [ ] A Vercel account (free tier available) — [vercel.com](https://vercel.com)
- [ ] A Neon database account (free tier available) — [neon.tech](https://neon.tech)
- [ ] Basic familiarity with web browser and file management
- [ ] A computer with internet access

**Time required:** 30–60 minutes for initial setup.

---

## Step 1: Create a Database

The application needs a PostgreSQL database to store student data, attendance records, and settings.

### Option A: Neon (Recommended — Free)

1. Go to [neon.tech](https://neon.tech) and click **Sign Up**
2. Sign up using your **GitHub account** (click "Continue with GitHub")
3. Once logged in, click **Create a Project**
4. Fill in:
   - **Project name:** `attendance-school` (or any name you prefer)
   - **Database name:** `attendance_db`
   - **Region:** Choose the one closest to your school (e.g., `Asia Pacific` → `ap-southeast-1`)
5. Click **Create Project**
6. Once created, go to **Dashboard** → **Connection Details**
7. Select **Connection string** → **PostgreSQL**
8. Copy the full connection string. It looks like:
   ```
   postgresql://neondb_owner:AbCdEfGh@ep-xyz-12345.us-east-2.aws.neon.tech/attendance_db?sslmode=require
   ```
9. **Save this string** — you'll need it in Step 2.

### Option B: Supabase (Free tier)

1. Go to [supabase.com](https://supabase.com) and sign up
2. Create a new project
3. Go to **Settings** → **Database** → **Connection string**
4. Copy the **URI** value
5. Replace `[YOUR-PASSWORD]` with your database password

---

## Step 2: Deploy to Vercel

Vercel hosts the application and makes it accessible via the internet.

### 2.1 Fork the Repository

1. Go to [github.com/sugeng-riyanto/Scan-Attendance-and-Discipline-App](https://github.com/sugeng-riyanto/Scan-Attendance-and-Discipline-App)
2. Click the **Fork** button (top-right)
3. Click **Create fork** — this creates your own copy of the code

### 2.2 Connect to Vercel

1. Go to [vercel.com](https://vercel.com) and sign up with your **GitHub account**
2. Click **Add New...** → **Project**
3. Find your forked repository and click **Import**
4. On the configuration page:

   **Build Settings:**
   - Framework Preset: **Next.js**
   - Build Command: `prisma generate && next build`
   - Install Command: `bun install`
   - Output Directory: `.next`

5. Click **Environment Variables** and add these:

   | Name | Value |
   |------|-------|
   | `DATABASE_URL` | *(paste your Neon connection string from Step 1)* |
   | `JWT_SECRET` | `your-school-name-attendance-secret-key-2024` |
   | `NEXT_PUBLIC_APP_URL` | `https://your-project-name.vercel.app` |

   > **Tip:** For `JWT_SECRET`, create a unique random string. You can use [random.org](https://www.random.org/strings/) to generate one.

6. Click **Deploy**

7. Wait 2–3 minutes for the build to complete. You'll see a success message with your app URL.

### 2.3 Note Your App URL

After deployment, Vercel gives you a URL like:
```
https://attendance-school.vercel.app
```

**Save this URL** — this is your school's attendance application address.

---

## Step 3: Initialize the Database

Now that the app is deployed, you need to set up the database with the initial schema and demo data.

### 3.1 Open Your App

Open your app URL in a browser (e.g., `https://attendance-school.vercel.app`).

### 3.2 Seed the Database

On the login page, you'll see a button: **"Setup Database (Demo Data)"**

1. Click this button
2. Wait 10–30 seconds for the setup to complete
3. The page will reload and show the login screen

This creates:
- 3 demo schools (SHB-001, SMPN-01, SMA-INS)
- 24 demo students across 10 classes
- All demo staff accounts (Admin, Principal, Teachers, etc.)
- Attendance records, violations, and good deeds data

> **Important:** This is demo data. In the next steps, you'll replace it with your actual school data.

---

## Step 4: Configure Your School

### 4.1 Login as Super Admin

1. On the login page, click **"Super Admin"** button (or go to `/s/SHB-001`)
2. Login with:
   - Username: `superadmin`
   - Password: `superadmin123`
3. Click **"I accept the Terms & Conditions"** checkbox if prompted

### 4.2 Create Your School

1. Click **Super Admin** in the sidebar
2. Go to **Schools** tab
3. Click **Add School**
4. Fill in your school details:

   | Field | Value |
   |-------|-------|
   | Code | e.g., `SMA-NUSANTARA` (unique identifier) |
   | Name | Your school name |
   | Address | Full school address |
   | Domain | Optional: `attendance.yourdomain.com` |
   | Theme Color | Pick a color for your school's branding |
   | Description | Short description of your school |
   | Vision | Your school's vision statement |
   | Mission | Your school's mission statement |
   | Phone | School phone number |
   | Email | School email address |
   | JHS (SMP) | Enable if your school has junior high |
   | SHS (SMA) | Enable if your school has senior high |

5. Click **Save**

### 4.3 Upload School Logo

1. In the school edit dialog, click **Upload Logo**
2. Select your school's logo image (recommended: 200x200px, PNG or JPG)
3. Click **Save**

---

## Step 5: Import Student Data

### 5.1 Download the Template

1. Go to **Settings** → **Students** tab
2. Click **Import XLSX** button
3. Click **Download Template**

This downloads an Excel file with the required columns:
- `NISN` — Student ID number
- `Nama` — Student name
- `Kode Sekolah` — School code (leave empty for your school)
- `Nama Sekolah` — School name (leave empty for your school)
- `Jenis Kelamin` — Gender (`L` or `P`)
- `Kode Kelas` — Class code (e.g., `7A`, `10B`)
- `Nama Kelas` — Class name
- `Jenjang` — Level (`SMP` or `SMA`)
- `Alamat` — Address
- `No HP` — Phone number
- `Email` — Email address

### 5.2 Fill in Student Data

1. Open the downloaded template in Excel or Google Sheets
2. Fill in all student data
3. Save the file as `.xlsx` format

### 5.3 Upload the File

1. Go back to **Settings** → **Students** tab
2. Click **Import XLSX**
3. Select your filled template file
4. Wait for the import to complete
5. Verify students appear in the list

> **Tip:** You can import multiple times. The system detects duplicates by NISN and updates existing records.

---

## Step 6: Set Up Staff Accounts

### 6.1 Create Staff Accounts

1. Go to **Settings** → **Users** tab
2. Click **Add**
3. Fill in:
   - **Username:** e.g., `guru-budi`
   - **Name:** e.g., `Budi Santoso`
   - **Role:** Select the appropriate role
   - **Password:** Set a secure password

4. Click **Save**

### 6.2 Available Roles

| Role | Description | Access |
|------|-------------|--------|
| **Admin** | School administrator | Full access to all settings and data |
| **Principal** | School principal (Kepala Sekolah) | View all data, manage settings |
| **VP Student Affairs** | Vice Principal for Student Affairs | Manage violations, good deeds, categories |
| **Homeroom Teacher** | Class teacher (Wali Kelas) | Manage their class's attendance, violations |
| **Teacher** | Subject teacher (Guru) | Record attendance, view their classes |
| **Duty Teacher** | Teacher on duty (Guru Jaga) | Monitor live attendance, record violations |
| **Parent** | Student's parent (Orang Tua) | View their child's data |
| **Student** | Student (Siswa) | View their own data |

### 6.3 Default Passwords

For demo accounts, the default password pattern is:
- `admin` → `admin123`
- `kepsek` → `kepsek123`
- `guru1` → `guru123`
- etc.

**Change these passwords immediately in production!**

---

## Step 7: Configure Scan Kiosk

The scan kiosk is used at the school entrance for students to check in/out.

### 7.1 Access the Kiosk

1. Open a browser on the kiosk device (tablet or computer)
2. Go to your app URL: `https://your-app.vercel.app/scan`
3. Login with a staff account (Admin, Teacher, or Duty Teacher)

### 7.2 Activate a Session

1. On the kiosk page, click **Activate Session**
2. Select the shift:
   - **PAGI (Morning)** — For check-in (07:00–08:00)
   - **SORE (Afternoon)** — For check-out (14:50–15:30 for JHS, 15:30–16:00 for SHS)
3. The session is now active and ready for scanning

### 7.3 Scan Methods

Students can check in/out using:

1. **QR Code** — Show their student ID card QR code to the camera
2. **Face Recognition** — Look at the camera (requires face registration first)
3. **Manual Entry** — Type the student's NISN number

### 7.4 Face Registration

Before using face recognition, students need to register their faces:

1. Go to **Settings** → **Students**
2. Click the camera icon next to a student's name
3. Follow the prompts to capture 3 photos
4. The system will create a face template for recognition

---

## Step 8: Test Everything

### 8.1 Test Login

- [ ] Login as Admin — should see full dashboard
- [ ] Login as Teacher — should see their classes
- [ ] Login as Parent — should see their child's data
- [ ] Login as Student — should see their own data

### 8.2 Test Attendance

- [ ] Activate a kiosk session
- [ ] Scan a student's QR code — should show "Check-in successful"
- [ ] Check the Admin dashboard — attendance count should update
- [ ] Check the Monitor Presensi page — student should appear

### 8.3 Test Dark Mode

- [ ] Click the sun/moon icon in the header
- [ ] Verify all pages look correct in dark mode
- [ ] Check that text is readable on all backgrounds

### 8.4 Test Mobile Access

- [ ] Open the app on a smartphone
- [ ] Verify the responsive layout works
- [ ] Test the bottom navigation

---

## Troubleshooting

### "Application blocked" message

**Cause:** Subscription has expired.

**Fix:** Login as Super Admin → Schools → Click the renew button for your school.

### "Failed to load" on dashboard

**Cause:** Database connection issue.

**Fix:**
1. Check that `DATABASE_URL` is correctly set in Vercel environment variables
2. Make sure the database is running (check Neon dashboard)
3. Redeploy the app after fixing

### Students not appearing after import

**Cause:** Import file format issue.

**Fix:**
1. Make sure the file is `.xlsx` format (not `.csv`)
2. Check that all required columns are present
3. Verify NISN is a number (not text)
4. Try importing a small batch first (5–10 students)

### QR code scanning not working

**Cause:** Camera permission denied or poor lighting.

**Fix:**
1. Allow camera access in the browser
2. Ensure good lighting on the kiosk
3. Hold the QR code steady, about 15–20cm from the camera

### Real-time updates not working

**Cause:** Socket service not configured.

**Fix:** The app works without real-time updates. For live dashboard updates, deploy the socket service separately (see README.md for details).

---

## Cost Estimate

### Free Tier (Recommended for Small Schools)

| Service | Cost | Limits |
|---------|------|--------|
| Vercel | $0 | 100GB bandwidth, 100K function invocations/month |
| Neon | $0 | 512MB storage, 24/7 compute (always-on) |
| **Total** | **$0/month** | Sufficient for up to 500 students |

### Pro Tier (For Larger Schools)

| Service | Cost | Benefits |
|---------|------|----------|
| Vercel Pro | $20/month | More bandwidth, custom domains, analytics |
| Neon Pro | $19/month | More storage, faster compute, backups |
| **Total** | **$39/month** | Suitable for 500+ students |

---

## Security Checklist

Before going live with real student data:

- [ ] Change all demo passwords (admin123, kepsek123, etc.)
- [ ] Set a strong `JWT_SECRET` (32+ characters, random)
- [ ] Enable PIN authentication for admin accounts
- [ ] Review user roles and permissions
- [ ] Test the Terms & Conditions page
- [ ] Verify data isolation (one school can't see another's data)
- [ ] Set up regular database backups (Neon does this automatically)
- [ ] Review the Data Security page for breach response procedures
- [ ] Train staff on the Activity Log for monitoring
- [ ] Keep the Super Admin password secure and separate from other accounts

---

## Support

For issues or questions:
- Check the **User Guide** page in the application
- Review the **Terms & Conditions** for data protection compliance
- Contact your school's IT administrator

---

*Last updated: August 2026*
*Application version: 0.2.0*
