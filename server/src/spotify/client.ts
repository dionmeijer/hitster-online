import type { Card } from '../../../shared/types';
import { MOCK_TRACKS } from './mockTracks';

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface SpotifyTrackObject {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  album: {
    name: string;
    images: Array<{ url: string; height: number; width: number }>;
    release_date: string;
  };
  preview_url: string | null;
}

interface SpotifySearchResponse {
  tracks: {
    items: SpotifyTrackObject[];
    total: number;
    next: string | null;
  };
}

interface SpotifyPlaylistTracksResponse {
  items: Array<{
    track: SpotifyTrackObject | null;
  }>;
  next: string | null;
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function parseReleaseYear(dateStr: string): number {
  // Spotify dates are YYYY, YYYY-MM, or YYYY-MM-DD
  return parseInt(dateStr.split('-')[0], 10);
}

function mapSpotifyTrack(track: SpotifyTrackObject): Card | null {
  if (!track.preview_url) {
    return null; // Tracks with no preview must be filtered out
  }
  const albumImage = track.album.images.find((img) => img.height <= 300) ?? track.album.images[0];
  return {
    trackId: track.id,
    title: track.name,
    artist: track.artists.map((a) => a.name).join(', '),
    releaseYear: parseReleaseYear(track.album.release_date),
    previewUrl: track.preview_url,
    albumArt: albumImage?.url ?? '',
  };
}

export class SpotifyClient {
  private clientId: string;
  private clientSecret: string;
  private testMode: boolean;

  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0; // Unix ms

  constructor() {
    this.clientId = process.env.SPOTIFY_CLIENT_ID ?? '';
    this.clientSecret = process.env.SPOTIFY_CLIENT_SECRET ?? '';
    this.testMode = process.env.TEST_MODE === 'true';
  }

  async getAccessToken(): Promise<void> {
    if (this.testMode) return;

    const now = Date.now();
    // Already valid
    if (this.accessToken && now < this.tokenExpiresAt - 60_000) return;

    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const resp = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Spotify token request failed: ${resp.status} ${text}`);
    }

    const data = (await resp.json()) as SpotifyTokenResponse;
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
  }

  private async fetchWithAuth(url: string): Promise<Response> {
    await this.getAccessToken();
    if (!this.accessToken) throw new Error('No Spotify access token available');
    return fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
  }

  async getTracksForLabel(label: string): Promise<Card[]> {
    if (this.testMode) {
      return shuffleArray(MOCK_TRACKS);
    }

    // Check if label is a Spotify playlist URL
    const playlistMatch = label.match(/playlist\/([a-zA-Z0-9]+)/);
    if (playlistMatch) {
      return this.getTracksFromPlaylist(playlistMatch[1]);
    }

    // Otherwise search by genre/keyword
    return this.searchTracksByGenre(label, 50);
  }

  async getRandomTracks(count: number): Promise<Card[]> {
    if (this.testMode) {
      return shuffleArray(MOCK_TRACKS).slice(0, count);
    }

    return this.searchTracksByGenre('pop', count);
  }

  private async getTracksFromPlaylist(playlistId: string): Promise<Card[]> {
    const cards: Card[] = [];
    // Fetch only the first page (max 50 tracks) — no pagination
    const url =
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50&fields=items(track(id,name,artists,album,preview_url)),next`;

    const resp = await this.fetchWithAuth(url);
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Spotify playlist fetch failed: ${resp.status} ${text}`);
    }
    const data = (await resp.json()) as SpotifyPlaylistTracksResponse;
    for (const item of data.items) {
      if (!item.track) continue;
      const card = mapSpotifyTrack(item.track);
      if (card) cards.push(card);
    }

    if (cards.length < 6) {
      throw new Error(
        `Spotify returned only ${cards.length} playable tracks (need at least 6). Try a different playlist or genre.`
      );
    }

    return shuffleArray(cards);
  }

  private async searchTracksByGenre(genre: string, limit: number): Promise<Card[]> {
    const cap = Math.min(limit, 50);

    // First attempt: strict genre tag filter
    const strictQuery = encodeURIComponent(`genre:"${genre}"`);
    const strictUrl = `https://api.spotify.com/v1/search?q=${strictQuery}&type=track&limit=${cap}`;
    const strictResp = await this.fetchWithAuth(strictUrl);
    if (!strictResp.ok) {
      const text = await strictResp.text();
      throw new Error(`Spotify search failed: ${strictResp.status} ${text}`);
    }
    const strictData = (await strictResp.json()) as SpotifySearchResponse;
    const strictCards: Card[] = [];
    for (const track of strictData.tracks.items) {
      const card = mapSpotifyTrack(track);
      if (card) strictCards.push(card);
    }

    // If strict genre search returned enough results, use them
    if (strictCards.length >= 10) {
      if (strictCards.length < 6) {
        throw new Error(
          `Spotify returned only ${strictCards.length} playable tracks (need at least 6). Try a different playlist or genre.`
        );
      }
      return shuffleArray(strictCards);
    }

    // Fall back to a broad keyword search
    const broadQuery = encodeURIComponent(genre);
    const broadUrl = `https://api.spotify.com/v1/search?q=${broadQuery}&type=track&limit=${cap}`;
    const broadResp = await this.fetchWithAuth(broadUrl);
    if (!broadResp.ok) {
      const text = await broadResp.text();
      throw new Error(`Spotify search failed: ${broadResp.status} ${text}`);
    }
    const broadData = (await broadResp.json()) as SpotifySearchResponse;
    const cards: Card[] = [];
    for (const track of broadData.tracks.items) {
      const card = mapSpotifyTrack(track);
      if (card) cards.push(card);
    }

    if (cards.length < 6) {
      throw new Error(
        `Spotify returned only ${cards.length} playable tracks (need at least 6). Try a different playlist or genre.`
      );
    }

    return shuffleArray(cards);
  }
}
