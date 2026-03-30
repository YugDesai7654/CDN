// ─── Constants ──────────────────────────────────────────────────────────────
// Hardcoded credentials (never exposed to client — only used in API routes)
// and backend URL helpers read from process.env at runtime.

/** Hardcoded demo credentials — checked server-side in /api/auth/login */
export const CREDENTIALS = {
  admin: { username: "admin", password: "admin123", role: "admin" as const },
  user: { username: "user", password: "user123", role: "user" as const },
} as const;

/** Auth cookie name */
export const AUTH_COOKIE_NAME = "cdn-role";
export const USERNAME_COOKIE_NAME = "cdn-username";

/** Cookie max-age in seconds (24 hours) */
export const COOKIE_MAX_AGE = 60 * 60 * 24;

/**
 * Backend service URLs — read from process.env (server-side only).
 * These are never sent to the client; the Next.js API routes act as proxies.
 */
export function getBackendUrl(service: string): string {
  const urls: Record<string, string | undefined> = {
    origin: process.env.ORIGIN_URL,
    edgeA: process.env.EDGE_A_URL,
    edgeB: process.env.EDGE_B_URL,
    edgeC: process.env.EDGE_C_URL,
    purge: process.env.PURGE_SERVICE_URL,
    trafficManager: process.env.TRAFFIC_MANAGER_URL,
  };

  const url = urls[service];
  if (!url) {
    throw new Error(`Missing environment variable for service: ${service}`);
  }
  return url;
}

/** Region display info — emoji flags + labels */
export const REGION_INFO: Record<string, { emoji: string; label: string }> = {
  americas: { emoji: "🌎", label: "Americas" },
  europe: { emoji: "🌍", label: "Europe" },
  asia: { emoji: "🌏", label: "Asia" },
};

/** Node ID → region mapping */
export const NODE_REGIONS: Record<string, string> = {
  A: "americas",
  B: "europe",
  C: "asia",
};

/** Max connections threshold for progress bar coloring */
export const MAX_CONNECTIONS_DISPLAY = 10;
