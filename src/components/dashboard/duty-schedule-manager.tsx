'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Trash2, Edit, Calendar, Clock, MapPin, CheckSquare, X, Save, Users, Shield, AlertCircle, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api-fetch'

interface DutyTask {
  label: string
  isRequired: boolean
}

interface DutySubstituteItem {
  id: string
  dutyScheduleId: string
  substituteTeacherId: string
  substituteTeacher: { id: string; name: string; role: string }
  originalTeacherId: string
  originalTeacher: { id: string; name: string; role: string }
  substituteDate: string
  reason: string | null
}

interface DutyScheduleItem {
  id: string
  dayOfWeek: number
  startTime: string
  endTime: string
  teacherId: string
  teacher: { id: string; name: string; role: string }
  location: string
  tasks: DutyTask[]
  isActive: boolean
  substitutes: DutySubstituteItem[]
}

interface User {
  id: string
  name: string
  role: string
}

interface SchoolConfig {
  id: string
  key: string
  value: string
}

const DAY_LABELS: Record<number, string> = { 1: 'Senin', 2: 'Selasa', 3: 'Rabu', 4: 'Kamis', 5: 'Jumat', 6: 'Sabtu', 7: 'Minggu' }

const ALLOWED_ROLES = ['GURU', 'GURU_JAGA', 'WALI_KELAS']

const generateTimeOptions = () => {
  const options: string[] = []
  for (let h = 6; h <= 18; h++) {
    for (let m = 0; m < 60; m += 5) {
      options.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }
  return options
}

const TIME_OPTIONS = generateTimeOptions()

const EMPTY_TASK: DutyTask = { label: '', isRequired: false }

export default function DutyScheduleManager() {
  const [schedules, setSchedules] = useState<DutyScheduleItem[]>([])
  const [teachers, setTeachers] = useState<User[]>([])
  const [workDays, setWorkDays] = useState(5)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<DutyScheduleItem | null>(null)
  const [showSubstituteModal, setShowSubstituteModal] = useState(false)
  const [substituteSchedule, setSubstituteSchedule] = useState<DutyScheduleItem | null>(null)

  const [formDay, setFormDay] = useState(1)
  const [formStartTime, setFormStartTime] = useState('07:00')
  const [formEndTime, setFormEndTime] = useState('08:00')
  const [formTeacherId, setFormTeacherId] = useState('')
  const [formLocation, setFormLocation] = useState('')
  const [formTasks, setFormTasks] = useState<DutyTask[]>([{ ...EMPTY_TASK }])
  const [saving, setSaving] = useState(false)

  const [subDate, setSubDate] = useState('')
  const [subTeacherId, setSubTeacherId] = useState('')
  const [subReason, setSubReason] = useState('')
  const [savingSub, setSavingSub] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [schedRes, usersRes, configRes] = await Promise.all([
        apiFetch('/api/duty-schedule'),
        apiFetch('/api/users'),
        apiFetch('/api/school-config'),
      ])

      const schedData = schedRes as { schedules: DutyScheduleItem[] }
      const usersData = usersRes as { users: User[] } | User[]
      const configData = configRes as { configs: SchoolConfig[] } | SchoolConfig[]

      setSchedules(schedData.schedules || [])

      const usersList = Array.isArray(usersData)
        ? usersData
        : (usersData as { users: User[] }).users || []
      setTeachers(usersList.filter((u: User) => ALLOWED_ROLES.includes(u.role)))

      const configsList = Array.isArray(configData)
        ? configData
        : (configData as { configs: SchoolConfig[] }).configs || []
      const dutyDays = configsList.find((c: SchoolConfig) => c.key === 'duty_work_days')
      setWorkDays(dutyDays ? Number(dutyDays.value) : 5)
    } catch {
      toast.error('Gagal memuat data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const daysToShow = workDays === 6 ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5]

  const schedulesByDay: Record<number, DutyScheduleItem[]> = {}
  daysToShow.forEach((d) => {
    schedulesByDay[d] = schedules.filter((s) => s.dayOfWeek === d)
  })

  const resetForm = () => {
    setFormDay(1)
    setFormStartTime('07:00')
    setFormEndTime('08:00')
    setFormTeacherId('')
    setFormLocation('')
    setFormTasks([{ ...EMPTY_TASK }])
    setEditingSchedule(null)
  }

  const openAddModal = () => {
    resetForm()
    setShowModal(true)
  }

  const openEditModal = (schedule: DutyScheduleItem) => {
    setEditingSchedule(schedule)
    setFormDay(schedule.dayOfWeek)
    setFormStartTime(schedule.startTime)
    setFormEndTime(schedule.endTime)
    setFormTeacherId(schedule.teacherId)
    setFormLocation(schedule.location)
    setFormTasks(schedule.tasks.length > 0 ? schedule.tasks.map((t) => ({ ...t })) : [{ ...EMPTY_TASK }])
    setShowModal(true)
  }

  const addTask = () => {
    setFormTasks((prev) => [...prev, { ...EMPTY_TASK }])
  }

  const removeTask = (index: number) => {
    setFormTasks((prev) => prev.filter((_, i) => i !== index))
  }

  const updateTask = (index: number, field: keyof DutyTask, value: string | boolean) => {
    setFormTasks((prev) =>
      prev.map((t, i) => (i === index ? { ...t, [field]: value } : t))
    )
  }

  const handleSave = async () => {
    if (!formTeacherId) {
      toast.error('Pilih guru terlebih dahulu')
      return
    }
    if (!formLocation.trim()) {
      toast.error('Lokasi harus diisi')
      return
    }
    const validTasks = formTasks.filter((t) => t.label.trim())
    if (validTasks.length === 0) {
      toast.error('Tambahkan minimal satu tugas')
      return
    }

    setSaving(true)
    try {
      const payload = {
        dayOfWeek: formDay,
        startTime: formStartTime,
        endTime: formEndTime,
        teacherId: formTeacherId,
        location: formLocation,
        tasks: validTasks,
      }

      if (editingSchedule) {
        await apiFetch(`/api/duty-schedule/${editingSchedule.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
        toast.success('Jadwal berhasil diperbarui')
      } else {
        await apiFetch('/api/duty-schedule', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        toast.success('Jadwal berhasil ditambahkan')
      }

      setShowModal(false)
      resetForm()
      await fetchData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan jadwal'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Yakin ingin menghapus jadwal ini?')) return
    try {
      await apiFetch(`/api/duty-schedule/${id}`, { method: 'DELETE' })
      toast.success('Jadwal berhasil dihapus')
      await fetchData()
    } catch {
      toast.error('Gagal menghapus jadwal')
    }
  }

  const openSubstituteModal = (schedule: DutyScheduleItem) => {
    setSubstituteSchedule(schedule)
    setSubDate('')
    setSubTeacherId('')
    setSubReason('')
    setShowSubstituteModal(true)
  }

  const handleAddSubstitute = async () => {
    if (!subDate || !subTeacherId || !substituteSchedule) {
      toast.error('Lengkapi semua field')
      return
    }
    setSavingSub(true)
    try {
      await apiFetch('/api/duty-schedule/substitute', {
        method: 'POST',
        body: JSON.stringify({
          dutyScheduleId: substituteSchedule.id,
          substituteTeacherId: subTeacherId,
          substituteDate: subDate,
          reason: subReason || null,
        }),
      })
      toast.success('Guru pengganti berhasil ditambahkan')
      setShowSubstituteModal(false)
      setSubstituteSchedule(null)
      await fetchData()
    } catch {
      toast.error('Gagal menambahkan guru pengganti')
    } finally {
      setSavingSub(false)
    }
  }

  const handleDeleteSubstitute = async (subId: string) => {
    if (!confirm('Yakin ingin menghapus jadwal pengganti ini?')) return
    try {
      await apiFetch(`/api/duty-schedule/substitute?id=${subId}`, { method: 'DELETE' })
      toast.success('Jadwal pengganti berhasil dihapus')
      await fetchData()
    } catch {
      toast.error('Gagal menghapus jadwal pengganti')
    }
  }

  const handleToggleWorkDays = async (newValue: number) => {
    try {
      const configs = (await apiFetch('/api/school-config')) as { configs: SchoolConfig[] } | SchoolConfig[]
      const configsList = Array.isArray(configs) ? configs : configs.configs || []
      const existing = configsList.find((c: SchoolConfig) => c.key === 'duty_work_days')

      if (existing) {
        await apiFetch('/api/school-config', {
          method: 'POST',
          body: JSON.stringify({ key: 'duty_work_days', value: String(newValue) }),
        })
      } else {
        await apiFetch('/api/school-config', {
          method: 'POST',
          body: JSON.stringify({ key: 'duty_work_days', value: String(newValue) }),
        })
      }

      setWorkDays(newValue)
      toast.success('Hari kerja berhasil diperbarui')
    } catch {
      toast.error('Gagal menyimpan konfigurasi')
    }
  }

  const formatTime = (t: string) => {
    const parts = t.split(':')
    if (parts.length === 2) return `${parts[0]}.${parts[1]}`
    return t
  }

  const getTeacherName = (teacherId: string) => {
    const teacher = teachers.find((t) => t.id === teacherId)
    return teacher ? teacher.name : '(Tidak diketahui)'
  }

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="p-6 text-center text-muted-foreground">Loading...</CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-xl font-semibold flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Manajemen Jadwal Guru Jaga
          </CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Hari Kerja:</span>
              <div className="flex items-center gap-1">
                <Button
                  variant={workDays === 5 ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => handleToggleWorkDays(5)}
                >
                  Sen-Jum
                </Button>
                <Button
                  variant={workDays === 6 ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => handleToggleWorkDays(6)}
                >
                  Sen-Sab
                </Button>
              </div>
            </div>
            <Button onClick={openAddModal} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Tambah Jadwal
            </Button>
          </div>
        </CardHeader>
      </Card>

      {daysToShow.map((day) => {
        const daySchedules = schedulesByDay[day] || []
        if (daySchedules.length === 0 && day === daysToShow[daysToShow.length - 1] && daysToShow.every((d) => (schedulesByDay[d] || []).length === 0)) {
          return null
        }

        return (
          <Card key={day}>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {DAY_LABELS[day]}
                <Badge variant="secondary" className="ml-2 text-xs">
                  {daySchedules.length} jadwal
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {daySchedules.length === 0 ? (
                <div className="text-sm text-muted-foreground p-4">Belum ada jadwal</div>
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-3 font-medium">Jam</th>
                          <th className="text-left p-3 font-medium">Guru</th>
                          <th className="text-left p-3 font-medium">Lokasi</th>
                          <th className="text-left p-3 font-medium">Tugas</th>
                          <th className="text-right p-3 font-medium">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {daySchedules.map((schedule) => (
                          <tr key={schedule.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="p-3">
                              <div className="flex items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span>
                                  {formatTime(schedule.startTime)} - {formatTime(schedule.endTime)}
                                </span>
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span>{getTeacherName(schedule.teacherId)}</span>
                                {schedule.substitutes.length > 0 && (
                                  <Badge variant="outline" className="text-[10px] h-5">
                                    {schedule.substitutes.length} pengganti
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-1.5">
                                <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span>{schedule.location}</span>
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="flex flex-wrap gap-1">
                                {schedule.tasks.map((task, idx) => (
                                  <Badge
                                    key={idx}
                                    variant={task.isRequired ? 'default' : 'secondary'}
                                    className="text-[10px] h-5"
                                  >
                                    {task.isRequired && <AlertCircle className="h-3 w-3 mr-0.5" />}
                                    {task.label}
                                  </Badge>
                                ))}
                              </div>
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => openSubstituteModal(schedule)}
                                  title="Ganti Guru"
                                >
                                  <UserPlus className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => openEditModal(schedule)}
                                  title="Edit"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => handleDelete(schedule.id)}
                                  title="Hapus"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="md:hidden space-y-2 p-2">
                    {daySchedules.map((schedule) => (
                      <Card key={schedule.id} className="border shadow-sm">
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-sm font-medium">
                              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                              {formatTime(schedule.startTime)} - {formatTime(schedule.endTime)}
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => openSubstituteModal(schedule)}
                                title="Ganti Guru"
                              >
                                <UserPlus className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => openEditModal(schedule)}
                                title="Edit"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => handleDelete(schedule.id)}
                                title="Hapus"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 text-sm">
                            <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            {getTeacherName(schedule.teacherId)}
                            {schedule.substitutes.length > 0 && (
                              <Badge variant="outline" className="text-[10px] h-5 ml-1">
                                {schedule.substitutes.length} pengganti
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5 shrink-0" />
                            {schedule.location}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {schedule.tasks.map((task, idx) => (
                              <Badge
                                key={idx}
                                variant={task.isRequired ? 'default' : 'secondary'}
                                className="text-[10px] h-5"
                              >
                                {task.isRequired && <AlertCircle className="h-3 w-3 mr-0.5" />}
                                {task.label}
                              </Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )
      })}

      {daysToShow.every((d) => (schedulesByDay[d] || []).length === 0) && (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            <Shield className="h-8 w-8 mx-auto mb-2 opacity-40" />
            Belum ada jadwal
          </CardContent>
        </Card>
      )}

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingSchedule ? 'Edit Jadwal' : 'Tambah Jadwal'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Hari</Label>
              <Select
                value={String(formDay)}
                onValueChange={(v) => setFormDay(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih hari" />
                </SelectTrigger>
                <SelectContent>
                  {daysToShow.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {DAY_LABELS[d]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Jam Mulai</Label>
                <Select value={formStartTime} onValueChange={setFormStartTime}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih jam" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {TIME_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Jam Selesai</Label>
                <Select value={formEndTime} onValueChange={setFormEndTime}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih jam" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {TIME_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Guru</Label>
              <Select value={formTeacherId} onValueChange={setFormTeacherId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih guru" />
                </SelectTrigger>
                <SelectContent>
                  {teachers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Lokasi</Label>
              <Input
                value={formLocation}
                onChange={(e) => setFormLocation(e.target.value)}
                placeholder="Contoh: Depan Gerbang Utama"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Daftar Tugas</Label>
                <Button variant="outline" size="sm" onClick={addTask} type="button">
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Tambah Tugas
                </Button>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {formTasks.map((task, idx) => (
                  <div key={idx} className="flex items-start gap-2 p-2 border rounded-md">
                    <div className="flex-1 space-y-1">
                      <Input
                        value={task.label}
                        onChange={(e) => updateTask(idx, 'label', e.target.value)}
                        placeholder="Nama tugas"
                      />
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={task.isRequired}
                          onChange={(e) => updateTask(idx, 'isRequired', e.target.checked)}
                          className="rounded border-gray-300"
                        />
                        Wajib
                      </label>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 mt-1 text-destructive hover:text-destructive"
                      onClick={() => removeTask(idx)}
                      type="button"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Batal
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-1" />
              {saving ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSubstituteModal} onOpenChange={setShowSubstituteModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Guru Pengganti -{' '}
              {substituteSchedule
                ? `${DAY_LABELS[substituteSchedule.dayOfWeek]} ${formatTime(substituteSchedule.startTime)}-${formatTime(substituteSchedule.endTime)}`
                : ''}
            </DialogTitle>
          </DialogHeader>

          {substituteSchedule && substituteSchedule.substitutes.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Riwayat Pengganti</Label>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {substituteSchedule.substitutes.map((sub) => (
                  <div key={sub.id} className="flex items-center justify-between p-2 border rounded-md text-sm">
                    <div>
                      <div className="font-medium">
                        {sub.substituteTeacher.name}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {sub.substituteDate} - {sub.reason || 'Tidak ada alasan'}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteSubstitute(sub.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tanggal</Label>
              <Input
                type="date"
                value={subDate}
                onChange={(e) => setSubDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Guru Pengganti</Label>
              <Select value={subTeacherId} onValueChange={setSubTeacherId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih guru" />
                </SelectTrigger>
                <SelectContent>
                  {teachers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Alasan (opsional)</Label>
              <Textarea
                value={subReason}
                onChange={(e) => setSubReason(e.target.value)}
                placeholder="Alasan pergantian"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubstituteModal(false)}>
              Tutup
            </Button>
            <Button onClick={handleAddSubstitute} disabled={savingSub}>
              <UserPlus className="h-4 w-4 mr-1" />
              {savingSub ? 'Menyimpan...' : 'Tambah Pengganti'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
