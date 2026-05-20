import { io } from 'socket.io-client';
function getOrCreateSessionId() {
    let id = sessionStorage.getItem('hitster_session_id');
    if (!id) {
        id = crypto.randomUUID();
        sessionStorage.setItem('hitster_session_id', id);
    }
    return id;
}
const sessionId = getOrCreateSessionId();
const displayName = sessionStorage.getItem('hitster_display_name') ?? '';
export const socket = io(import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3000', {
    auth: { sessionId, displayName },
    autoConnect: false,
});
