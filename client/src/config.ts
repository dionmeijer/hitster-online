/**
 * Base URL for REST and Socket.io.
 * Uses VITE_SERVER_URL when set; otherwise the current page origin (production
 * or Vite dev with proxy). Falls back to localhost only outside the browser.
 */
export function getServerUrl(): string {
  const fromEnv = import.meta.env.VITE_SERVER_URL;
  if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv;
  if (typeof window !== 'undefined') return window.location.origin;
  return 'http://localhost:3000';
}
