import { useMemo } from 'react';
import { useGame } from './game/useGame';
import { getServerUrl } from './config';
import EntryPage from './components/EntryPage';
import GameRoom from './components/GameRoom';

export default function App() {
  const game = useGame();

  const sessionId = useMemo(() => {
    return sessionStorage.getItem('hitster_session_id') ?? '';
  }, []);

  const serverUrl = getServerUrl();

  if (!game.room) {
    return (
      <EntryPage
        serverUrl={serverUrl}
        onConnectAndCreateRoom={game.connectAndCreateRoom}
        onConnectAndJoinRoom={game.connectAndJoinRoom}
        serverError={game.socketError}
        roomJoined={game.room}
      />
    );
  }

  return (
    <GameRoom
      room={game.room}
      currentCard={game.currentCard}
      observerCard={game.observerCard}
      activePlayerId={game.activePlayerId}
      previewUrl={game.previewUrl}
      playAt={game.playAt}
      turnEndsAt={game.turnEndsAt}
      timelineLength={game.timelineLength}
      lastFlip={game.lastFlip}
      lastChallenge={game.lastChallenge}
      roundEnded={game.roundEnded}
      myTokens={game.myTokens}
      sessionId={sessionId}
      socketError={game.socketError}
      onStartRound={game.startRound}
      onPlaceCard={game.placeCard}
      onChallengeCard={game.challengeCard}
      onSkipCard={game.skipCard}
      onNameSong={game.nameSong}
      onBuyCard={game.buyCard}
      onDismissRoundEnd={game.dismissRoundEnd}
      onCreateTeam={game.createTeam}
      onJoinTeam={game.joinTeam}
      onLeaveTeam={game.leaveTeam}
      onPreviewPlaylist={game.previewPlaylist}
      onClearPlaylistPreview={game.clearPlaylistPreview}
      playlistPreviewCards={game.playlistPreviewCards}
      playlistPreviewLoading={game.playlistPreviewLoading}
      onEndGame={game.endGame}
      onLeave={() => {
        window.location.reload();
      }}
    />
  );
}
