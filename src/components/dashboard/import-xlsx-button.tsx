'use client'

import React, { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { FileSpreadsheet, Upload, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api-fetch'

export function ImportXlsxButton({ type, classId, academicYearId, onDone }: {
  type: 'students' | 'users' | 'violation-categories' | 'good-deed-categories'
  classId?: string; academicYearId?: string; onDone?: () => void
}) {
  const [importing, setImporting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', type)
      if (classId) formData.append('classId', classId)
      if (academicYearId) formData.append('academicYearId', academicYearId)
      const res = await apiFetch<{ message: string; imported: number; errors?: string[] }>('/api/import', {
        method: 'POST', body: formData
      })
      toast.success(res.message)
      if (res.errors && res.errors.length > 0) {
        res.errors.slice(0, 5).forEach(err => toast.error(err))
      }
      onDone?.()
    } catch (err: any) { toast.error(err.message || 'Gagal import') }
    finally { setImporting(false); if (inputRef.current) inputRef.current.value = '' }
  }
  return (
    <>
      <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
      <a href={`/api/import-template?type=${type}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-2 py-1 text-xs border rounded-md hover:bg-gray-50">
        <FileSpreadsheet className="h-3 w-3 mr-1" /> Template
      </a>
      <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={importing}>
        {importing ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
        Import XLSX
      </Button>
    </>
  )
}
