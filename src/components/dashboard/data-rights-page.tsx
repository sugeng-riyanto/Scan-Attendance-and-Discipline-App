'use client'

import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { FileText, Download, Trash2, AlertTriangle, CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react'
import { apiFetch } from '@/lib/api-fetch'

interface DataRightsRequest {
  id: string
  userId: string
  schoolId: string | null
  type: string
  status: string
  details: string | null
  adminNotes: string | null
  processedBy: string | null
  processedAt: string | null
  createdAt: string
  user: { id: string; name: string; username: string; role: string }
}

const TYPE_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  EXPORT: { label: 'Data Export', icon: <Download className="h-4 w-4" />, color: 'text-blue-600 dark:text-blue-400' },
  CORRECTION: { label: 'Data Correction', icon: <FileText className="h-4 w-4" />, color: 'text-amber-600 dark:text-amber-400' },
  DELETION: { label: 'Data Deletion', icon: <Trash2 className="h-4 w-4" />, color: 'text-red-600 dark:text-red-400' },
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Pending', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  APPROVED: { label: 'Approved', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  REJECTED: { label: 'Rejected', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  COMPLETED: { label: 'Completed', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
}

export function DataRightsPage() {
  const [requests, setRequests] = useState<DataRightsRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [selectedRequest, setSelectedRequest] = useState<DataRightsRequest | null>(null)
  const [actionDialog, setActionDialog] = useState(false)
  const [actionType, setActionType] = useState<'APPROVED' | 'REJECTED' | 'COMPLETED'>('APPROVED')
  const [adminNotes, setAdminNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const fetchRequests = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      if (typeFilter !== 'ALL') params.set('type', typeFilter)
      const data = await apiFetch<{ requests: DataRightsRequest[] }>(`/api/data-rights?${params}`)
      setRequests(data.requests)
    } catch (err: any) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchRequests() }, [statusFilter, typeFilter])

  const handleAction = async () => {
    if (!selectedRequest) return
    setBusy(true)
    try {
      await apiFetch('/api/data-rights', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedRequest.id, status: actionType, adminNotes }),
      })
      toast.success(`Request ${actionType.toLowerCase()}`)
      setActionDialog(false)
      setSelectedRequest(null)
      setAdminNotes('')
      fetchRequests()
    } catch (err: any) { toast.error(err.message) }
    finally { setBusy(false) }
  }

  const counts = {
    PENDING: requests.filter(r => r.status === 'PENDING').length,
    APPROVED: requests.filter(r => r.status === 'APPROVED').length,
    REJECTED: requests.filter(r => r.status === 'REJECTED').length,
    COMPLETED: requests.filter(r => r.status === 'COMPLETED').length,
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            Data Rights Requests (UU PDP)
          </h2>
          <p className="text-sm text-muted-foreground">Manage user data access, correction, and deletion requests per UU PDP No. 27/2022.</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchRequests}><RefreshCw className="h-4 w-4 mr-1" />Refresh</Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(counts).map(([status, count]) => (
          <Card key={status} className="cursor-pointer hover:shadow-md" onClick={() => setStatusFilter(status === statusFilter ? 'ALL' : status)}>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold">{count}</p>
              <p className="text-xs text-muted-foreground">{STATUS_LABELS[status]?.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="w-36"><p className="text-xs text-muted-foreground mb-1">Status</p>
              <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="ALL">All</SelectItem>{Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="w-36"><p className="text-xs text-muted-foreground mb-1">Type</p>
              <Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="ALL">All</SelectItem>{Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Requests list */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Requests ({requests.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[500px]">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">Loading...</div>
            ) : requests.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                No data rights requests found.
              </div>
            ) : (
              <div className="divide-y dark:divide-gray-800">
                {requests.map(req => {
                  const typeInfo = TYPE_LABELS[req.type] || { label: req.type, icon: null, color: '' }
                  const statusInfo = STATUS_LABELS[req.status] || { label: req.status, color: '' }
                  const isPending = req.status === 'PENDING'

                  return (
                    <div key={req.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={typeInfo.color}>{typeInfo.icon}</span>
                            <span className="font-medium text-sm">{typeInfo.label}</span>
                            <Badge className={`text-[10px] ${statusInfo.color}`}>{statusInfo.label}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            <span className="font-medium">{req.user.name}</span> ({req.user.username}) — {req.user.role}
                          </p>
                          {req.details && <p className="text-xs text-muted-foreground mt-1">{req.details}</p>}
                          {req.adminNotes && (
                            <p className="text-xs text-muted-foreground mt-1 italic">Admin: {req.adminNotes}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(req.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            {req.processedAt && ` → Processed by ${req.processedBy}`}
                          </p>
                        </div>
                        {isPending && (
                          <Button variant="outline" size="sm" onClick={() => { setSelectedRequest(req); setActionDialog(true) }}>
                            Review
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Action dialog */}
      <Dialog open={actionDialog} onOpenChange={setActionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Data Rights Request</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p className="text-sm font-medium">{TYPE_LABELS[selectedRequest.type]?.label}</p>
                <p className="text-xs text-muted-foreground">From: {selectedRequest.user.name} ({selectedRequest.user.username})</p>
                {selectedRequest.details && <p className="text-xs text-muted-foreground mt-1">{selectedRequest.details}</p>}
              </div>

              <div>
                <Label>Action</Label>
                <Select value={actionType} onValueChange={v => setActionType(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="APPROVED"><span className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-green-500" />Approve</span></SelectItem>
                    <SelectItem value="REJECTED"><span className="flex items-center gap-2"><XCircle className="h-4 w-4 text-red-500" />Reject</span></SelectItem>
                    <SelectItem value="COMPLETED"><span className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-blue-500" />Mark Completed</span></SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Admin Notes</Label>
                <Textarea rows={3} value={adminNotes} onChange={e => setAdminNotes(e.target.value)} placeholder="Add notes about this decision..." />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(false)}>Cancel</Button>
            <Button onClick={handleAction} disabled={busy} className={actionType === 'REJECTED' ? 'bg-red-600 hover:bg-red-700' : ''}>
              {busy ? 'Processing...' : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
