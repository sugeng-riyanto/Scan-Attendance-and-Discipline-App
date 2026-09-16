import { Server } from 'socket.io';
import { timingSafeEqual } from 'node:crypto';

const PORT = 3003;

// Shared secret between the Next.js server relay (src/lib/socket-server.ts) and
// this service. Only a client that presents it may emit: browsers connect
// without it and are listen-only, so a visitor can no longer forge alert:new,
// subscription:alert, terms:remind, … for every connected user. Both sides read
// the same value from the environment (.env.local locally, host env vars in
// production). Unset means LISTEN-ONLY — see the warning at startup.
const RELAY_TOKEN = process.env.SOCKET_RELAY_TOKEN || '';

// Browser origins allowed to open a socket. Requests without an Origin header
// (the server-side relay) are always allowed — CORS only constrains browsers.
// Set SOCKET_ALLOWED_ORIGINS (comma-separated) to add e.g. a LAN or staging URL.
const ALLOWED_ORIGINS = Array.from(
  new Set(
    (
      process.env.SOCKET_ALLOWED_ORIGINS ||
      [process.env.NEXT_PUBLIC_APP_URL, 'http://localhost:3000'].filter(Boolean).join(',')
    )
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean)
  )
);

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // server-side relay, or a non-browser client
  return ALLOWED_ORIGINS.includes(origin.replace(/\/$/, ''));
}

/** Constant-time compare so the token can't be recovered byte-by-byte. */
function tokenMatches(presented: unknown): boolean {
  if (!RELAY_TOKEN || typeof presented !== 'string') return false;
  const provided = Buffer.from(presented);
  const expected = Buffer.from(RELAY_TOKEN);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

const io = new Server(PORT, {
  cors: {
    // Auth is enforced below, not here; this only keeps arbitrary web pages
    // from opening a socket at all.
    origin: (origin, callback) => {
      callback(null, isAllowedOrigin(origin));
    },
    methods: ['GET', 'POST'],
  },
});

// Decide privilege once per connection, at handshake time.
io.use((socket, next) => {
  socket.data.trusted = tokenMatches(socket.handshake.auth?.token);
  next();
});

console.log(`Socket.io server running on port ${PORT}`);
console.log(`Allowed browser origins: ${ALLOWED_ORIGINS.join(', ') || '(none)'}`);
if (!RELAY_TOKEN) {
  console.warn('[socket] SOCKET_RELAY_TOKEN is not set — running LISTEN-ONLY.');
  console.warn('[socket] Relay events will be refused, so dashboards will not live-update.');
  console.warn('[socket] Set SOCKET_RELAY_TOKEN to the same value for the Next server and this service.');
}

io.on('connection', (socket) => {
  if (socket.data.trusted) {
    console.log('Relay connected:', socket.id);
  } else {
    console.log('Listener connected (read-only):', socket.id);
  }

  // Guard every inbound packet from an untrusted (browser) socket. Applying it
  // here rather than inside each handler means handlers added later are covered
  // automatically and can't silently reopen the injection hole.
  socket.use(([event], next) => {
    if (socket.data.trusted) return next();
    console.warn('Refused emit from untrusted socket', socket.id, '-', event);
    next(new Error('unauthorized: listen-only socket'));
  });

  socket.on('join-room', (room: string) => {
    socket.join(room);
    console.log(`Socket ${socket.id} joined room: ${room}`);
  });

  socket.on('leave-room', (room: string) => {
    socket.leave(room);
    console.log(`Socket ${socket.id} left room: ${room}`);
  });

  socket.on('attendance:checkin', (data) => {
    io.emit('attendance:update', data);
    console.log('Attendance check-in event:', data.student?.name);
  });

  socket.on('attendance:checkout', (data) => {
    io.emit('attendance:update', data);
    console.log('Attendance check-out event:', data.student?.name);
  });

  socket.on('alert:new', (data) => {
    io.emit('alert:new', data);
    // Also emit to specific role room
    if (data.targetRole) {
      io.to(`role:${data.targetRole}`).emit('alert:new', data);
    }
    console.log('New alert:', data.alertType);
  });

  socket.on('permission:update', (data) => {
    io.emit('permission:update', data);
    console.log('Permission update:', data.status);
  });

  socket.on('violation:new', (data) => {
    io.emit('violation:update', data);
    console.log('New violation:', data.student?.name);
  });

  socket.on('good-deed:new', (data) => {
    io.emit('good-deed:update', data);
    console.log('New good deed:', data.student?.name);
  });

  // Broadcast by the Next server after /api/setup wipes and re-seeds the DB,
  // so every open dashboard refetches immediately instead of showing stale
  // data. Dashboards subscribe via useApiFetch (always listens for this).
  socket.on('data:reset', (data) => {
    io.emit('data:reset', data);
    console.log('Data reset event:', data?.message || 'database reseeded');
  });

  // Broadcast by the Next server's subscription-alert checker (instrumentation.ts):
  // schools expiring within 30 days or locked. The app shell turns it into a
  // toast for the Super Admin / affected school admins.
  socket.on('subscription:alert', (data) => {
    io.emit('subscription:alert', data);
    console.log('Subscription alert event:', data?.expiring?.length, 'expiring,', data?.locked?.length, 'locked');
  });

  // Broadcast by the Next server's T&C bulk-reminder route (/api/terms-remind).
  // Affected users' dashboards show a toast linking to the Terms page. Without
  // this handler the server's emit was silently dropped here, so only the
  // email channel ever reached users.
  socket.on('terms:remind', (data) => {
    io.emit('terms:remind', data);
    console.log('Terms reminder event: v' + (data?.version ?? '?'), 'for', data?.userIds?.length ?? 0, 'user(s)');
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});
