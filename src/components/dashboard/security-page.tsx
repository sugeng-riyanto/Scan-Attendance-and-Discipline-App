'use client'

import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import {
  ShieldAlert, Lock, Search, Bell, Landmark, Wrench, FileWarning,
  CheckCircle, Clock, AlertTriangle, Download, Copy, ChevronDown, ChevronUp,
  Eye, Shield, Users, Database, ClipboardList
} from 'lucide-react'
import { apiFetch } from '@/lib/api-fetch'

/* ── Runbook Steps ────────────────────────────────────────────────────── */
const RUNBOOK = [
  { icon: <Lock className="h-5 w-5" />, title: '1. Secure the System', text: 'Stop suspicious activity, revoke affected user sessions, and isolate the compromised component. Preserve all evidence (logs) before making any changes.', color: 'text-blue-600 dark:text-blue-400' },
  { icon: <Search className="h-5 w-5" />, title: '2. Investigate', text: 'Identify what data was exposed (names, NISN, photos, addresses), how the breach occurred, and who may be affected. Use the Activity Log to trace access patterns.', color: 'text-amber-600 dark:text-amber-400' },
  { icon: <Bell className="h-5 w-5" />, title: '3. Notify Affected Parties (≤72 hrs)', text: 'Notify students/parents whose personal data was compromised within 72 hours of discovery, in clear language per UU PDP No. 27/2022 and Child Protection Law No. 35/2014.', color: 'text-red-600 dark:text-red-400' },
  { icon: <Landmark className="h-5 w-5" />, title: '4. Report to Authorities', text: 'File a report with the Personal Data Protection supervisory authority and other relevant bodies as required by UU PDP.', color: 'text-purple-600 dark:text-purple-400' },
  { icon: <Wrench className="h-5 w-5" />, title: '5. Remediate & Prevent', text: 'Close the vulnerability, force password/PIN resets for affected accounts, enable PIN authentication, tighten RBAC, and update security procedures to prevent recurrence.', color: 'text-green-600 dark:text-green-400' },
]

/* ── Notification Templates (UU PDP Art. 67) ─────────────────────────── */
const NOTIFICATION_TEMPLATES = [
  {
    id: 'student-parent',
    title: 'Student / Parent Notification',
    subject: 'Important Notice: Personal Data Incident at [School Name]',
    body: `Dear [Parent/Guardian Name],

We are writing to inform you of a data security incident that may have affected your child's personal information.

**What happened:** [Brief description of the incident]

**What data may be involved:** [e.g., student name, NISN, attendance records, photo]

**When it was discovered:** [Date]

**What we are doing:**
- Immediately securing all affected systems
- Conducting a thorough investigation
- Implementing additional security measures
- Reporting to the relevant authorities as required by law

**What you can do:**
- Review your child's account for any unauthorized changes
- Contact us if you notice anything unusual
- Update passwords if you share credentials

We take the protection of your child's data very seriously and sincerely apologize for this incident. Under UU PDP No. 27/2022, you have the right to know how your data is managed and to request its deletion if necessary.

For questions, please contact: [Contact Email/Phone]

Sincerely,
[School Name] Administration`,
    regulation: 'UU PDP No. 27/2022, Art. 67 — Notification within 72 hours',
  },
  {
    id: 'authority-report',
    title: 'Authority Report Template',
    subject: 'Data Breach Report — [School Name] — [Date]',
    body: `DATA BREACH NOTIFICATION TO SUPERVISORY AUTHORITY

**Reporting Entity:** [School Name]
**Contact Person:** [Name, Title]
**Contact Details:** [Email, Phone]

**Incident Summary:**
- Date of incident: [Date]
- Date of discovery: [Date]
- Type of breach: [Unauthorized access / Data leak / System compromise]
- Data subjects affected: [Number] students/parents/staff
- Categories of data: [Names, NISN, photos, attendance, addresses]

**Nature of the breach:**
[Detailed description of how the breach occurred and what data was compromised]

**Measures taken:**
1. Systems secured and compromised components isolated
2. All affected sessions terminated
3. Password resets enforced for affected accounts
4. Additional security controls implemented
5. Full investigation initiated

**Risk assessment:**
- Likelihood of harm: [Low / Medium / High]
- Severity of impact: [Low / Medium / High]
- Number of data subjects: [Count]

**Follow-up actions:**
- Continued monitoring for 90 days
- Security audit scheduled for [Date]
- Policy updates in progress

This report is filed in compliance with UU PDP No. 27/2022, Art. 66-67.`,
    regulation: 'UU PDP No. 27/2022, Art. 66 — Report to supervisory authority',
  },
  {
    id: 'child-protection',
    title: 'Child Protection Notification',
    subject: 'Data Incident Involving Minor — [School Name]',
    body: `NOTIFICATION UNDER CHILD PROTECTION LAW

**To:** [Relevant Child Protection Authority]
**From:** [School Name], [Address]
**Date:** [Date]

**Subject:** Incident involving personal data of minor(s)

**Details:**
This notification is filed pursuant to UU Perlindungan Anak No. 35/2014 regarding an incident that may have compromised the personal data of students under 18 years of age.

**Affected minors:** [Number or "under investigation"]

**Data involved:** [Types of personal data]

**School actions taken:**
- Immediate system isolation
- Parents/guardians notified within 72 hours
- Law enforcement notified if criminal activity suspected
- Counseling support offered to affected students

We remain committed to the safety and wellbeing of all students.`,
    regulation: 'UU Perlindungan Anak No. 35/2014',
  },
]

/* ── Incident Severity Levels ──────────────────────────────────────────── */
const SEVERITY_LEVELS = [
  { value: 'LOW', label: 'Low', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', desc: 'No personal data exposed; internal configuration error only' },
  { value: 'MEDIUM', label: 'Medium', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', desc: 'Limited data exposure (e.g., non-sensitive admin data)' },
  { value: 'HIGH', label: 'High', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', desc: 'Personal data of students/parents exposed (names, NISN, addresses)' },
  { value: 'CRITICAL', label: 'Critical', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', desc: 'Sensitive data exposed (photos, biometric, health); minors affected; mass exposure' },
]

/* ── Post-Incident Checklist ──────────────────────────────────────────── */
const CHECKLIST_ITEMS = [
  { category: 'Immediate (0-24 hrs)', items: [
    'Isolate affected systems and revoke compromised sessions',
    'Preserve all logs and forensic evidence',
    'Notify internal security team and school leadership',
    'Document initial findings (what, when, how, who)',
    'Assess severity level of the incident',
  ]},
  { category: 'Short-term (24-72 hrs)', items: [
    'Complete investigation and determine full scope of impact',
    'Force password resets for all affected accounts',
    'Enable PIN authentication for affected users',
    'Send notification to affected students/parents (per UU PDP Art. 67)',
    'File report with data protection supervisory authority',
    'If minors affected: notify Child Protection Authority (UU Perlindungan Anak)',
  ]},
  { category: 'Medium-term (1-4 weeks)', items: [
    'Conduct full security audit of the application',
    'Review and tighten RBAC permissions',
    'Update security policies and procedures',
    'Implement additional monitoring and alerting',
    'Conduct staff training on data protection practices',
    'Review and update Terms & Conditions if needed',
  ]},
  { category: 'Long-term (1-3 months)', items: [
    'Verify all remediation steps are complete',
    'Monitor for recurring or related incidents',
    'Publish transparency report (if required)',
    'Update incident response plan based on lessons learned',
    'Schedule regular security reviews (quarterly)',
  ]},
]

interface BreachEntry { id: string; createdAt: string; username: string | null; role: string | null; level: string | null; details: string | null }

export function SecurityPage() {
  const [description, setDescription] = useState('')
  const [level, setLevel] = useState('ALL')
  const [severity, setSeverity] = useState('HIGH')
  const [breaches, setBreaches] = useState<BreachEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null)
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({})
  const [activeTab, setActiveTab] = useState('runbook')

  const fetchBreaches = async () => {
    try {
      const params = new URLSearchParams({ category: 'BREACH', severity: 'CRITICAL', level: level === 'ALL' ? 'ALL' : level })
      const data = await apiFetch<{ logs: BreachEntry[] }>(`/api/audit-logs?${params}`)
      setBreaches(data.logs)
    } catch { /* gated page */ }
  }

  useEffect(() => { fetchBreaches() }, [level]) // eslint-disable-line react-hooks/exhaustive-deps

  const report = async () => {
    setBusy(true)
    try {
      await apiFetch('/api/audit-logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description, level: level === 'ALL' ? null : level }) })
      toast.success('Incident reported (CRITICAL audit trail recorded)')
      setDescription('')
      fetchBreaches()
    } catch (err: any) { toast.error(err.message) } finally { setBusy(false) }
  }

  const copyTemplate = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Template copied to clipboard')
  }

  const toggleChecklist = (key: string) => {
    setChecklistState(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const totalChecks = CHECKLIST_ITEMS.reduce((sum, cat) => sum + cat.items.length, 0)
  const completedChecks = Object.values(checklistState).filter(Boolean).length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <Shield className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          Data Security & Breach Response
        </h2>
        <p className="text-sm text-muted-foreground">
          Exit solution for data breaches — compliant with UU PDP No. 27/2022 and Child Protection Law No. 35/2014.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-nowrap min-w-max">
          <TabsTrigger value="runbook" className="flex-1 min-w-[100px]">Runbook</TabsTrigger>
          <TabsTrigger value="templates" className="flex-1 min-w-[100px]">Templates</TabsTrigger>
          <TabsTrigger value="checklist" className="flex-1 min-w-[100px]">Checklist</TabsTrigger>
          <TabsTrigger value="report" className="flex-1 min-w-[100px]">Report Incident</TabsTrigger>
          <TabsTrigger value="history" className="flex-1 min-w-[100px]">History</TabsTrigger>
        </TabsList>

        {/* ── Runbook Tab ────────────────────────────────────────────── */}
        <TabsContent value="runbook" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {RUNBOOK.map(r => (
              <Card key={r.title}>
                <CardHeader className="pb-1"><CardTitle className="text-sm flex items-center gap-2">{r.icon} <span className={r.color}>{r.title}</span></CardTitle></CardHeader>
                <CardContent><p className="text-xs text-muted-foreground leading-relaxed">{r.text}</p></CardContent>
              </Card>
            ))}
          </div>

          {/* Data Types at Risk */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Database className="h-5 w-5" /> Data Types at Risk</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  { type: 'Student PII', items: 'Name, NISN, gender, address, phone, email, photo', risk: 'HIGH' },
                  { type: 'Biometric Data', items: 'Face descriptors, facial recognition templates', risk: 'CRITICAL' },
                  { type: 'Attendance Records', items: 'Check-in/out times, location, status', risk: 'MEDIUM' },
                  { type: 'Behavioral Data', items: 'Violations, merit points, discipline level', risk: 'MEDIUM' },
                  { type: 'Parent/Guardian Data', items: 'Name, phone, relationship, account access', risk: 'HIGH' },
                  { type: 'System Credentials', items: 'Passwords (hashed), PINs, session tokens', risk: 'HIGH' },
                ].map(d => (
                  <div key={d.type} className="p-3 border rounded-lg dark:border-gray-700">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium">{d.type}</p>
                      <Badge className={`text-[10px] ${d.risk === 'CRITICAL' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : d.risk === 'HIGH' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>{d.risk}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{d.items}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Notification Templates Tab ──────────────────────────────── */}
        <TabsContent value="templates" className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            UU PDP No. 27/2022 Art. 67 requires notification to affected data subjects within <strong>72 hours</strong> of discovering a breach. Below are ready-to-use templates.
          </p>
          {NOTIFICATION_TEMPLATES.map(t => (
            <Card key={t.id}>
              <CardHeader className="pb-1 cursor-pointer" onClick={() => setExpandedTemplate(expandedTemplate === t.id ? null : t.id)}>
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <FileWarning className="h-4 w-4 text-amber-500" />
                    {t.title}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{t.regulation}</Badge>
                    {expandedTemplate === t.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </CardTitle>
              </CardHeader>
              {expandedTemplate === t.id && (
                <CardContent className="space-y-3">
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <p className="text-xs font-medium mb-1">Subject: {t.subject}</p>
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">{t.body}</pre>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => copyTemplate(t.body)}>
                    <Copy className="h-3 w-3 mr-1" />Copy Template
                  </Button>
                </CardContent>
              )}
            </Card>
          ))}
        </TabsContent>

        {/* ── Checklist Tab ───────────────────────────────────────────── */}
        <TabsContent value="checklist" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Post-incident response checklist — {completedChecks}/{totalChecks} completed
            </p>
            <Button variant="outline" size="sm" onClick={() => setChecklistState({})}>Reset All</Button>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div className="bg-green-500 h-2 rounded-full transition-all duration-300" style={{ width: `${totalChecks > 0 ? (completedChecks / totalChecks) * 100 : 0}%` }} />
          </div>
          {CHECKLIST_ITEMS.map(cat => (
            <Card key={cat.category}>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{cat.category}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {cat.items.map((item, idx) => {
                  const key = `${cat.category}-${idx}`
                  const checked = checklistState[key] || false
                  return (
                    <div key={key} className="flex items-start gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer" onClick={() => toggleChecklist(key)}>
                      <Checkbox checked={checked} className="mt-0.5" />
                      <span className={`text-sm ${checked ? 'line-through text-muted-foreground' : ''}`}>{item}</span>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ── Report Incident Tab ─────────────────────────────────────── */}
        <TabsContent value="report" className="mt-4 space-y-4">
          <Card className="border-red-200 dark:border-red-800">
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2 text-red-600 dark:text-red-400"><FileWarning className="h-5 w-5" /> Report Data Breach Incident</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">Records the incident as a CRITICAL entry in the Activity Log for follow-up per the runbook above.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Affected Level</Label>
                  <Select value={level} onValueChange={setLevel}><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="ALL">JHS &amp; SHS</SelectItem><SelectItem value="JHS">JHS (SMP)</SelectItem><SelectItem value="SHS">SHS (SMA)</SelectItem></SelectContent></Select>
                </div>
                <div>
                  <Label>Severity Assessment</Label>
                  <Select value={severity} onValueChange={setSeverity}><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SEVERITY_LEVELS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select>
                </div>
              </div>
              <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                <p className="text-xs text-muted-foreground">{SEVERITY_LEVELS.find(s => s.value === severity)?.desc}</p>
              </div>
              <div>
                <Label>Incident Description</Label>
                <Textarea rows={4} value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe what happened, what data was exposed, when it was detected, and initial impact assessment…" />
              </div>
              <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={report} disabled={busy || !description.trim()}>
                <ShieldAlert className="h-4 w-4 mr-2" />Report Incident
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Incident History Tab ────────────────────────────────────── */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2"><Clock className="h-5 w-5" /> Incident Timeline</CardTitle>
                <Button variant="outline" size="sm" onClick={fetchBreaches}><Search className="h-4 w-4 mr-1" />Refresh</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[480px]">
                {breaches.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8 text-sm">
                    <Shield className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    No incidents recorded. System is secure.
                  </p>
                ) : (
                  <div className="divide-y dark:divide-gray-800">
                    {breaches.map((b, idx) => (
                      <div key={b.id} className="py-3 px-4 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <div className="flex items-start gap-3">
                          {/* Timeline dot */}
                          <div className="flex flex-col items-center">
                            <div className="h-3 w-3 rounded-full bg-red-500 ring-2 ring-red-200 dark:ring-red-800" />
                            {idx < breaches.length - 1 && <div className="w-0.5 h-full bg-gray-200 dark:bg-gray-700 mt-1" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[10px]">CRITICAL</Badge>
                              <span className="text-sm font-medium">{b.username || 'System'}</span>
                              <span className="text-xs text-muted-foreground">{b.role || ''}</span>
                              {b.level && <Badge variant="outline" className="text-[10px]">{b.level}</Badge>}
                              <span className="text-xs text-muted-foreground ml-auto">{new Date(b.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{b.details}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
