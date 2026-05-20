// ============================================================
// Hitster Online — Shared TypeScript Types
// Imported by both server and client. Define ALL types here.
// ============================================================
export function isGameLogFlipLine(entry) {
    return 'title' in entry && 'correct' in entry;
}
