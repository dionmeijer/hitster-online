/** Default and maximum cards on a timeline to win a round. */
export const CARDS_TO_WIN_DEFAULT = 6;
export const CARDS_TO_WIN_MAX = 6;
export const CARDS_TO_WIN_MIN = 1;

/** HITSTER! challenge window after placement (ms). Server may shorten in TEST_MODE. */
export const CHALLENGE_WINDOW_MS = 3_000;

/** Max game-log lines kept per round (newest dropped). */
export const GAME_LOG_MAX_ENTRIES = 50;

/** Max time to listen and place before the turn is auto-skipped (ms). Server may shorten in TEST_MODE. */
export const TURN_PLACE_TIMEOUT_MS = 30_000;
