/** True when playback uses a Spotify play link (not an in-browser MP3 preview). */
export function isSpotifyTrackPageUrl(url: string): boolean {
  return /^https:\/\/open\.spotify\.com\/track\//.test(url);
}

/** MP3 stream URL when available (playlist preview); not the turn play-page link. */
export function cardStreamUrl(card: { previewUrl: string; streamUrl?: string | null }): string | null {
  if (card.streamUrl) return card.streamUrl;
  if (!isSpotifyTrackPageUrl(card.previewUrl)) return card.previewUrl;
  return null;
}
