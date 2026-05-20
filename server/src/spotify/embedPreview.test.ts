import {
  extractEmbedPreviewUrl,
  fetchEmbedPreviewUrl,
  isValidSpotifyTrackId,
} from './embedPreview';

const SAMPLE_HTML = `<!DOCTYPE html><html><body>
<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
  props: {
    pageProps: {
      state: {
        data: {
          entity: {
            audioPreview: {
              url: 'https://p.scdn.co/mp3-preview/c5fcaf1d5684a65cbb2ba343f19ccdc328721d54',
            },
          },
        },
      },
    },
  },
})}</script></body></html>`;

describe('extractEmbedPreviewUrl', () => {
  it('returns mp3-preview URL from __NEXT_DATA__', () => {
    expect(extractEmbedPreviewUrl(SAMPLE_HTML)).toBe(
      'https://p.scdn.co/mp3-preview/c5fcaf1d5684a65cbb2ba343f19ccdc328721d54',
    );
  });

  it('returns null when __NEXT_DATA__ is missing', () => {
    expect(extractEmbedPreviewUrl('<html></html>')).toBeNull();
  });

  it('returns null when audioPreview is missing', () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: { pageProps: { state: { data: { entity: {} } } } },
    })}</script>`;
    expect(extractEmbedPreviewUrl(html)).toBeNull();
  });

  it('rejects non-preview URLs', () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: {
        pageProps: {
          state: {
            data: {
              entity: { audioPreview: { url: 'https://open.spotify.com/track/abc' } },
            },
          },
        },
      },
    })}</script>`;
    expect(extractEmbedPreviewUrl(html)).toBeNull();
  });
});

describe('isValidSpotifyTrackId', () => {
  it('accepts 22-char alphanumeric ids', () => {
    expect(isValidSpotifyTrackId('25FTMokYEbEWHEdss5JLZS')).toBe(true);
  });

  it('rejects invalid ids', () => {
    expect(isValidSpotifyTrackId('short')).toBe(false);
    expect(isValidSpotifyTrackId('')).toBe(false);
  });
});

describe('fetchEmbedPreviewUrl', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fetches embed HTML and extracts preview URL', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => SAMPLE_HTML,
    });

    const url = await fetchEmbedPreviewUrl('25FTMokYEbEWHEdss5JLZS');
    expect(url).toBe(
      'https://p.scdn.co/mp3-preview/c5fcaf1d5684a65cbb2ba343f19ccdc328721d54',
    );
    expect(global.fetch).toHaveBeenCalledWith(
      'https://open.spotify.com/embed/track/25FTMokYEbEWHEdss5JLZS?utm_source=generator',
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it('throws on invalid track id', async () => {
    await expect(fetchEmbedPreviewUrl('bad')).rejects.toThrow('Invalid Spotify track ID');
  });
});
