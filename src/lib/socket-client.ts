import { io, type Socket } from 'socket.io-client'
import { useEffect, useRef } from 'react'

// Browser-side connection to the attendance-socket mini-service (socket.io on :3003).
// Dashboards subscribe to live events (attendance:update, violation:update,
// good-deed:update, permission:update, alert:new) and refetch their data.
//
// Usage:
//   useSocketEvent('attendance:update', (data) => { ... })
//   subscribeSocketEvent('attendance:update', handler)  // returns unsubscribe

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3003'

let socket: Socket | null = null
const listeners = new Map<string, Set<(data: any) => void>>()

function getSocket(): Socket | null {
  if (typeof window === 'undefined') return null
  if (socket) return socket

  socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
    timeout: 5000,
  })

  socket.onAny((event: string, data: any) => {
    const set = listeners.get(event)
    if (!set) return
    set.forEach((fn) => {
      try {
        fn(data)
      } catch (err) {
        console.error(`[socket-client] handler for "${event}" failed:`, err)
      }
    })
  })

  if (process.env.NODE_ENV !== 'production') {
    socket.on('connect', () => console.log(`[socket-client] connected to ${SOCKET_URL}`))
    socket.on('disconnect', () => console.log('[socket-client] disconnected'))
  }

  return socket
}

/** Subscribe to a socket event. Returns an unsubscribe function. */
export function subscribeSocketEvent(event: string, handler: (data: any) => void): () => void {
  const s = getSocket()
  if (!s) return () => {}
  let set = listeners.get(event)
  if (!set) {
    set = new Set()
    listeners.set(event, set)
  }
  set.add(handler)
  return () => {
    set.delete(handler)
  }
}

/** React hook: run `handler` whenever any of the given events arrive. */
export function useSocketEvent(events: string | string[], handler: (data: any) => void) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  const key = Array.isArray(events) ? events.join(',') : events

  useEffect(() => {
    const list = Array.isArray(events) ? events : [events]
    const unsubs = list.map((ev) => subscribeSocketEvent(ev, (data) => handlerRef.current(data)))
    return () => unsubs.forEach((u) => u())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}
