// Simple in-memory rate limiter for API routes
// In production, use Redis-based rate limiting

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
}

export function rateLimit(
  identifier: string,
  options: RateLimitOptions = { windowMs: 60_000, maxRequests: 30 }
): { allowed: boolean; remaining: number; resetAt: number } {
  cleanup();

  const now = Date.now();
  const entry = store.get(identifier);

  if (!entry || now > entry.resetAt) {
    store.set(identifier, {
      count: 1,
      resetAt: now + options.windowMs,
    });
    return { allowed: true, remaining: options.maxRequests - 1, resetAt: now + options.windowMs };
  }

  entry.count++;

  if (entry.count > options.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return { allowed: true, remaining: options.maxRequests - entry.count, resetAt: entry.resetAt };
}

export function getRateLimitKey(request: Request, suffix?: string): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || 'unknown';
  return `${ip}:${suffix || 'default'}`;
}
