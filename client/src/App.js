import { jsx as _jsx } from "react/jsx-runtime";
import { useMemo } from 'react';
import { useGame } from './game/useGame';
import EntryPage from './components/EntryPage';
import GameRoom from './components/GameRoom';
export default function App() {
    const game = useGame();
    const sessionId = useMemo(() => {
        return sessionStorage.getItem('hitster_session_id') ?? '';
    }, []);
    const serverUrl = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3000';
    if (!game.room) {
        return (_jsx(EntryPage, { serverUrl: serverUrl, onConnect: game.connect, onCreateRoom: game.createRoom, onJoinRoom: game.joinRoom, serverError: game.socketError, roomJoined: game.room }));
    }
    return (_jsx(GameRoom, { room: game.room, currentCard: game.currentCard, activePlayerId: game.activePlayerId, previewUrl: game.previewUrl, playAt: game.playAt, timelineLength: game.timelineLength, lastFlip: game.lastFlip, roundEnded: game.roundEnded, myTokens: game.myTokens, sessionId: sessionId, socketError: game.socketError, onStartRound: game.startRound, onPlaceCard: game.placeCard, onChallengeCard: game.challengeCard, onSkipCard: game.skipCard, onNameSong: game.nameSong, onBuyCard: game.buyCard, onLeave: () => {
            window.location.reload();
        } }));
}
