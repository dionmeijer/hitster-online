/** True when playback uses a Spotify play link (not an in-browser MP3 preview). */
export function isSpotifyTrackPageUrl(url: string): boolean {
  return /^https:\/\/open\.spotify\.com\/track\//.test(url);
}
