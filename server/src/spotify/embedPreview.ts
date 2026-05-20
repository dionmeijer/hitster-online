const EMBED_TRACK_URL =
  'https://open.spotify.com/embed/track';
const SPOTIFY_TRACK_ID = /^[A-Za-z0-9]{22}$/;
const PREVIEW_MP3 = /^https:\/\/p\.scdn\.co\/mp3-preview\//;

/** Parse audioPreview.url from Spotify embed SSR HTML (__NEXT_DATA__). */
export function extractEmbedPreviewUrl(html: string): string | null {
  const match = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!match) return null;

  try {
    const data = JSON.parse(match[1]) as {
      props?: {
        pageProps?: {
          state?: {
            data?: {
              entity?: {
                audioPreview?: { url?: string };
              };
            };
          };
        };
      };
    };
    const url = data?.props?.pageProps?.state?.data?.entity?.audioPreview?.url;
    if (typeof url === 'string' && PREVIEW_MP3.test(url)) return url;
    return null;
  } catch {
    return null;
  }
}

export function isValidSpotifyTrackId(trackId: string): boolean {
  return SPOTIFY_TRACK_ID.test(trackId);
}

export function isSpotifyTrackPageUrl(url: string): boolean {
  return /^https:\/\/open\.spotify\.com\/track\//.test(url);
}

export async function fetchEmbedPreviewUrl(trackId: string): Promise<string | null> {
  if (!isValidSpotifyTrackId(trackId)) {
    throw new Error('Invalid Spotify track ID');
  }

  const url = `${EMBED_TRACK_URL}/${trackId}?utm_source=generator`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; HitsterOnline/1.0)',
      Accept: 'text/html',
    },
  });

  if (!res.ok) {
    throw new Error(`Spotify embed fetch failed: ${res.status}`);
  }

  const html = await res.text();
  return extractEmbedPreviewUrl(html);
}
