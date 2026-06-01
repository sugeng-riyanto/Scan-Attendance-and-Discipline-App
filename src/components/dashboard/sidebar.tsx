'use client'

import { useAuthStore } from '@/lib/stores/auth-store'
import { useAppStore } from '@/lib/stores/app-store'
import { SchoolConfigType } from '@/lib/types'
import { NAV_ITEMS } from '@/components/dashboard/nav-config'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { GraduationCap, X } from 'lucide-react'

export function Sidebar({ schoolConfig, themeColor }: { schoolConfig: SchoolConfigType; themeColor: string }) {
  const { user } = useAuthStore()
  const { activePage, setActivePage, sidebarOpen, setSidebarOpen } = useAppStore()
  if (!user) return null

  const items = NAV_ITEMS.filter(n => n.roles.includes(user.role))

  return (
    <aside className={`fixed inset-y-0 left-0 z-30 w-64 bg-white border-r transform transition-transform duration-200 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex items-center justify-between h-14 px-4 border-b">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full text-white" style={{ backgroundColor: themeColor }}>
            {schoolConfig.school_logo ? (
              <img src={schoolConfig.school_logo} alt="Logo" className="h-5 w-5 rounded-full object-contain" />
            ) : (
              <GraduationCap className="h-5 w-5" />
            )}
          </div>
          <span className="font-bold" style={{ color: themeColor }}>{schoolConfig.school_name.split(' ').pop()}</span>
        </div>
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(false)}>
          <X className="h-5 w-5" />
        </Button>
      </div>
      <ScrollArea className="h-[calc(100vh-3.5rem)]">
        <nav className="p-3 space-y-1">
          {items.map(item => (
            <button key={item.id}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                activePage === item.id ? 'font-semibold' : 'text-gray-600 hover:bg-gray-50'
              }`}
              style={activePage === item.id ? { backgroundColor: themeColor + '15', color: themeColor } : {}}
              onClick={() => { if (item.id === 'discipline-scan') { window.location.href = '/scan-discipline'; return } setActivePage(item.id); setSidebarOpen(false) }}>
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
      </ScrollArea>
    </aside>
  )
}
