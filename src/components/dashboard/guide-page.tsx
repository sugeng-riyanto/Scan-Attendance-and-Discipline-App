'use client'

import React from 'react'
import { AuthUser } from '@/lib/stores/auth-store'
import { roleLabels } from '@/lib/attendance-utils'
import { BookOpen, UserCircle2 } from 'lucide-react'

interface Step {
  title: string
  detail: string
}

interface RoleGuide {
  role: string
  label: string
  intro: string
  steps: Step[]
}

const GUIDES: RoleGuide[] = [
  {
    role: 'ADMIN',
    label: 'Admin',
    intro: 'You manage the entire system. Start from Settings, then manage the master data.',
    steps: [
      { title: 'Set up school profile', detail: 'Open Settings, then fill in the school name, address, logo, and theme color.' },
      { title: 'Manage user accounts', detail: 'Create accounts for teachers, homeroom teachers, and other staff via Settings.' },
      { title: 'Monitor reports', detail: 'Open Statistics and Attendance Records to monitor student attendance and discipline.' },
      { title: 'Manage student data', detail: 'Use Attendance or ID Card to manage student data and print cards.' },
    ],
  },
  {
    role: 'KEPALA_SEKOLAH',
    label: 'Principal',
    intro: 'You monitor overall school performance without changing data.',
    steps: [
      { title: 'View summary', detail: 'Open the Dashboard to see the number of students, attendance, and this month\'s violations.' },
      { title: 'Review statistics', detail: 'Open Statistics to analyze attendance trends and discipline patterns.' },
      { title: 'Download reports', detail: 'Use the Export menu to download recap files.' },
    ],
  },
  {
    role: 'VP_KESISWAAN',
    label: 'Vice Principal for Student Affairs',
    intro: 'You handle student discipline and duty teacher schedules.',
    steps: [
      { title: 'Record violations', detail: 'Open Violations to record or update student violation records.' },
      { title: 'Analyze discipline patterns', detail: 'Use Discipline Pattern to see violation and good deed patterns.' },
      { title: 'Manage duty schedules', detail: 'Open Duty Schedule to arrange schedules and assignments.' },
    ],
  },
  {
    role: 'WALI_KELAS',
    label: 'Homeroom Teacher',
    intro: 'You manage attendance, permissions, and behavior of students in your class.',
    steps: [
      { title: 'Student attendance', detail: 'Open Attendance to record student attendance or scan cards.' },
      { title: 'Process permissions', detail: 'Open Permissions to approve or reject student permission requests.' },
      { title: 'Record behavior', detail: 'Use Violations and Good Deeds to record student behavior.' },
    ],
  },
  {
    role: 'GURU',
    label: 'Teacher',
    intro: 'You record student attendance and behavior during your teaching hours.',
    steps: [
      { title: 'Class attendance', detail: 'Open Attendance to record student attendance during your class.' },
      { title: 'Record behavior', detail: 'Use Violations or Good Deeds to record student behavior.' },
      { title: 'View records', detail: 'Open Attendance Records to see the attendance summary.' },
    ],
  },
  {
    role: 'GURU_JAGA',
    label: 'Duty Teacher',
    intro: 'You operate the attendance scanner at the school entrance.',
    steps: [
      { title: 'Activate scanner', detail: 'On the Dashboard or /scan page, click Activate, then choose the session (morning for check-in, afternoon for check-out).' },
      { title: 'Monitor arrivals', detail: 'Use the Attendance Monitor to see students who have just arrived.' },
      { title: 'Deactivate session', detail: 'After scanning hours end, click Deactivate to close the session.' },
    ],
  },
  {
    role: 'ORANG_TUA',
    label: 'Parent',
    intro: 'You monitor your child\'s attendance and permissions.',
    steps: [
      { title: 'Monitor attendance', detail: 'Open the Dashboard to see your child\'s attendance status today.' },
      { title: 'Submit permissions', detail: 'Open Permissions to submit your child\'s absence requests.' },
    ],
  },
  {
    role: 'SISWA',
    label: 'Student',
    intro: 'You can view your own attendance and behavior data.',
    steps: [
      { title: 'Check attendance', detail: 'Open the Dashboard to see your attendance status today.' },
      { title: 'View ID card', detail: 'Open ID Card to see your identity card.' },
    ],
  },
]

export function GuidePage({ user }: { user: AuthUser }) {
  const guide = GUIDES.find(g => g.role === user.role) || GUIDES[0]

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
          <BookOpen className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold">Application Usage Guide</h2>
          <p className="text-xs text-muted-foreground">
            Based on your role: {roleLabels[user.role] || user.role}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
        <p className="flex items-start gap-2">
          <UserCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          {guide.intro}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {guide.steps.map((s, i) => (
          <div key={i} className="rounded-xl border bg-white p-4 shadow-sm dark:bg-gray-900 dark:border-gray-800">
            <div className="flex items-center gap-2 mb-1">
              <span className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: '#3b82f6' }}>
                {i + 1}
              </span>
              <p className="font-semibold text-sm">{s.title}</p>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{s.detail}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        This guide is arranged according to the user role (RBAC). If you need help, contact the school Admin.
      </p>
    </div>
  )
}
