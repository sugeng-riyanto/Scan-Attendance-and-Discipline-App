# Production Launch Checklist

A comprehensive checklist to ensure the Attendance Application is ready for production use with real student data.

---

## 🏁 Pre-Launch (Complete Before Going Live)

### 1. Infrastructure Setup

- [ ] **Database provisioned** (Neon/Supabase/PostgreSQL)
  - [ ] Connection string saved securely
  - [ ] SSL enabled (`sslmode=require`)
  - [ ] Backup schedule configured
- [ ] **Vercel project created**
  - [ ] Repository connected
  - [ ] Environment variables set:
    - [ ] `DATABASE_URL`
    - [ ] `JWT_SECRET` (32+ chars, random)
    - [ ] `NEXT_PUBLIC_APP_URL`
  - [ ] Custom domain configured (optional)
- [ ] **SSL certificate valid** (auto via Vercel/Neon)
- [ ] **GitHub Actions secrets configured**
  - [ ] `DATABASE_URL` for backups
  - [ ] `SLACK_WEBHOOK_URL` for notifications (optional)
  - [ ] `SMTP_USERNAME` / `SMTP_PASSWORD` for email (optional)

### 2. Security Configuration

- [ ] **JWT_SECRET is strong and unique**
  - [ ] Minimum 32 characters
  - [ ] Mix of letters, numbers, symbols
  - [ ] Not reused from development
- [ ] **All demo passwords changed**
  - [ ] `admin` → new password
  - [ ] `kepsek` → new password
  - [ ] `vpkes` → new password
  - [ ] `wali7a` → new password
  - [ ] `guru1` → new password
  - [ ] `jaga1` → new password
  - [ ] `ortu1` → new password
  - [ ] `siswa1` → new password
  - [ ] `superadmin` → new password (CRITICAL)
- [ ] **RBAC permissions reviewed**
  - [ ] Admin has appropriate access
  - [ ] Teachers can only see their classes
  - [ ] Parents can only see their children
  - [ ] Students have read-only access
- [ ] **Data isolation verified**
  - [ ] School A cannot see School B's data
  - [ ] Cross-school API calls return 403
- [ ] **Terms & Conditions published**
  - [ ] Content reviewed for accuracy
  - [ ] UU PDP compliance verified
  - [ ] Child protection notices included

### 3. Data Migration

- [ ] **Student data imported**
  - [ ] XLSX template downloaded
  - [ ] All students imported correctly
  - [ ] NISN numbers unique
  - [ ] Class assignments correct
  - [ ] Parent accounts created
- [ ] **Staff accounts created**
  - [ ] Admin account(s)
  - [ ] Principal account
  - [ ] VP Student Affairs account
  - [ ] Homeroom teacher accounts
  - [ ] Subject teacher accounts
  - [ ] Duty teacher accounts
- [ ] **School profile configured**
  - [ ] School name correct
  - [ ] Address complete
  - [ ] Logo uploaded
  - [ ] Theme color set
  - [ ] Vision/Mission statements
  - [ ] Contact info (phone, email)
  - [ ] JHS/SHS schedule times
- [ ] **Categories configured**
  - [ ] Violation categories appropriate
  - [ ] Good deed categories appropriate
  - [ ] Point values reasonable
- [ ] **Academic year set**
  - [ ] Current year active
  - [ ] Start/end dates correct

### 4. Kiosk Setup

- [ ] **Kiosk device ready**
  - [ ] Tablet/computer at entrance
  - [ ] Stable internet connection
  - [ ] Camera working (for QR/face scan)
  - [ ] Good lighting for face recognition
- [ ] **Kiosk browser configured**
  - [ ] Chrome/Edge installed
  - [ ] Camera permissions allowed
  - [ ] Notifications enabled
  - [ ] Auto-lock disabled
  - [ ] Screensaver disabled
- [ ] **Face registration completed**
  - [ ] All students have face photos
  - [ ] Recognition accuracy tested
- [ ] **QR codes printed**
  - [ ] Student ID cards with QR codes
  - [ ] Backup manual entry process

### 5. Testing

- [ ] **Login tests**
  - [ ] All roles can login
  - [ ] T&C acceptance required
  - [ ] PIN login works (if enabled)
  - [ ] Failed login recorded in audit log
- [ ] **Attendance tests**
  - [ ] QR scan works
  - [ ] Face recognition works
  - [ ] Manual entry works
  - [ ] Late detection works
  - [ ] Shift gating works (PAGI/SORE)
  - [ ] Min-hours guard works
- [ ] **Dashboard tests**
  - [ ] Statistics display correctly
  - [ ] Real-time updates work (socket)
  - [ ] Charts render properly
  - [ ] Dark mode works
- [ ] **Export tests**
  - [ ] CSV export works
  - [ ] PDF export works
  - [ ] XLSX import works
- [ ] **Mobile tests**
  - [ ] Responsive on phones
  - [ ] Responsive on tablets
  - [ ] Touch interactions work
  - [ ] Bottom nav works

### 6. Monitoring & Alerts

- [ ] **Health monitoring active**
  - [ ] Daily health check workflow
  - [ ] Alert notifications configured
- [ ] **Backup schedule active**
  - [ ] Weekly database backups
  - [ ] Backup retention verified
- [ ] **Audit logging active**
  - [ ] Login attempts logged
  - [ ] Data changes logged
  - [ ] Export actions logged
- [ ] **Error tracking** (optional)
  - [ ] Sentry/LogRocket configured
  - [ ] Alert thresholds set

---

## 🚀 Launch Day

### Morning of Launch

- [ ] **Final database backup**
  - [ ] Manual backup triggered
  - [ ] Backup verified
- [ ] **All staff notified**
  - [ ] Email sent with login credentials
  - [ ] Quick start guide shared
  - [ ] Support contact info provided
- [ ] **Kiosk activated**
  - [ ] Session started for PAGI shift
  - [ ] Camera tested
  - [ ] QR scanner tested
- [ ] **Dashboard monitored**
  - [ ] Admin dashboard open
  - [ ] Monitor Presensi page open
  - [ ] Real-time updates confirmed

### During First Day

- [ ] **Staff supported**
  - [ ] Help desk available
  - [ ] Login issues resolved
  - [ ] Scan issues resolved
- [ ] **Data verified**
  - [ ] Attendance records correct
  - [ ] No duplicate entries
  - [ ] Late detection accurate
- [ ] **Issues logged**
  - [ ] Bug reports collected
  - [ ] Feedback gathered
  - [ ] Improvements noted

### End of First Day

- [ ] **Data exported**
  - [ ] Daily attendance report
  - [ ] Any anomalies noted
- [ ] **Kiosk deactivated**
  - [ ] SORE session ended
  - [ ] Device secured
- [ ] **System checked**
  - [ ] All features working
  - [ ] No error logs
  - [ ] Performance acceptable

---

## 📋 Post-Launch (First Week)

### Day 2-3

- [ ] **Feedback collected**
  - [ ] Staff satisfaction survey
  - [ ] Student feedback
  - [ ] Parent feedback
- [ ] **Issues triaged**
  - [ ] Critical bugs fixed
  - [ ] Feature requests noted
  - [ ] UX improvements planned
- [ ] **Data quality checked**
  - [ ] No missing records
  - [ ] No incorrect statuses
  - [ ] Reports accurate

### Day 4-5

- [ ] **Training completed**
  - [ ] All staff trained
  - [ ] Kiosk operators trained
  - [ ] Admin trained on settings
- [ ] **Documentation updated**
  - [ ] School-specific procedures
  - [ ] Emergency contacts
  - [ ] Escalation process
- [ ] **Backup verified**
  - [ ] First weekly backup successful
  - [ ] Restore test performed

### End of Week 1

- [ ] **Performance reviewed**
  - [ ] Response times acceptable
  - [ ] No downtime
  - [ ] User satisfaction high
- [ ] **Security audit**
  - [ ] No unauthorized access
  - [ ] Audit logs reviewed
  - [ ] Passwords still secure
- [ ] **Launch declared successful**
  - [ ] Stakeholders notified
  - [ ] Celebration! 🎉

---

## 🔄 Ongoing Maintenance

### Daily
- [ ] Check dashboard for anomalies
- [ ] Review audit logs
- [ ] Address staff questions

### Weekly
- [ ] Review attendance reports
- [ ] Check backup status
- [ ] Update categories if needed

### Monthly
- [ ] Review user access
- [ ] Check SSL certificate
- [ ] Update student data
- [ ] Review subscription status

### Quarterly
- [ ] Security audit
- [ ] Performance review
- [ ] Feature planning
- [ ] Staff retraining (if needed)

---

## 🆘 Emergency Procedures

### If System Goes Down
1. Check Vercel status page
2. Check Neon database status
3. Review GitHub Actions for errors
4. Contact support if needed
5. Use paper backup until restored

### If Data Breach Suspected
1. **Immediately:** Disable affected accounts
2. **Within 1 hour:** Document the incident
3. **Within 24 hours:** Notify school leadership
4. **Within 72 hours:** Notify affected parties (per UU PDP)
5. **Within 7 days:** File report with authorities
6. **Follow:** Data Security page runbook

### If Attendance Discrepancy Found
1. Check audit log for the student
2. Verify scan timestamp
3. Check for system errors
4. Correct if necessary (with documentation)
5. Notify affected parties

---

## 📞 Support Contacts

| Issue | Contact |
|-------|---------|
| **Login problems** | School Admin |
| **Scan issues** | IT Support |
| **Data questions** | Principal |
| **System issues** | [Your support email] |
| **Emergency** | [Your emergency contact] |

---

## ✅ Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| School Admin | | | |
| Principal | | | |
| IT Support | | | |
| Project Lead | | | |

---

*Last updated: August 2026*
*Application version: 0.2.0*
