const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, 'public')));


const rooms = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  socket.on('join-room', (roomId) => {
    console.log(`User ${socket.id} joining room ${roomId}`);
    
    
    socket.rooms.forEach(room => {
      if (room !== socket.id) {
        socket.leave(room);
      }
    });

    socket.join(roomId);
    
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    
    const room = rooms.get(roomId);
    room.add(socket.id);

   
    const otherUsers = Array.from(room).filter(id => id !== socket.id);
    
   
    socket.emit('users-in-room', otherUsers);
    
    
    socket.to(roomId).emit('user-joined', socket.id);
    
    console.log(`Room ${roomId} now has users:`, Array.from(room));
  });

  
  socket.on('offer', (data) => {
    console.log('Relaying offer from', socket.id, 'to', data.target);
    socket.to(data.target).emit('offer', {
      offer: data.offer,
      sender: socket.id
    });
  });

  socket.on('answer', (data) => {
    console.log('Relaying answer from', socket.id, 'to', data.target);
    socket.to(data.target).emit('answer', {
      answer: data.answer,
      sender: socket.id
    });
  });

  socket.on('ice-candidate', (data) => {
    console.log('Relaying ICE candidate from', socket.id, 'to', data.target);
    socket.to(data.target).emit('ice-candidate', {
      candidate: data.candidate,
      sender: socket.id
    });
  });

  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    
    rooms.forEach((users, roomId) => {
      if (users.has(socket.id)) {
        users.delete(socket.id);
        socket.to(roomId).emit('user-left', socket.id);
        
       
        if (users.size === 0) {
          rooms.delete(roomId);
        }
      }
    });
  });

  
  socket.on('leave-room', (roomId) => {
    console.log(`User ${socket.id} leaving room ${roomId}`);
    socket.leave(roomId);
    
    if (rooms.has(roomId)) {
      rooms.get(roomId).delete(socket.id);
      socket.to(roomId).emit('user-left', socket.id);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} to access the app`);
});