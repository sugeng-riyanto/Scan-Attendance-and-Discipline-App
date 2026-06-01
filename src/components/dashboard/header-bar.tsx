'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useAppStore } from '@/lib/stores/app-store'
import { SchoolConfigType } from '@/lib/types'
import { apiFetch } from '@/lib/api-fetch'
import { roleLabels } from '@/lib/attendance-utils'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Bell, LogOut, Wifi, WifiOff, RefreshCw, GraduationCap, Upload, Save, User } from 'lucide-react'
import { toast } from 'sonner'

export function HeaderBar({ schoolConfig, themeColor }: { schoolConfig: SchoolConfigType; themeColor: string }) {
  const { user, logout } = useAuthStore()
  const { notifications, markNotificationRead, unreadCount } = useAppStore()
  const [showNotif, setShowNotif] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const [pendingSync, setPendingSync] = useState(0)
  const [profileForm, setProfileForm] = useState({ name: '', currentPassword: '', newPassword: '', confirmPassword: '' })
  const [profilePhoto, setProfilePhoto] = useState<string>('')
  const [savingProfile, setSavingProfile] = useState(false)
  const unread = unreadCount()

  useEffect(() => {
    if (showProfile && user) {
      setProfileForm(p => ({ ...p, name: user.name }))
      setProfilePhoto(user.avatar || '')
    }
  }, [showProfile, user])

  const handleProfilePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => setProfilePhoto(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleRemovePhoto = () => setProfilePhoto('')

  const handleSaveProfile = async () => {
    setSavingProfile(true)
    try {
      const updates: any = { id: user?.id, name: profileForm.name }
      if (profilePhoto) updates.avatar = profilePhoto
      if (profileForm.newPassword) {
        if (profileForm.newPassword !== profileForm.confirmPassword) { toast.error('Konfirmasi password tidak cocok'); setSavingProfile(false); return }
        if (!profileForm.currentPassword) { toast.error('Masukkan password saat ini'); setSavingProfile(false); return }
        // Verify current password
        try {
          await apiFetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user?.username, password: profileForm.currentPassword }) })
        } catch { toast.error('Password saat ini salah'); setSavingProfile(false); return }
        updates.password = profileForm.newPassword
      }
      await apiFetch('/api/users', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) })
      // Update local store
      if (user) {
        useAuthStore.getState().updateUser({ name: profileForm.name, avatar: profilePhoto || undefined })
      }
      toast.success('Profil berhasil diperbarui')
      setShowProfile(false)
      setProfileForm({ name: '', currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err: any) { toast.error(err.message || 'Gagal menyimpan profil') }
    finally { setSavingProfile(false) }
  }

  const syncOfflineData = useCallback(async () => {
    try {
      const res = await fetch('/api/offline-sync', { method: 'POST' })
      const data = await res.json()
      if (data.syncedCount > 0) {
        toast.success(`${data.syncedCount} data berhasil disinkronkan`)
        setPendingSync(0)
      }
    } catch {}
  }, [])

  // Online/offline detection
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleOnline = () => {
      setIsOnline(true)
      toast.success('Koneksi internet kembali tersedia')
      syncOfflineData()
    }
    const handleOffline = () => {
      setIsOnline(false)
      toast.warning('Anda sedang offline. Data akan disimpan secara lokal.')
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    // Check pending sync periodically
    const checkSync = () => {
      fetch('/api/offline-sync').then(r => r.json()).then(data => setPendingSync(data.pendingCount || 0)).catch(() => {})
    }
    checkSync()
    const interval = setInterval(checkSync, 30000)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
    }
  }, [syncOfflineData])

  return (
    <header className="sticky top-0 z-40 bg-white border-b shadow-sm">
      <div className="flex items-center justify-between h-14 px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full text-white" style={{ backgroundColor: themeColor }}>
            {schoolConfig.school_logo ? (
              <img src={schoolConfig.school_logo} alt="Logo" className="h-5 w-5 rounded-full object-contain" />
            ) : (
              <GraduationCap className="h-5 w-5" />
            )}
          </div>
          <div className="hidden sm:block">
            <h1 className="text-sm font-bold" style={{ color: themeColor }}>{schoolConfig.school_name}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Online/Offline Indicator */}
          <div className="flex items-center gap-1">
            {isOnline ? (
              <Wifi className="h-4 w-4 text-green-500" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-500" />
            )}
            {!isOnline && <span className="text-xs text-red-500 font-medium hidden sm:inline">Offline</span>}
            {pendingSync > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs text-amber-600" onClick={syncOfflineData}>
                <RefreshCw className="h-3 w-3 mr-1" /> {pendingSync} sync
              </Button>
            )}
          </div>
          {/* Notifications */}
          <div className="relative">
            <Button variant="ghost" size="icon" className="relative min-h-[44px] min-w-[44px]" onClick={() => setShowNotif(!showNotif)}>
              <Bell className="h-5 w-5" />
              {unread > 0 && <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-[10px] text-white flex items-center justify-center">{unread}</span>}
            </Button>
            {showNotif && (
              <div className="absolute right-0 top-12 w-72 bg-white border rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
                <div className="p-3 border-b flex justify-between items-center">
                  <span className="font-semibold text-sm">Notifikasi</span>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setShowNotif(false)}>Tutup</Button>
                </div>
                {notifications.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">Tidak ada notifikasi</div>
                ) : (
                  notifications.slice(0, 20).map(n => (
                    <div key={n.id} className={`p-3 border-b cursor-pointer hover:bg-gray-50 ${!n.isRead ? 'bg-gray-50' : ''}`}
                      onClick={() => markNotificationRead(n.id)}>
                      <p className="text-sm">{n.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">{new Date(n.timestamp).toLocaleString('id-ID')}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          {/* User info */}
          <button className="flex items-center gap-2 cursor-pointer" onClick={() => setShowProfile(true)}>
            <Avatar className="h-8 w-8">
              {user?.avatar ? <AvatarImage src={user.avatar} /> : null}
              <AvatarFallback style={{ backgroundColor: themeColor + '20', color: themeColor }} className="text-xs">
                {user?.name?.charAt(0) || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="hidden md:block text-left">
              <p className="text-sm font-medium leading-none">{user?.name}</p>
              <p className="text-xs text-muted-foreground">{roleLabels[user?.role || ''] || user?.role}</p>
            </div>
          </button>
          <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]" onClick={() => { logout(); toast.success('Berhasil logout') }}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Profile Dialog */}
      <Dialog open={showProfile} onOpenChange={setShowProfile}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Profil Saya</DialogTitle><DialogDescription>Kelola informasi profil dan keamanan akun</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                {profilePhoto ? <AvatarImage src={profilePhoto} /> : null}
                <AvatarFallback className="text-xl" style={{ backgroundColor: themeColor + '20', color: themeColor }}>{user?.name?.charAt(0) || 'U'}</AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <input type="file" accept="image/*" className="hidden" id="profile-photo-upload" onChange={handleProfilePhotoUpload} />
                <Button variant="outline" size="sm" onClick={() => document.getElementById('profile-photo-upload')?.click()}>
                  <Upload className="h-3 w-3 mr-1" /> Upload Foto
                </Button>
                {profilePhoto && (
                  <Button variant="ghost" size="sm" className="text-red-500 text-xs h-7" onClick={handleRemovePhoto}>Hapus Foto</Button>
                )}
              </div>
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>Username: <span className="font-medium text-foreground">{user?.username}</span></p>
              <p>Role: <span className="font-medium text-foreground">{roleLabels[user?.role || ''] || user?.role}</span></p>
            </div>
            <div><Label className="text-xs">Nama</Label><Input value={profileForm.name} onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))} /></div>
            <Separator />
            <p className="text-sm font-medium">Ubah Password</p>
            <div><Label className="text-xs">Password Saat Ini</Label><Input type="password" value={profileForm.currentPassword} onChange={e => setProfileForm(p => ({ ...p, currentPassword: e.target.value }))} placeholder="Masukkan password saat ini" /></div>
            <div><Label className="text-xs">Password Baru</Label><Input type="password" value={profileForm.newPassword} onChange={e => setProfileForm(p => ({ ...p, newPassword: e.target.value }))} placeholder="Masukkan password baru" /></div>
            <div><Label className="text-xs">Konfirmasi Password Baru</Label><Input type="password" value={profileForm.confirmPassword} onChange={e => setProfileForm(p => ({ ...p, confirmPassword: e.target.value }))} placeholder="Konfirmasi password baru" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProfile(false)}>Batal</Button>
            <Button className="text-white" style={{ backgroundColor: themeColor }} onClick={handleSaveProfile} disabled={savingProfile}>
              {savingProfile ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  )
}
