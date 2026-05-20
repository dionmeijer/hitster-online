import { SpotifyClient, createSpotifyClient } from './client';

const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

// ── helpers ──────────────────────────────────────────────────────────────────

function tokenOk(expiresIn = 3600) {
  return { ok: true, json: async () => ({ access_token: 'tok', expires_in: expiresIn }) };
}

function apiOk(body: unknown) {
  return { ok: true, json: async () => body };
}

function apiFail(status: number, statusText = 'Error') {
  return { ok: false, status, statusText };
}

function makeTrack(
  overrides: Partial<{
    id: string;
    name: string;
    artists: { name: string }[];
    preview_url: string | null;
    external_urls: { spotify: string };
    release_date: string;
    images: { url: string; width: number; height: number }[];
  }> = {},
) {
  const id = overrides.id ?? 'track1';
  return {
    id,
    name: overrides.name ?? 'Song Title',
    artists: overrides.artists ?? [{ name: 'Artist' }],
    preview_url: overrides.preview_url !== undefined ? overrides.preview_url : 'https://p.scdn.co/preview.mp3',
    external_urls: overrides.external_urls ?? { spotify: `https://open.spotify.com/track/${id}` },
    album: {
      images: overrides.images ?? [{ url: 'https://img.example.com/art.jpg', width: 640, height: 640 }],
      release_date: overrides.release_date ?? '1995-06-15',
      release_date_precision: 'day' as const,
    },
  };
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('SpotifyClient', () => {
  let client: SpotifyClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new SpotifyClient('test-id', 'test-secret');
  });

  // ── token management ────────────────────────────────────────────────────────

  describe('token management', () => {
    it('fetches an access token with Client Credentials', async () => {
      mockFetch
        .mockResolvedValueOnce(tokenOk())
        .mockResolvedValueOnce(apiOk({ items: [], next: null }));

      await client.getPlaylistTracks('37i9dQZF1DXcBWIGoYBM5M');

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://accounts.spotify.com/api/token');
      expect(init.method).toBe('POST');
      expect(init.body).toBe('grant_type=client_credentials');
      expect((init.headers as Record<string, string>).Authorization).toBe(
        `Basic ${Buffer.from('test-id:test-secret').toString('base64')}`,
      );
    });

    it('reuses a cached token on the second call', async () => {
      mockFetch
        .mockResolvedValueOnce(tokenOk())
        .mockResolvedValueOnce(apiOk({ items: [], next: null }))
        .mockResolvedValueOnce(apiOk({ items: [], next: null }));

      await client.getPlaylistTracks('abc123');
      await client.getPlaylistTracks('abc123');

      const tokenCalls = mockFetch.mock.calls.filter(
        ([url]: [string]) => url === 'https://accounts.spotify.com/api/token',
      );
      expect(tokenCalls).toHaveLength(1);
    });

    it('re-fetches the token when it is about to expire', async () => {
      // First call — token valid for only 20s (< 30s buffer → will re-fetch immediately)
      mockFetch
        .mockResolvedValueOnce(tokenOk(20))
        .mockResolvedValueOnce(apiOk({ items: [], next: null }))
        .mockResolvedValueOnce(tokenOk(3600))
        .mockResolvedValueOnce(apiOk({ items: [], next: null }));

      await client.getPlaylistTracks('abc123');
      await client.getPlaylistTracks('abc123');

      const tokenCalls = mockFetch.mock.calls.filter(
        ([url]: [string]) => url === 'https://accounts.spotify.com/api/token',
      );
      expect(tokenCalls).toHaveLength(2);
    });

    it('throws when the token request fails', async () => {
      mockFetch.mockResolvedValueOnce(apiFail(401, 'Unauthorized'));
      await expect(client.getPlaylistTracks('abc')).rejects.toThrow(
        'Spotify token request failed: 401',
      );
    });
  });

  // ── getPlaylistTracks ───────────────────────────────────────────────────────

  describe('getPlaylistTracks', () => {
    it('returns a Card for a track with a preview URL', async () => {
      mockFetch
        .mockResolvedValueOnce(tokenOk())
        .mockResolvedValueOnce(apiOk({ items: [{ track: makeTrack() }], next: null }));

      const cards = await client.getPlaylistTracks('https://open.spotify.com/playlist/abc123');

      expect(cards).toHaveLength(1);
      expect(cards[0]).toEqual({
        trackId: 'track1',
        title: 'Song Title',
        artist: 'Artist',
        releaseYear: 1995,
        previewUrl: 'https://open.spotify.com/track/track1',
        albumArt: 'https://img.example.com/art.jpg',
      });
    });

    it('uses Spotify play URL instead of preview_url MP3', async () => {
      mockFetch
        .mockResolvedValueOnce(tokenOk())
        .mockResolvedValueOnce(
          apiOk({
            items: [
              { track: makeTrack({ id: 'no-preview', preview_url: null }) },
              { track: makeTrack({ id: 'track2', preview_url: 'https://p.scdn.co/2.mp3' }) },
            ],
            next: null,
          }),
        );

      const cards = await client.getPlaylistTracks('abc123');
      expect(cards).toHaveLength(2);
      expect(cards[0].previewUrl).toBe('https://open.spotify.com/track/no-preview');
      expect(cards[1].previewUrl).toBe('https://open.spotify.com/track/track2');
    });

    it('filters out null track items', async () => {
      mockFetch
        .mockResolvedValueOnce(tokenOk())
        .mockResolvedValueOnce(
          apiOk({ items: [{ track: null }, { track: makeTrack() }], next: null }),
        );

      const cards = await client.getPlaylistTracks('abc123');
      expect(cards).toHaveLength(1);
    });

    it('paginates through multiple pages', async () => {
      const page1 = Array.from({ length: 3 }, (_, i) => ({
        track: makeTrack({ id: `t${i}` }),
      }));
      const page2 = Array.from({ length: 2 }, (_, i) => ({
        track: makeTrack({ id: `t${i + 3}` }),
      }));

      mockFetch
        .mockResolvedValueOnce(tokenOk())
        .mockResolvedValueOnce(
          apiOk({
            items: page1,
            next: 'https://api.spotify.com/v1/playlists/abc/tracks?offset=50',
          }),
        )
        .mockResolvedValueOnce(apiOk({ items: page2, next: null }));

      const cards = await client.getPlaylistTracks('abc123');
      expect(cards).toHaveLength(5);
    });

    it('extracts the playlist ID from a full Spotify URL', async () => {
      mockFetch
        .mockResolvedValueOnce(tokenOk())
        .mockResolvedValueOnce(apiOk({ items: [], next: null }));

      await client.getPlaylistTracks(
        'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=xyz',
      );

      const apiCall = mockFetch.mock.calls[1] as [string];
      expect(apiCall[0]).toContain('/playlists/37i9dQZF1DXcBWIGoYBM5M/tracks');
    });

    it('throws for an unrecognisable playlist URL', async () => {
      // extractPlaylistId throws before any network call — no fetch mock needed
      await expect(client.getPlaylistTracks('not-a-url!!!')).rejects.toThrow(
        'Cannot extract playlist ID',
      );
    });

    it('handles a year-only release_date', async () => {
      mockFetch
        .mockResolvedValueOnce(tokenOk())
        .mockResolvedValueOnce(
          apiOk({ items: [{ track: makeTrack({ release_date: '1983' }) }], next: null }),
        );

      const cards = await client.getPlaylistTracks('abc');
      expect(cards[0].releaseYear).toBe(1983);
    });

    it('joins multiple artists with a comma', async () => {
      mockFetch
        .mockResolvedValueOnce(tokenOk())
        .mockResolvedValueOnce(
          apiOk({
            items: [{ track: makeTrack({ artists: [{ name: 'A' }, { name: 'B' }] }) }],
            next: null,
          }),
        );

      const cards = await client.getPlaylistTracks('abc');
      expect(cards[0].artist).toBe('A, B');
    });

    it('uses the largest album image as albumArt', async () => {
      const images = [
        { url: 'https://img.example.com/640.jpg', width: 640, height: 640 },
        { url: 'https://img.example.com/300.jpg', width: 300, height: 300 },
      ];
      mockFetch
        .mockResolvedValueOnce(tokenOk())
        .mockResolvedValueOnce(
          apiOk({ items: [{ track: makeTrack({ images }) }], next: null }),
        );

      const cards = await client.getPlaylistTracks('abc');
      expect(cards[0].albumArt).toBe('https://img.example.com/640.jpg');
    });

    it('throws when the playlist API call fails', async () => {
      mockFetch
        .mockResolvedValueOnce(tokenOk())
        .mockResolvedValueOnce(apiFail(404, 'Not Found'));

      await expect(client.getPlaylistTracks('badid')).rejects.toThrow('Spotify API error 404');
    });
  });

  // ── getGenreTracks ──────────────────────────────────────────────────────────

  describe('getGenreTracks', () => {
    it('returns cards matching the genre', async () => {
      mockFetch
        .mockResolvedValueOnce(tokenOk())
        .mockResolvedValueOnce(
          apiOk({ tracks: { items: [makeTrack({ id: 'g1' })], next: null } }),
        );

      const cards = await client.getGenreTracks('pop');
      expect(cards).toHaveLength(1);
      expect(cards[0].trackId).toBe('g1');
    });

    it('URL-encodes the genre in the search query', async () => {
      mockFetch
        .mockResolvedValueOnce(tokenOk())
        .mockResolvedValueOnce(apiOk({ tracks: { items: [], next: null } }));

      await client.getGenreTracks('90s pop');

      const [url] = mockFetch.mock.calls[1] as [string];
      expect(url).toContain('genre%3A90s%20pop');
    });

    it('uses Spotify play URL instead of preview_url MP3', async () => {
      mockFetch
        .mockResolvedValueOnce(tokenOk())
        .mockResolvedValueOnce(
          apiOk({
            tracks: {
              items: [
                makeTrack({ id: 'g1', preview_url: null }),
                makeTrack({ id: 'g2', preview_url: 'https://p.scdn.co/g2.mp3' }),
              ],
              next: null,
            },
          }),
        );

      const cards = await client.getGenreTracks('rock');
      expect(cards).toHaveLength(2);
      expect(cards[0].previewUrl).toBe('https://open.spotify.com/track/g1');
      expect(cards[1].previewUrl).toBe('https://open.spotify.com/track/g2');
    });

    it('paginates genre results across pages', async () => {
      const page1 = Array.from({ length: 50 }, (_, i) => makeTrack({ id: `g${i}` }));
      const page2 = Array.from({ length: 10 }, (_, i) => makeTrack({ id: `g${i + 50}` }));

      mockFetch
        .mockResolvedValueOnce(tokenOk())
        .mockResolvedValueOnce(
          apiOk({
            tracks: { items: page1, next: 'https://api.spotify.com/v1/search?offset=50' },
          }),
        )
        .mockResolvedValueOnce(apiOk({ tracks: { items: page2, next: null } }));

      const cards = await client.getGenreTracks('jazz', 100);
      expect(cards).toHaveLength(60);
    });

    it('stops when next is null', async () => {
      mockFetch
        .mockResolvedValueOnce(tokenOk())
        .mockResolvedValueOnce(apiOk({ tracks: { items: [makeTrack()], next: null } }));

      await client.getGenreTracks('blues');
      expect(mockFetch).toHaveBeenCalledTimes(2); // token + one page
    });

    it('stops when the page is empty', async () => {
      mockFetch
        .mockResolvedValueOnce(tokenOk())
        .mockResolvedValueOnce(
          apiOk({ tracks: { items: [], next: 'https://api.spotify.com/v1/search?offset=50' } }),
        );

      const cards = await client.getGenreTracks('jazz');
      expect(cards).toHaveLength(0);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // ── createSpotifyClient ─────────────────────────────────────────────────────

  describe('createSpotifyClient', () => {
    const origId = process.env.SPOTIFY_CLIENT_ID;
    const origSecret = process.env.SPOTIFY_CLIENT_SECRET;

    afterEach(() => {
      if (origId) process.env.SPOTIFY_CLIENT_ID = origId;
      else delete process.env.SPOTIFY_CLIENT_ID;
      if (origSecret) process.env.SPOTIFY_CLIENT_SECRET = origSecret;
      else delete process.env.SPOTIFY_CLIENT_SECRET;
    });

    it('throws when env vars are missing', () => {
      delete process.env.SPOTIFY_CLIENT_ID;
      delete process.env.SPOTIFY_CLIENT_SECRET;
      expect(() => createSpotifyClient()).toThrow('SPOTIFY_CLIENT_ID');
    });

    it('returns a SpotifyClient when env vars are present', () => {
      process.env.SPOTIFY_CLIENT_ID = 'id';
      process.env.SPOTIFY_CLIENT_SECRET = 'secret';
      expect(createSpotifyClient()).toBeInstanceOf(SpotifyClient);
    });
  });
});
