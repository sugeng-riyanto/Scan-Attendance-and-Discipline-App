'use client'

import { useApiFetch } from './hooks/use-api-fetch'
import { format, addDays, subDays, startOfWeek, endOfWeek, isSameDay, getDay } from 'date-fns'
import { id } from 'date-fns/locale'
import { Calendar, Clock, MapPin, Shield, User, CheckSquare, Users, ChevronLeft, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useState } from 'react'

interface ScheduleItem {
  id: string
  dayOfWeek: number
  startTime: string
  endTime: string
  teacher: { id: string; name: string; role: string }
  location: string
  tasks: { label: string; isRequired: boolean }[]
  substitutes: any[]
}

const DAY_LABELS: Record<number, string> = { 1: 'Senin', 2: 'Selasa', 3: 'Rabu', 4: 'Kamis', 5: 'Jumat', 6: 'Sabtu', 7: 'Minggu' }

const getISODay = (d: Date) => d.getDay() === 0 ? 7 : d.getDay()

interface DutyScheduleWidgetProps {
  userId?: string
  role?: string
}

export function DutyScheduleWidget({ userId, role }: DutyScheduleWidgetProps) {
  const today = new Date()
  const todayDay = getISODay(today)
  const yesterdayDay = getISODay(subDays(today, 1))
  const tomorrowDay = getISODay(addDays(today, 1))

  const isFilteredTeacher = (role === 'GURU' || role === 'GURU_JAGA') && !!userId

  const { data, loading } = useApiFetch<{ schedules: ScheduleItem[] }>(
    isFilteredTeacher ? `/api/duty-schedule?teacherId=${userId}` : '/api/duty-schedule'
  )

  const schedules = data?.schedules ?? []

  const getSchedulesByDay = (day: number) =>
    schedules.filter((s) => s.dayOfWeek === day)

  const yesterdaySchedules = getSchedulesByDay(yesterdayDay)
  const todaySchedules = getSchedulesByDay(todayDay)
  const tomorrowSchedules = getSchedulesByDay(tomorrowDay)

  const weekStart = startOfWeek(today, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 })

  const weekDays: { day: number; label: string; date: Date }[] = []
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i)
    weekDays.push({ day: getISODay(d), label: DAY_LABELS[getISODay(d)], date: d })
  }

  if (loading) {
    return (
      <Card className="w-full overflow-hidden p-6">
        <p className="text-center text-muted-foreground">Memuat...</p>
      </Card>
    )
  }

  const ScheduleCard = ({ item }: { item: ScheduleItem }) => (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
        <span>
          {item.startTime} - {item.endTime}
        </span>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <User className="h-4 w-4 text-muted-foreground shrink-0" />
        <span>{item.teacher.name}</span>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
        <span>{item.location}</span>
      </div>
      {item.tasks.length > 0 && (
        <div className="space-y-1 pt-1">
          {item.tasks.map((task, idx) => (
            <div key={idx} className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckSquare className="h-3 w-3 shrink-0" />
              <span>
                {task.label}
                {task.isRequired && <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">wajib</Badge>}
              </span>
            </div>
          ))}
        </div>
      )}
      {item.substitutes.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Users className="h-3 w-3 shrink-0" />
          <span>{item.substitutes.length} pengganti</span>
        </div>
      )}
    </div>
  )

  const Section = ({ title, schedules, day }: { title: string; schedules: ScheduleItem[]; day: number }) => (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge variant="secondary" className="text-xs">{DAY_LABELS[day]}</Badge>
      </div>
      {schedules.length === 0 ? (
        <p className="text-sm text-muted-foreground">Tidak ada jadwal</p>
      ) : (
        <div className="grid gap-3">
          {schedules.map((item) => (
            <ScheduleCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )

  const WeekSection = () => {
    const [currentWeekOffset, setCurrentWeekOffset] = useState(0)
    const weekBase = addDays(today, currentWeekOffset * 7)

    const ws = startOfWeek(weekBase, { weekStartsOn: 1 })
    const we = endOfWeek(weekBase, { weekStartsOn: 1 })

    const weekDaysLocal: { day: number; label: string; date: Date }[] = []
    for (let i = 0; i < 7; i++) {
      const d = addDays(ws, i)
      weekDaysLocal.push({ day: getISODay(d), label: DAY_LABELS[getISODay(d)], date: d })
    }

    const weekLabel = `${format(ws, 'd MMM', { locale: id })} - ${format(we, 'd MMM yyyy', { locale: id })}`

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setCurrentWeekOffset((p) => p - 1)}
            className="p-1 hover:bg-accent rounded-md transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium">{weekLabel}</span>
          <button
            onClick={() => setCurrentWeekOffset((p) => p + 1)}
            className="p-1 hover:bg-accent rounded-md transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {weekDaysLocal.map(({ day, label, date }) => {
          const daySchedules = getSchedulesByDay(day)
          const isToday = isSameDay(date, today)
          return (
            <div key={day} className="space-y-2">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold">{label}</h4>
                {isToday && <Badge className="text-xs">Hari ini</Badge>}
              </div>
              {daySchedules.length === 0 ? (
                <p className="text-xs text-muted-foreground pl-1">Tidak ada jadwal</p>
              ) : (
                <div className="grid gap-2">
                  {daySchedules.map((item) => (
                    <ScheduleCard key={item.id} item={item} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <Card className="w-full overflow-hidden">
      <div className="p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Jadwal Piket</h2>
        </div>

        <Tabs defaultValue="today" className="w-full">
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="yesterday" className="text-xs sm:text-sm">Kemarin</TabsTrigger>
            <TabsTrigger value="today" className="text-xs sm:text-sm">Hari Ini</TabsTrigger>
            <TabsTrigger value="tomorrow" className="text-xs sm:text-sm">Besok</TabsTrigger>
            <TabsTrigger value="week" className="text-xs sm:text-sm">Minggu Ini</TabsTrigger>
          </TabsList>
          <TabsContent value="yesterday" className="mt-4">
            <Section title="Kemarin" schedules={yesterdaySchedules} day={yesterdayDay} />
          </TabsContent>
          <TabsContent value="today" className="mt-4">
            <Section title="Hari Ini" schedules={todaySchedules} day={todayDay} />
          </TabsContent>
          <TabsContent value="tomorrow" className="mt-4">
            <Section title="Besok" schedules={tomorrowSchedules} day={tomorrowDay} />
          </TabsContent>
          <TabsContent value="week" className="mt-4">
            <WeekSection />
          </TabsContent>
        </Tabs>
      </div>
    </Card>
  )
}
