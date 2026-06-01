'use client'

import React from 'react'
import { useAppStore } from '@/lib/stores/app-store'
import { formatTimeWIB, formatDateShort, getStatusColor, getBehaviorLevel, getViolationLevelColor } from '@/lib/attendance-utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { ChevronLeft } from 'lucide-react'
import { Student, AttendanceRecord, ViolationRecord, GoodDeedRecord } from './types'
import { useApiFetch } from './hooks/use-api-fetch'

export function StudentProfilePage() {
  const { selectedStudentId, setSelectedStudentId, setActivePage } = useAppStore()
  const { data: studentsData } = useApiFetch<{ students: Student[] }>(`/api/students?search=`)
  const student = studentsData?.students?.find(s => s.id === selectedStudentId)

  const { data: attData } = useApiFetch<{ attendances: AttendanceRecord[] }>(
    student ? `/api/attendance?studentId=${student.id}` : null, [student?.id]
  )
  const { data: violData } = useApiFetch<{ violations: ViolationRecord[] }>(
    student ? `/api/violations?studentId=${student.id}` : null, [student?.id]
  )
  const { data: goodData } = useApiFetch<{ goodDeeds: GoodDeedRecord[] }>(
    student ? `/api/good-deeds?studentId=${student.id}` : null, [student?.id]
  )

  if (!student) return <Card><CardContent className="p-8 text-center text-muted-foreground">Pilih siswa untuk melihat profil</CardContent></Card>

  const bl = getBehaviorLevel(student.totalViolationPoints)
  const netPoints = student.totalGoodPoints - student.totalViolationPoints

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={() => setActivePage('dashboard')}>
        <ChevronLeft className="h-4 w-4 mr-1" /> Kembali
      </Button>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16"><AvatarFallback className="bg-emerald-100 text-emerald-700 text-2xl">{student.name.charAt(0)}</AvatarFallback></Avatar>
            <div>
              <h3 className="text-lg font-bold">{student.name}</h3>
              <p className="text-sm text-muted-foreground">NISN: {student.nisn} • {student.class?.name}</p>
              {student.gender && <p className="text-xs text-muted-foreground">{student.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</p>}
            </div>
          </div>

          <div className="mt-4 p-3 rounded-lg bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Level Perilaku</span>
              <Badge className={`${bl.color} text-sm`}>{bl.label} - {bl.handler}</Badge>
            </div>
            <Progress value={Math.min((student.totalViolationPoints / 200) * 100, 100)}
              className="h-3" />
            <div className="flex justify-between mt-1 text-xs text-muted-foreground">
              <span>0</span><span>50</span><span>100</span><span>150</span><span>200+</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="text-center p-2 bg-red-50 rounded"><p className="text-xl font-bold text-red-600">{student.totalViolationPoints}</p><p className="text-xs">Poin Pelanggaran</p></div>
            <div className="text-center p-2 bg-yellow-50 rounded"><p className="text-xl font-bold text-yellow-600">{student.totalGoodPoints}</p><p className="text-xs">Poin Kebaikan</p></div>
            <div className="text-center p-2 bg-emerald-50 rounded"><p className={`text-xl font-bold ${netPoints >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{netPoints}</p><p className="text-xs">Poin Bersih</p></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Kehadiran Bulan Ini</CardTitle></CardHeader>
        <CardContent>
          <ScrollArea className="max-h-48">
            {(attData?.attendances || []).slice(0, 15).map(a => (
              <div key={a.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <span className="text-sm">{formatDateShort(a.date)}</span>
                <div className="flex items-center gap-2">
                  {a.checkInTime && <span className="text-xs text-muted-foreground">{formatTimeWIB(a.checkInTime)}</span>}
                  <Badge className={getStatusColor(a.status as any)}>{a.status}</Badge>
                </div>
              </div>
            ))}
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Riwayat Pelanggaran</CardTitle></CardHeader>
        <CardContent>
          {(violData?.violations || []).length > 0 ? (
            <ScrollArea className="max-h-48">
              {(violData?.violations || []).map(v => (
                <div key={v.id} className="py-2 border-b last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{v.category?.name}</span>
                    <Badge className={getViolationLevelColor(v.category?.level || '')}>{v.points} poin</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{formatDateShort(v.date)} {v.description && `• ${v.description}`}</p>
                </div>
              ))}
            </ScrollArea>
          ) : <p className="text-center text-muted-foreground py-4">Tidak ada pelanggaran</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Riwayat Kebaikan</CardTitle></CardHeader>
        <CardContent>
          {(goodData?.goodDeeds || []).length > 0 ? (
            <ScrollArea className="max-h-48">
              {(goodData?.goodDeeds || []).map(g => (
                <div key={g.id} className="py-2 border-b last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{g.category?.name}</span>
                    <Badge className="bg-emerald-100 text-emerald-800">{g.points} poin</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{formatDateShort(g.date)} {g.description && `• ${g.description}`}</p>
                </div>
              ))}
            </ScrollArea>
          ) : <p className="text-center text-muted-foreground py-4">Tidak ada kebaikan</p>}
        </CardContent>
      </Card>
    </div>
  )
}
