// Tiny localStorage-backed high score store. One list per game key, capped
// to MAX_ENTRIES and sorted descending. Safe to call when localStorage is
// unavailable (private mode, SSR) -- read returns [], write is a no-op.

const PREFIX = 'a-series-of-snakes:hs:';
export const MAX_ENTRIES = 10;
export const NAME_LEN = 3;

function safeStorage() {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * @param {string} gameKey
 * @returns {Array<{ name: string, score: number }>}
 */
export function loadScores(gameKey) {
  const ls = safeStorage();
  if (!ls) return [];
  try {
    const raw = ls.getItem(PREFIX + gameKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e) => e && typeof e.name === 'string' && Number.isFinite(e.score)
      )
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

/**
 * Insert a new entry and return the updated list (top MAX_ENTRIES, desc).
 * @param {string} gameKey
 * @param {string} name
 * @param {number} score
 */
export function saveScore(gameKey, name, score) {
  const list = loadScores(gameKey);
  list.push({ name: sanitizeName(name), score: score | 0 });
  list.sort((a, b) => b.score - a.score);
  list.length = Math.min(list.length, MAX_ENTRIES);
  const ls = safeStorage();
  if (ls) {
    try {
      ls.setItem(PREFIX + gameKey, JSON.stringify(list));
    } catch {
      /* quota / disabled -- give up silently */
    }
  }
  return list;
}

/** True if `score` would make the top MAX_ENTRIES list. */
export function qualifies(gameKey, score) {
  if (!Number.isFinite(score) || score <= 0) return false;
  const list = loadScores(gameKey);
  if (list.length < MAX_ENTRIES) return true;
  return score > list[list.length - 1].score;
}

/** Highest stored score, or 0 if none. */
export function topScore(gameKey) {
  const list = loadScores(gameKey);
  return list.length ? list[0].score : 0;
}

/**
 * Strip a free-form string to uppercase A-Z, capped at NAME_LEN. No
 * padding -- callers that need a fixed-width name use `sanitizeName`.
 * @param {unknown} name
 */
export function sanitizeInitials(name) {
  return String(name ?? '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, NAME_LEN);
}

/** Force a name to NAME_LEN uppercase A-Z, padded with '_' if too short. */
export function sanitizeName(name) {
  return sanitizeInitials(name).padEnd(NAME_LEN, '_');
}
