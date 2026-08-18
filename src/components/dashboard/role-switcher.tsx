'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import { Users, ChevronRight, Zap, Eye } from 'lucide-react'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useAppStore } from '@/lib/stores/app-store'
import { usePreviewStore } from '@/lib/stores/preview-store'
import { roleLabels } from '@/lib/attendance-utils'
import { NAV_ITEMS } from './nav-config'

interface DemoAccount {
  username: string
  password: string
  role: string
  label: string
  description: string
  color: string
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  { username: 'superadmin', password: 'superadmin123', role: 'SUPER_ADMIN', label: 'Super Admin', description: 'Full access to all schools and roles', color: '#7c3aed' },
  { username: 'admin', password: 'admin123', role: 'ADMIN', label: 'Admin', description: 'School administrator — full CRUD', color: '#2563eb' },
  { username: 'kepsek', password: 'kepsek123', role: 'KEPALA_SEKOLAH', label: 'Principal', description: 'View all data, manage settings', color: '#0891b2' },
  { username: 'vpkes', password: 'vpkes123', role: 'VP_KESISWAAN', label: 'VP Student Affairs', description: 'Violations, good deeds, categories', color: '#059669' },
  { username: 'wali7a', password: 'wali123', role: 'WALI_KELAS', label: 'Homeroom Teacher', description: 'Class attendance, violations', color: '#d97706' },
  { username: 'guru1', password: 'guru123', role: 'GURU', label: 'Teacher', description: 'Record attendance, view classes', color: '#dc2626' },
  { username: 'jaga1', password: 'jaga123', role: 'GURU_JAGA', label: 'Duty Teacher', description: 'Monitor live attendance', color: '#9333ea' },
  { username: 'ortu1', password: 'ortu123', role: 'ORANG_TUA', label: 'Parent', description: 'View child data', color: '#ea580c' },
  { username: 'siswa1', password: 'siswa123', role: 'SISWA', label: 'Student', description: 'View own data', color: '#64748b' },
]

export function RoleSwitcher() {
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState<string | null>(null)
  const { user, login, logout } = useAuthStore()
  const { setActivePage } = useAppStore()
  const clearPreview = usePreviewStore(s => s.clearPreview)

  const quickSwitch = async (account: DemoAccount) => {
    setSwitching(account.username)
    try {
      // Logout first if logged in
      if (user) {
        await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) })
        logout()
      }

      // Login as the new role
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: account.username, password: account.password, acceptedTerms: true }),
      })

      if (!res.ok) throw new Error('Login failed')
      const data = await res.json()

      login(data.user)
      clearPreview()
      setActivePage('dashboard')
      toast.success(`Switched to ${account.label}`)
      setOpen(false)
    } catch (err: any) {
      toast.error(err.message || 'Switch failed')
    } finally {
      setSwitching(null)
    }
  }

  const getRolePages = (role: string) => {
    return NAV_ITEMS.filter(item => item.roles.includes(role)).map(item => item.label)
  }

  // Only show for Super Admin
  if (user?.role !== 'SUPER_ADMIN') return null

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1 text-xs"
      >
        <Zap className="h-3 w-3" />
        Quick Switch
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Quick Role Switcher
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            Switch between roles to explore what each RBAC level sees. Click any role to instantly login as that user.
          </p>

          <ScrollArea className="max-h-[60vh]">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {DEMO_ACCOUNTS.map((account) => {
                const isActive = user?.username === account.username
                const pages = getRolePages(account.role)

                return (
                  <Card
                    key={account.username}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      isActive ? 'ring-2' : 'hover:border-gray-400'
                    }`}
                    style={isActive ? { borderColor: account.color } : undefined}
                    onClick={() => !switching && quickSwitch(account)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <div
                              className="h-3 w-3 rounded-full shrink-0"
                              style={{ backgroundColor: account.color }}
                            />
                            <span className="font-medium text-sm truncate">
                              {account.label}
                            </span>
                            {isActive && (
                              <Badge variant="outline" className="text-[10px] shrink-0">
                                Active
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">
                            {account.description}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {pages.slice(0, 4).map((page) => (
                              <Badge key={page} variant="secondary" className="text-[10px]">
                                {page}
                              </Badge>
                            ))}
                            {pages.length > 4 && (
                              <Badge variant="secondary" className="text-[10px]">
                                +{pages.length - 4} more
                              </Badge>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </ScrollArea>

          <div className="flex items-center justify-between pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              Currently logged in as: <strong>{user?.name || 'None'}</strong>
            </p>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
