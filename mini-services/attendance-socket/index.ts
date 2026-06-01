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

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});
