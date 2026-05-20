import { Card } from '@shared/types';
import { MOCK_TRACKS } from './mockTracks';

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

interface SpotifyTrack {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  preview_url: string | null;
  external_urls?: { spotify?: string };
  album: {
    images: Array<{ url: string; width: number; height: number }>;
    release_date: string;
    release_date_precision: 'year' | 'month' | 'day';
  };
}

interface PlaylistTracksPage {
  items: Array<{ track: SpotifyTrack | null }>;
  next: string | null;
}

interface SearchTracksPage {
  tracks: {
    items: SpotifyTrack[];
    next: string | null;
  };
}

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const MIN_PLAYABLE_TRACKS = 6;

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export class SpotifyClient {
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly testMode = false,
  ) {}

  private async ensureToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 30_000) {
      return this.accessToken;
    }

    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const res = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!res.ok) {
      throw new Error(`Spotify token request failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as TokenResponse;
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
    return this.accessToken;
  }

  private async apiGet<T>(path: string): Promise<T> {
    const token = await this.ensureToken();
    const url = path.startsWith('http') ? path : `${SPOTIFY_API_BASE}${path}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`Spotify API error ${res.status} for ${path}`);
    }

    return res.json() as Promise<T>;
  }

  private trackArtists(track: SpotifyTrack): string {
    return track.artists.map((a) => a.name).join(', ');
  }

  private trackReleaseYear(track: SpotifyTrack): number | null {
    const year = parseInt(track.album.release_date.slice(0, 4), 10);
    return isNaN(year) ? null : year;
  }

  private trackPlayUrl(track: SpotifyTrack): string {
    return track.external_urls?.spotify ?? `https://open.spotify.com/track/${track.id}`;
  }

  private logRetrievedTrack(track: SpotifyTrack, included: boolean, skipReason?: string): void {
    const year = this.trackReleaseYear(track);
    const parts = [
      `[Spotify]`,
      `id=${track.id}`,
      `year=${year ?? '?'}`,
      `title="${track.name}"`,
      `artist="${this.trackArtists(track)}"`,
      `playUrl=${this.trackPlayUrl(track)}`,
      `previewUrl=${track.preview_url ?? 'null'}`,
      `albumArt=${track.album.images[0]?.url ?? 'none'}`,
      `included=${included}`,
    ];
    if (skipReason) parts.push(`reason=${skipReason}`);
    console.log(parts.join(' '));
  }

  private trackToCard(track: SpotifyTrack): Card | null {
    const releaseYear = this.trackReleaseYear(track);
    if (releaseYear === null) {
      this.logRetrievedTrack(track, false, 'invalid_release_year');
      return null;
    }

    const albumArt = track.album.images[0]?.url ?? '';

    const card: Card = {
      trackId: track.id,
      title: track.name,
      artist: this.trackArtists(track),
      releaseYear,
      // For now: Spotify play page (external_urls.spotify), not preview_url MP3.
      previewUrl: this.trackPlayUrl(track),
      streamUrl: track.preview_url,
      albumArt,
    };
    this.logRetrievedTrack(track, true);
    return card;
  }

  private extractPlaylistId(playlistUrl: string): string {
    const match = playlistUrl.match(/playlist\/([A-Za-z0-9]+)/);
    if (match) return match[1];
    if (/^[A-Za-z0-9]+$/.test(playlistUrl)) return playlistUrl;
    throw new Error(`Cannot extract playlist ID from: ${playlistUrl}`);
  }

  /** Fetch tracks from a Spotify playlist URL or bare playlist ID. */
  async getPlaylistTracks(playlistUrl: string, limit = 200): Promise<Card[]> {
    const playlistId = this.extractPlaylistId(playlistUrl);
    const cards: Card[] = [];
    let nextPath: string | null = `/playlists/${playlistId}/tracks?limit=50`;

    while (nextPath && cards.length < limit) {
      const data: PlaylistTracksPage = await this.apiGet<PlaylistTracksPage>(nextPath);

      for (const item of data.items) {
        if (!item.track) {
          console.log('[Spotify] skipped null playlist item');
          continue;
        }
        const card = this.trackToCard(item.track);
        if (card) cards.push(card);
      }

      nextPath = data.next ?? null;
    }

    console.log(`[Spotify] playlist ${playlistId}: ${cards.length} tracks included`);
    return cards;
  }

  /** Search for tracks by genre keyword. */
  async getGenreTracks(genre: string, limit = 100): Promise<Card[]> {
    const cards: Card[] = [];
    const q = encodeURIComponent(`genre:${genre}`);
    let nextPath: string | null = `/search?q=${q}&type=track&limit=50&offset=0`;

    while (nextPath && cards.length < limit) {
      const data: SearchTracksPage = await this.apiGet<SearchTracksPage>(nextPath);
      const items: SpotifyTrack[] = data.tracks?.items ?? [];

      for (const track of items) {
        const card = this.trackToCard(track);
        if (card) cards.push(card);
      }

      nextPath = items.length === 0 ? null : (data.tracks?.next ?? null);
    }

    console.log(`[Spotify] genre "${genre}": ${cards.length} tracks included`);
    return cards;
  }

  /**
   * Unified method used by the game engine to build a deck.
   * Accepts a Spotify playlist URL or a genre keyword.
   * In TEST_MODE returns shuffled mock tracks without hitting the API.
   */
  async getTracksForLabel(label: string): Promise<Card[]> {
    if (this.testMode) return shuffleArray(MOCK_TRACKS);

    const playlistMatch = label.match(/playlist\/([A-Za-z0-9]+)/);
    if (playlistMatch) {
      const cards = await this.getPlaylistTracks(label);
      this.assertMinTracks(cards, label);
      return shuffleArray(cards);
    }

    const cards = await this.getGenreTracksWithFallback(label);
    this.assertMinTracks(cards, label);
    return shuffleArray(cards);
  }

  /** Fetch random tracks for when no playlist or genre is specified. */
  async getRandomTracks(count: number): Promise<Card[]> {
    if (this.testMode) return shuffleArray(MOCK_TRACKS).slice(0, count);
    const cards = await this.getGenreTracksWithFallback('pop', count);
    return shuffleArray(cards).slice(0, count);
  }

  /** Strict genre:tag search with broad-keyword fallback when fewer than 10 results return. */
  private async getGenreTracksWithFallback(genre: string, limit = 50): Promise<Card[]> {
    const strict = await this.getGenreTracks(genre, limit);
    if (strict.length >= 10) return strict;

    const cards: Card[] = [];
    const q = encodeURIComponent(genre);
    const data: SearchTracksPage = await this.apiGet<SearchTracksPage>(
      `/search?q=${q}&type=track&limit=50`,
    );
    for (const track of data.tracks?.items ?? []) {
      const card = this.trackToCard(track);
      if (card) cards.push(card);
    }
    console.log(`[Spotify] genre fallback "${genre}": ${cards.length} tracks included`);
    return cards;
  }

  private assertMinTracks(cards: Card[], label: string): void {
    if (cards.length < MIN_PLAYABLE_TRACKS) {
      throw new Error(
        `Only ${cards.length} playable tracks found for "${label}" (need at least ${MIN_PLAYABLE_TRACKS}). Try a different playlist or genre.`,
      );
    }
  }
}

/** Build a SpotifyClient from environment variables. Throws if credentials are absent (unless TEST_MODE). */
export function createSpotifyClient(): SpotifyClient {
  const testMode = process.env.TEST_MODE === 'true';
  const clientId = process.env.SPOTIFY_CLIENT_ID ?? (testMode ? 'test' : '');
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET ?? (testMode ? 'test' : '');
  if (!testMode && (!clientId || !clientSecret)) {
    throw new Error('SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set');
  }
  return new SpotifyClient(clientId, clientSecret, testMode);
}
