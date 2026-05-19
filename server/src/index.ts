import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import type { ServerToClientEvents, ClientToServerEvents } from '../../shared/types';

const app = express();
const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// --- Socket.io connection handler ---
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    // TODO: handle player disconnect (rooms/index.ts)
  });

  // Room events — implementation in server/src/rooms/
  socket.on('room:create', (_data, callback) => {
    // TODO: implement
    callback({ error: 'Not implemented yet' });
  });

  socket.on('room:join', (_data, callback) => {
    // TODO: implement
    callback({ error: 'Not implemented yet' });
  });
});

const PORT = parseInt(process.env.PORT || '3000', 10);
httpServer.listen(PORT, () => {
  console.log(`Hitster Online server running on port ${PORT}`);
});
