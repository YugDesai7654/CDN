// ─── Edge Node Shared Types ─────────────────────────────────────────────────
// These interfaces define the data structures used by every Edge Node
// instance, as well as the shape of the Origin Server's response that
// we parse when fetching on a cache miss.

/**
 * A single entry in the in-memory cache Map.
 * `hits` tracks how many times this entry was served from cache,
 * useful for monitoring cache efficiency.
 */
export interface CacheEntry {
  filename: string;
  content: string;
  contentType: string;
  cachedAt: Date;
  hits: number;
}

/**
 * Returned by GET /cache/stats so operators can inspect what each
 * Edge Node currently has cached.
 */
export interface CacheStats {
  nodeId: string;
  region: string;
  totalCached: number;
  entries: string[];
  activeConnections: number;
}

/**
 * Returned by GET /health.  The Traffic Manager polls this endpoint
 * to decide whether to route traffic to this node.
 * `busy` is true when activeConnections exceeds MAX_CONNECTIONS.
 */
export interface EdgeHealth {
  status: string;
  nodeId: string;
  region: string;
  activeConnections: number;
  cacheSize: number;
  busy: boolean;
}

/**
 * The JSON shape returned by the Origin Server's GET /files/:filename
 * endpoint.  We cast the fetch response body to this interface so that
 * all downstream code is fully typed.
 */
export interface OriginFileResponse {
  filename: string;
  content: string;
  contentType: string;
  size: number;
  lastModified: string;
  servedAt: string;
}
