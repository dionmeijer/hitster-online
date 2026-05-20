import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '../../../shared/types';

function getOrCreateSessionId(): string {
  let id = sessionStorage.getItem('hitster_session_id');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('hitster_session_id', id);
  }
  return id;
}

const sessionId = getOrCreateSessionId();
const displayName = sessionStorage.getItem('hitster_display_name') ?? '';

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3000',
  {
    auth: { sessionId, displayName },
    autoConnect: false,
  }
);
