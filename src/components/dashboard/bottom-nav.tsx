'use client'

import { useAuthStore } from '@/lib/stores/auth-store'
import { useAppStore } from '@/lib/stores/app-store'
import { NAV_ITEMS, MOBILE_NAV_IDS } from '@/components/dashboard/nav-config'

export function BottomNav({ themeColor }: { themeColor: string }) {
  const { user } = useAuthStore()
  const { activePage, setActivePage } = useAppStore()
  if (!user) return null

  const items = NAV_ITEMS.filter(n => n.roles.includes(user.role) && MOBILE_NAV_IDS.includes(n.id))

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t lg:hidden safe-area-bottom">
      <div className="flex items-center justify-around h-16">
        {items.map(item => (
          <button key={item.id}
            className="flex flex-col items-center justify-center py-1 px-3 min-w-[56px]"
            style={{ color: activePage === item.id ? themeColor : '#9ca3af' }}
            onClick={() => { if (item.id === 'discipline-scan') { window.location.href = '/scan-discipline'; return } setActivePage(item.id) }}>
            {item.icon}
            <span className="text-[10px] mt-1">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}
