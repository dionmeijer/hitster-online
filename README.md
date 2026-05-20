# Hitster Online

A browser-based multiplayer implementation of the [Hitster](https://hitstergame.com) card game. Players build a chronological timeline of songs by listening to 30-second Spotify audio previews. No app download, no login — just open the link and play.

Built during [BlueConic Builders Day](https://blueconic.com) — May 2026.

## How to play

1. One player creates a room and pastes a Spotify playlist URL
2. Other players join using the room code
3. Each turn: a song plays, you place it on your timeline where you think it belongs chronologically
4. First to correctly place 10 cards wins

Full rules in [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md).

## Running locally

```bash
# Clone the repo
git clone https://github.com/dionmeijer/hitster-online.git
cd hitster-online

# Install dependencies
cd server && npm install
cd ../client && npm install

# Configure environment
cp server/.env.example server/.env
# Edit server/.env and add your Spotify credentials

# Start the server
cd server && npm run dev

# In a separate terminal, start the client
cd client && npm run dev

# Open http://localhost:5173
# Open multiple tabs to simulate multiplayer
```

## Getting Spotify credentials

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Create a new app (any name)
3. Copy the Client ID and Client Secret into `server/.env`

No scopes or redirect URIs needed — the server uses Client Credentials Flow only.

## Deploy to Fly.io

Production target is **[Fly.io](https://fly.io)** (single machine, WebSockets, ~$3–8/mo shared CPU). The server serves the built client from the same URL.

```bash
fly auth login
fly secrets set SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=... CLIENT_URL=https://hitster-online.fly.dev
fly deploy
```

Full steps: [docs/DEPLOY_FLY.md](docs/DEPLOY_FLY.md). Railway config (`railway.toml`) remains optional.

## Tech stack

- **Frontend**: React + TypeScript, Vite, Tailwind CSS
- **Backend**: Node.js + TypeScript, Express, Socket.io
- **Real-time**: Socket.io WebSockets
- **Audio**: Spotify `preview_url` (30s MP3 previews)

## Licence

Apache 2.0 — see [LICENSE](LICENSE).
