import { io, type Socket } from 'socket.io-client'

// Server-side relay to the attendance-socket mini-service (socket.io on :3003).
// The mini-service broadcasts each event to every connected browser client,
// which is how dashboards get live updates when attendance changes.
//
// Usage from API routes:
//   import { emitSocketEvent } from '@/lib/socket-server'
//   emitSocketEvent('attendance:checkin', { student, attendance, action: 'checkin' })

const SOCKET_SERVER_URL = process.env.SOCKET_SERVER_URL || 'http://localhost:3003'
const MAX_QUEUE = 50

let socket: Socket | null = null
let queue: { event: string; data: unknown }[] = []

function flushQueue() {
  if (!socket) return
  while (queue.length > 0) {
    const item = queue.shift()
    if (item) socket.emit(item.event, item.data)
  }
}

function ensureSocket(): Socket | null {
  // Server runtime only — never run inside the browser bundle.
  if (typeof window !== 'undefined') return null
  if (socket) return socket

  socket = io(SOCKET_SERVER_URL, {
    // Polling only: the websocket transport's `ws` wiring breaks when
    // engine.io-client is bundled by Turbopack for the server runtime
    // (connect_error: websocket error, under Bun). Polling is plain HTTP
    // and always works for this tiny server-to-server relay.
    transports: ['polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
    timeout: 5000,
  })

  socket.on('connect', () => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[socket-server] connected to ${SOCKET_SERVER_URL}`)
    }
    flushQueue()
  })
  socket.on('connect_error', () => {
    // Mini-service may be down — events queue up and flush on reconnect.
  })

  return socket
}

/**
 * Emit an event to the socket mini-service so connected browser clients get
 * live updates. If the mini-service is unreachable the event is buffered
 * (up to MAX_QUEUE) and flushed once the connection is re-established.
 */
export function emitSocketEvent(event: string, data: unknown) {
  const s = ensureSocket()
  if (!s) return
  if (s.connected) {
    s.emit(event, data)
  } else if (queue.length < MAX_QUEUE) {
    queue.push({ event, data })
  }
}
