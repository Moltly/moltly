type AttemptRecord = {
  count: number;
  expiresAt: number;
  lockedUntil?: number;
};

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

declare global {
  // eslint-disable-next-line no-var
  var loginAttemptCache: Map<string, AttemptRecord> | undefined;
}

const attemptCache: Map<string, AttemptRecord> = global.loginAttemptCache || new Map();

if (!global.loginAttemptCache) {
  global.loginAttemptCache = attemptCache;
}

function now(): number {
  return Date.now();
}

function purgeIfExpired(key: string, record: AttemptRecord | undefined): AttemptRecord | undefined {
  if (!record) {
    return undefined;
  }

  const current = now();
  if (record.lockedUntil && record.lockedUntil <= current) {
    attemptCache.delete(key);
    return undefined;
  }

  if (record.expiresAt <= current) {
    attemptCache.delete(key);
    return undefined;
  }

  return record;
}

export function evaluateLoginRateLimit(key: string): { allowed: true } | { allowed: false; message: string } {
  const record = purgeIfExpired(key, attemptCache.get(key));

  if (record?.lockedUntil && record.lockedUntil > now()) {
    return {
      allowed: false,
      message: "Too many sign-in attempts. Please try again later."
    };
  }

  return { allowed: true };
}

export function recordFailedLoginAttempt(key: string): void {
  const current = now();
  const existing = purgeIfExpired(key, attemptCache.get(key));

  if (!existing) {
    attemptCache.set(key, {
      count: 1,
      expiresAt: current + WINDOW_MS
    });
    return;
  }

  const nextCount = existing.count + 1;
  const nextRecord: AttemptRecord = {
    count: nextCount,
    expiresAt: existing.expiresAt
  };

  if (nextCount >= MAX_ATTEMPTS) {
    nextRecord.lockedUntil = current + LOCKOUT_MS;
  }

  attemptCache.set(key, nextRecord);
}

export function clearLoginAttempts(key: string): void {
  attemptCache.delete(key);
}
