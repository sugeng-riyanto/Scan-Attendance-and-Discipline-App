'use client'

import React, { useState, useEffect } from 'react'
import { apiFetch } from '@/lib/api-fetch'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollText, CheckCircle, Clock, AlertTriangle } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'

const COLORS = ['#10b981', '#f59e0b', '#ef4444'] // green, amber, red

/** Dark-mode-aware custom tooltip for the pie chart */
function DarkTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md dark:border-gray-700 dark:bg-gray-800">
      <p className="font-medium text-gray-900 dark:text-gray-100">{d.name}</p>
      <p className="text-gray-600 dark:text-gray-400">{d.value} users ({((d.value / (payload[0]?.payload?.total || d.value)) * 100).toFixed(0)}%)</p>
    </div>
  )
}

/**
 * Dashboard widget showing T&C acceptance progress as a pie chart.
 * Shows accepted vs pending users with a clickable link to the full
 * Terms page acceptance panel.
 */
export function TcAcceptanceWidget({ themeColor }: { themeColor?: string }) {
  const [data, setData] = useState<{ total: number; accepted: number; pending: number; version: number } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch<{ terms: { version: number } | null }>('/api/terms-content')
      .then(termsRes => {
        if (!termsRes?.terms) { setLoading(false); return }
        const version = termsRes.terms.version
        return apiFetch<{ total: number; accepted: number; pending: number }>('/api/terms-content?acceptance=true')
          .then(accRes => {
            setData({ total: accRes.total, accepted: accRes.accepted, pending: accRes.pending, version })
          })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading || !data || data.total === 0) return null

  const pieData = [
    { name: 'Accepted', value: data.accepted, color: COLORS[0] },
    { name: 'Pending', value: data.pending, color: COLORS[1] },
  ]

  const percent = data.total > 0 ? Math.round((data.accepted / data.total) * 100) : 0

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow dark:hover:shadow-lg dark:hover:shadow-gray-900/20"
      onClick={() => useAppStore.getState().setActivePage('terms')}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <ScrollText className="h-4 w-4" style={{ color: themeColor || '#10b981' }} />
          T&C Acceptance — v{data.version}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ResponsiveContainer width="100%" height={140}>
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={55}
              innerRadius={30}
              label={({ name, percent: p, x, y }: any) => (
                <text x={x} y={y} fill="currentColor" textAnchor="middle" dominantBaseline="central" className="fill-gray-700 dark:fill-gray-300" fontSize={11} fontWeight={500}>
                  {`${name} ${(p * 100).toFixed(0)}%`}
                </text>
              )}
              labelLine={false}
              stroke="hsl(var(--background))"
              strokeWidth={2}
            >
              {pieData.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
            <Tooltip content={<DarkTooltip />} />
          </PieChart>
        </ResponsiveContainer>

        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg border p-2">
            <p className="text-lg font-bold">{data.total}</p>
            <p className="text-muted-foreground">Total</p>
          </div>
          <div className="rounded-lg border border-green-200 bg-green-50 p-2 dark:border-green-800 dark:bg-green-950/30">
            <p className="text-lg font-bold text-green-700 dark:text-green-400">{data.accepted}</p>
            <p className="text-green-600 dark:text-green-500">Accepted</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 dark:border-amber-800 dark:bg-amber-950/30">
            <p className="text-lg font-bold text-amber-700 dark:text-amber-400">{data.pending}</p>
            <p className="text-amber-600 dark:text-amber-500">Pending</p>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{percent}% accepted</span>
          <span className="flex items-center gap-1">
            {percent >= 90 ? (
              <CheckCircle className="h-3 w-3 text-green-500" />
            ) : percent >= 50 ? (
              <Clock className="h-3 w-3 text-amber-500" />
            ) : (
              <AlertTriangle className="h-3 w-3 text-red-500" />
            )}
            Click to manage →
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
