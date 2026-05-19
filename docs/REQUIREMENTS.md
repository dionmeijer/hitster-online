# Hitster Online — Requirements

> Status: Draft v0.4 — actively being refined
> Last updated: 2026-05-19

---

## Part 1 — Functional Requirements

_What the system does from a player's perspective. No technical detail._

---

### 1.1 Player Onboarding
- A player opens the game URL and enters their **email address** (required) and optionally a **display name**.
- The **display name** is shown to other players. If omitted, the local part of the email address is used as the fallback display name (e.g. `alex` from `alex@example.com`).
- Email is used to identify a player across reconnects and sessions. It is **never shown to other players**.
- After completing the form, the player can either:
  - **Create a room** (becoming the room owner), or
  - **Join a room** by entering a 4-character room code, or
  - **Click directly into an existing room** shown in the room browser (see §1.1.1).

#### 1.1.1 Room Browser
- The entry page displays a live list of all **active rooms** on the server (lobby or in-progress).
- Each room card shows:
  - **Room code** and **topic / description** set by the owner
  - **Genre / playlist** (e.g. "90s Night", "Pop Classics") — the song source label
  - **Participants**: player count and display names of players currently in the room
  - **Round status**: lobby waiting, or current round number
  - **Progress**: for in-progress rounds, the leading player/team's card count and the target (e.g. "Mike — 6 / 10 cards")
- Clicking a room card pre-fills the join code. The player still needs to have entered a valid email before joining.
- Rooms in **LOBBY** state can be joined freely.
- Rooms in **ROUND_ACTIVE** state can be observed but the player joins the next round only.
- Rooms in **GAME_OVER** state are shown greyed-out and cannot be joined.
- The room list auto-refreshes every 10 seconds via a server poll or Socket.io event.

### 1.2 Rooms
- Each room has a unique **room code** and a shareable **join link**.
- The owner sets a **topic / description** for the room (e.g. "90s Night", "Office Party").
- Multiple game rounds can be played within the same room without players having to rejoin.
- Players can join a room at any point while it is in the **lobby** state (before a round starts).
- Only the room owner can configure rounds and start the game.

### 1.3 Teams
- The room owner can optionally create **teams** and assign players to them.
- Teams share a single timeline during a round.
- If no teams are created, each player has their own individual timeline.
- Teams are finalised before the game starts. The owner can reassign players between rounds.

### 1.4 Round Configuration
Before each round, the room owner sets:

| Setting | Options | Default |
|---|---|---|
| Song source | Spotify playlist URL or genre/theme | — |
| Game mode | Original / Pro / Expert / Cooperative | Original |
| Tokens enabled | Yes / No | Yes |
| Cards needed to win | Number | 10 |

### 1.5 Gameplay — Hitster Rules (Digital)

#### Setup
- Each player/team receives **1 starting card** face-up (showing title, artist, and release year). This is the anchor of their timeline.
- The player/team with the **oldest starting song** takes the first turn. Play proceeds in join order (clockwise equivalent).
- If tokens are enabled, each player/team starts with **2 tokens**.

#### Turn Structure
Each turn has three phases:

**REVEAL** — A new card is drawn from the deck and the song starts playing for all players. The placing player does not see the song's title, artist, or year until after they have placed the card. All other players see the song details immediately.

**PLACE** — The placing player selects a position on their timeline: before their earliest card, after their latest card, or between any two existing cards. The card is placed face-down (year hidden).

**FLIP** — The card is revealed. If the placement is chronologically correct, the card stays on the timeline. If incorrect, the card is discarded. If the release year matches an existing card's year exactly, placement immediately before or after that card also counts as correct.

#### Token Mechanics

| Action | Rule |
|---|---|
| **Skip card** (your turn) | Spend 1 token to discard the current card and draw a new one. |
| **Challenge** ("HITSTER!") | During an opponent's placement, spend 1 token and declare a challenge. If the opponent placed incorrectly, you steal the card for your own timeline. If they were correct, you lose your token. First to shout gets priority; multiple players may challenge different positions on the same timeline simultaneously. |
| **Buy a card** | Trade 3 tokens to place a card directly on your timeline without guessing. Must decide before the song plays. You skip your next turn. |
| **Earn a token** | Name the song title AND artist correctly on any turn = +1 token (max 5 per player). |

#### Game Modes

| Mode | Rule | Starting Tokens |
|---|---|---|
| **Original** | Place cards in chronological order. | 2 |
| **Pro** | Must also name artist and song title to win or steal a card. | 5 (no new tokens earned) |
| **Expert** | Must name artist, song title, and exact release year. | 3 (no new tokens earned) |
| **Cooperative** | All players as one team. Incorrect placement costs 1 token. Win by reaching 10 cards; lose if tokens hit 0. | 5 (shared) |

#### Winning
- **Individual / team**: First to correctly place **10 cards** on their timeline wins the round.
- **Cooperative**: Collect 10 cards before running out of tokens.

### 1.6 Multiple Rounds
- After a round ends, the room stays open. The owner can start a new round with new settings.
- Round history (who won each round) is visible in the room.
- Teams and player assignments carry over unless the owner changes them.

### 1.7 Known Limitations (v1)
- Spotify playlist URLs must be **public** playlists.
- Not all tracks have a 30-second audio preview. Tracks without a preview are flagged during deck-build so the owner can remove or replace them before the round starts.
- If the deck runs out of cards before anyone wins, the player/team with the most cards on their timeline wins the round.

---

## Part 2 — Technical Requirements

_What the system must do technically to support the functional requirements._

---

### 2.1 Real-Time Multiplayer
- All players in a room must see game state changes (turns, placements, flips, scores, token actions) in real time.
- Latency for game state updates should be imperceptible during normal play (<200ms on a typical connection).

### 2.2 Audio Synchronisation
- When a turn starts, all players must begin playing the same audio clip at approximately the same moment.
- Sync is achieved by the server sending a `preview_url` + `playAt` timestamp to all clients simultaneously. Each client starts playback at the specified time.
- Acceptable sync variance: ≤500ms between clients.

### 2.3 Spotify Integration
- The server must authenticate with the Spotify Web API using the **Client Credentials Flow** (app-level, no user login required).
- Given a public Spotify playlist URL, the server must retrieve all tracks in the playlist including: title, artist(s), release year, album art URL, and `preview_url`.
- Tracks with a null `preview_url` must be identified and flagged to the room owner before the round starts.

### 2.4 Audio Playback
- The `preview_url` from Spotify is a publicly accessible 30-second MP3 hosted on Spotify's CDN.
- The client plays this URL directly in a browser `<audio>` element. No server-side audio streaming is required.
- Playback stops after 30 seconds or when the placing player confirms their placement, whichever comes first.

### 2.5 Game State
- Game state (room, players, teams, deck, timelines, tokens, scores) is managed server-side and broadcast to clients via WebSocket.
- Clients are stateless — they render what the server tells them. No game logic runs client-side.

### 2.6 No Authentication
- No user accounts, passwords, or OAuth flows are required.
- Players are identified by their **email address** (entered at onboarding) combined with a **session ID** (UUID generated client-side, stored in `sessionStorage`).
- The email is stored in `sessionStorage` and re-submitted on reconnect to restore the player's identity within an active room.
- **Display name** shown in-game is the player's chosen name, or the email local part if no name was provided.
- Room ownership is tied to the session ID of the creator.

---

## Part 3 — Design & Architecture

_How the system is structured internally._

---

### 3.1 Components

```
┌─────────────────────────────────────────┐
│               Browser (client)          │
│  - React/Vue UI                         │
│  - WebSocket connection to server       │
│  - <audio> element for preview playback │
└────────────────┬────────────────────────┘
                 │ WebSocket
┌────────────────▼────────────────────────┐
│               Server (Node.js)          │
│  - WebSocket server (Socket.io)         │
│  - Game state engine                    │
│  - Room / session management            │
│  - Spotify API client                   │
└────────────────┬────────────────────────┘
                 │ HTTPS (Client Credentials)
┌────────────────▼────────────────────────┐
│            Spotify Web API              │
│  - Playlist → track list                │
│  - Track metadata + preview_url         │
└─────────────────────────────────────────┘
```

### 3.2 Data Flow — Turn Lifecycle

1. Server draws next card from deck, resolves `preview_url`
2. Server emits `turn:start` to all clients: `{ trackId, previewUrl, playAt, activePlayer }`
3. **Placing player** receives a "blind" view — audio plays, timeline is interactive, song identity hidden
4. **All other players** receive full song details — can prepare a HITSTER! challenge
5. Placing player selects a position and confirms → server emits `turn:placed`
6. Server validates placement against release year
7. Server emits `turn:flip` with result (correct / incorrect) and updated timeline state
8. Token challenges resolved if any; server emits updated token counts
9. Server checks win condition → emits `round:win` or proceeds to next turn

### 3.3 Room State Machine

```
LOBBY → ROUND_ACTIVE → ROUND_ENDED → LOBBY (next round)
                                    → GAME_OVER (someone won)
```

### 3.4 Open Design Questions

| # | Question | Recommendation |
|---|---|---|
| 3 | **Turn structure** | Each player places on their own timeline on their turn (simpler than the physical "player to the left" rule) |
| 4 | **Team placement** | Any team member can click to place; team discusses via voice/video call |
| 5 | **HITSTER! challenge UX** | A challenge button appears for all non-placing players during PLACE phase; closes when placing player confirms or after 30s |
| 6 | **Deck exhaustion** | Declare player/team with most cards the winner |
| 7 | **Player disconnection** | Skip disconnected player's turn; remove them from active play after 2 missed turns |
| 8 | **Room size** | Max 12 players (or 6 teams of 2) per room for v1 |

---

## Part 4 — Technology Stack

_Chosen technologies and the rationale behind each decision._

---

### 4.1 Stack Overview

| Layer | Technology | Rationale |
|---|---|---|
| Frontend framework | React + TypeScript | Best agent code quality; component model suits timeline UI |
| Frontend build tool | Vite | Fast dev server, minimal config |
| Styling | Tailwind CSS | Rapid styling without custom CSS |
| Drag & drop | dnd-kit | Modern, accessible, touch-friendly for timeline placement |
| Real-time transport | Socket.io (client + server) | Built-in room management, auto-reconnect, event API |
| Backend runtime | Node.js + TypeScript | Shares types with frontend; best agent coverage |
| HTTP layer | Express | Serves API + compiled React build from one process |
| State storage | In-memory (no database) | No persistence needed for v1 |
| External API | Spotify Web API | Playlist data + track metadata + preview URLs |

### 4.2 Repo Structure

Single monorepo — the Node server serves the compiled React build as static files. One repository, one deployment.

```
/
├── server/          # Node.js + Express + Socket.io
│   ├── src/
│   │   ├── index.ts        # Entry point
│   │   ├── game/           # Game state engine
│   │   ├── rooms/          # Room & session management
│   │   └── spotify/        # Spotify API client
│   └── package.json
├── client/          # React + Vite
│   ├── src/
│   │   ├── components/     # UI components
│   │   ├── game/           # Game state hooks
│   │   └── socket/         # Socket.io client
│   └── package.json
└── shared/          # Shared TypeScript types (events, state)
    └── types.ts
```

### 4.3 Shared Types

TypeScript types defined once in `/shared/types.ts` and imported by both server and client. This ensures WebSocket events are type-safe on both ends — the agent cannot accidentally emit an event the client doesn't know how to handle.

Key shared types: `Room`, `Player`, `Team`, `Card`, `Timeline`, `GameEvent`.

### 4.4 Technology Decision Log

| Decision | Alternatives considered | Reason not chosen |
|---|---|---|
| Node.js | Bun, Deno, Python, Go | Node has most agent training coverage; TypeScript sharing with frontend |
| Socket.io | raw `ws`, native WebSocket | Socket.io rooms + reconnection save significant boilerplate |
| React | Vue, Svelte, vanilla JS | Agents produce most reliable React; dnd-kit ecosystem |
| Railway (hosting) | Render, Fly.io | No cold starts on free tier; WebSockets work out of the box; 2-min deploys |

---

## Part 5 — Deployment

_How and where the system runs._

---

### 5.1 Hosting Model
- The server is **hosted and operated by the game owner** (Dion).
- **Platform: Railway** — supports Node.js and WebSockets without configuration, no cold starts on free tier, deploys from GitHub in ~2 minutes.

### 5.2 Environment Variables
The server requires the following configuration at deploy time:

| Variable | Description |
|---|---|
| `SPOTIFY_CLIENT_ID` | Spotify app client ID (from Spotify Developer Dashboard) |
| `SPOTIFY_CLIENT_SECRET` | Spotify app client secret |
| `PORT` | Server port (default: 3000) |

### 5.3 Spotify App Setup
- Register a free app at [developer.spotify.com](https://developer.spotify.com) to obtain a client ID and secret.
- No redirect URIs or scopes required (Client Credentials Flow only).
- No Spotify review / quota extension needed for reading public playlists.

### 5.4 Scale
- v1 is designed for small groups (friends, team events). No scaling infrastructure needed.
- A single server process handles all rooms.
- No database required — all state is in-memory. Rooms are lost on server restart (acceptable for v1).

---

## Appendix A — Repository & Licence

| Item | Value |
|---|---|
| GitHub owner | [github.com/dionmeijer](https://github.com/dionmeijer/) |
| Repository name | `hitster-online` |
| Repository URL | https://github.com/dionmeijer/hitster-online |
| Licence | Apache 2.0 |

An `LICENSE` file (Apache 2.0 text) and a `NOTICE` file should be included in the root of the repository. The agent should generate both when scaffolding the project.

---

## Appendix B — Resolved Design Decisions

All open questions from Part 3 are resolved as follows:

| # | Question | Decision |
|---|---|---|
| 3 | **Turn structure** | Each player places on their own timeline on their turn. Simpler than the physical "player to the left" rule and cleaner UX online. |
| 4 | **Team placement** | Any team member can click to place. Team discusses via voice/video call; first to click confirms the placement. |
| 5 | **HITSTER! challenge window** | After the placing player confirms, a **10-second challenge window** opens. All non-placing players see a "HITSTER!" button. Window closes when the first challenge is placed or after 10 seconds, then the card flips automatically. |
| 6 | **Deck exhaustion** | Declare the player/team with the most cards the winner. Tiebreaker: highest average release year on their timeline. |
| 7 | **Player disconnection** | Skip their turn after a 15-second timeout. Remove from active rotation after 2 consecutive missed turns. They can rejoin the room but not the active round. |
| 8 | **Room size limit** | Maximum 12 players or 6 teams per room (v1). |

---

## Appendix C — Out of Scope (v1)

- User accounts or persistent profiles
- Leaderboards across sessions
- Native mobile app
- Private Spotify playlist support
- Apple Music or YouTube playlist support
- Persistent room history across server restarts
