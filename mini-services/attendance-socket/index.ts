import { Server } from 'socket.io';

const PORT = 3003;

const io = new Server(PORT, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

console.log(`Socket.io server running on port ${PORT}`);

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

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

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});
