// Shared storage-key constants. The app's settings + high-score
// persistence keys live in `utils/settings.js` and `utils/highscores.js`
// as module-internal constants -- tests redeclare them here rather than
// importing private values, so a future refactor of either module
// produces a clear test failure instead of silently breaking storage.

export const STORAGE_KEY_SETTINGS = 'a-series-of-snakes:settings';

export const STORAGE_PREFIX_HIGHSCORES = 'a-series-of-snakes:hs:';

/** Build the full localStorage key for a high-score bucket. */
export const highScoreKey = (gameKey) => STORAGE_PREFIX_HIGHSCORES + gameKey;
