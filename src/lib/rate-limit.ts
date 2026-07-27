const attempts = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;

export function checkRateLimit(key: string, limit = MAX_ATTEMPTS, windowMs = WINDOW_MS): boolean {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= limit) {
    return false;
  }

  entry.count++;
  return true;
}

export function getRateLimitRemaining(key: string, limit = MAX_ATTEMPTS): number {
  const entry = attempts.get(key);
  if (!entry) return limit;
  return Math.max(0, limit - entry.count);
}

export function resetRateLimit(key: string): void {
  attempts.delete(key);
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of attempts) {
    if (now > entry.resetAt) attempts.delete(key);
  }
}, 60_000);
