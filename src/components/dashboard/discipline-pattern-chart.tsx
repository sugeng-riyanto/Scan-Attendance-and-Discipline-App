'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Copy } from 'lucide-react'
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { toast } from 'sonner'
import { ViolationRecord, GoodDeedRecord } from './types'

export function DisciplinePatternChart({ violations, goodDeeds, title }: {
  violations: ViolationRecord[]; goodDeeds: GoodDeedRecord[]; title?: string
}) {
  const violByDate = violations.reduce<Record<string, number>>((acc, v) => {
    const d = v.date?.toString().slice(0, 10) || ''
    acc[d] = (acc[d] || 0) + v.points
    return acc
  }, {})
  const goodByDate = goodDeeds.reduce<Record<string, number>>((acc, g) => {
    const d = g.date?.toString().slice(0, 10) || ''
    acc[d] = (acc[d] || 0) + g.points
    return acc
  }, {})
  const allDates = [...new Set([...Object.keys(violByDate), ...Object.keys(goodByDate)])].sort().slice(-14)
  const trendData = allDates.map(d => ({
    tanggal: d.slice(5), pelanggaran: violByDate[d] || 0, kebaikan: goodByDate[d] || 0
  }))

  const violByLevel = { RINGAN: 0, SEDANG: 0, BERAT: 0 }
  violations.forEach(v => {
    const lvl = (v.category?.level || 'RINGAN') as keyof typeof violByLevel
    if (lvl in violByLevel) violByLevel[lvl]++
  })
  const behaviorPie = [
    { name: 'Ringan', value: violByLevel.RINGAN, color: '#22c55e' },
    { name: 'Sedang', value: violByLevel.SEDANG, color: '#eab308' },
    { name: 'Berat', value: violByLevel.BERAT, color: '#ef4444' },
    { name: 'Kebaikan', value: goodDeeds.length, color: '#10b981' },
  ].filter(d => d.value > 0)

  if (violations.length === 0 && goodDeeds.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title || 'Pola Kedisiplinan'}</CardTitle>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => {
            const text = trendData.map(d => `${d.tanggal}: Pelanggaran ${d.pelanggaran}, Kebaikan ${d.kebaikan}`).join('\n')
            navigator.clipboard.writeText(text)
            toast.success('Data disalin ke clipboard')
          }}>
            <Copy className="h-3 w-3 mr-1" /> Salin
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {trendData.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Tren Poin Pelanggaran & Kebaikan</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trendData}><CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="tanggal" tick={{ fontSize: 10 }} /><YAxis /><Tooltip />
                  <Line type="monotone" dataKey="pelanggaran" stroke="#ef4444" name="Pelanggaran" />
                  <Line type="monotone" dataKey="kebaikan" stroke="#10b981" name="Kebaikan" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {behaviorPie.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Distribusi Perilaku</p>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart><Pie data={behaviorPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}>
                  {behaviorPie.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie><Tooltip /></PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
