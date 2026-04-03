// ─── Edge Node Shared Types ─────────────────────────────────────────────────
// These interfaces define the data structures used by every Edge Node
// instance, as well as the shape of the Origin Server's response that
// we parse when fetching on a cache miss.

// ─── Media Type Category ────────────────────────────────────────────────────
// Mirrors the Origin Server's FileContentType.
export type FileContentType = 'text' | 'image' | 'audio' | 'video';

/**
 * A single entry in the in-memory cache Map.
 * Phase 2: `data` is now a Buffer that stores ALL content types (text and
 * binary).  This lets the Edge stream raw bytes back to the client with the
 * correct Content-Type instead of wrapping everything in JSON.
 * `hits` tracks how many times this entry was served from cache,
 * useful for monitoring cache efficiency.
 */
export interface CacheEntry {
  filename: string;
  contentType: string;
  mediaType: FileContentType;
  data: Buffer;        // stores ALL content types as Buffer
  cachedAt: Date;
  hits: number;
  size: number;
}

/**
 * Rich metadata for a single cache entry, used in the stats endpoint
 * so the frontend can display media-type breakdowns.
 */
export interface CacheEntryInfo {
  filename: string;
  contentType: string;
  mediaType: FileContentType;
  size: number;
  hits: number;
  cachedAt: string;
}

/**
 * Returned by GET /cache/stats so operators can inspect what each
 * Edge Node currently has cached.
 * Phase 2: `entries` is now an array of CacheEntryInfo objects with
 * mediaType breakdown instead of a simple string array of filenames.
 */
export interface CacheStats {
  nodeId: string;
  region: string;
  totalCached: number;
  entries: CacheEntryInfo[];
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
 *
 * NOTE (Phase 2): The Origin now streams raw binary instead of JSON.
 * This interface is kept for backward reference but the Edge Node now
 * reads the response as an ArrayBuffer and extracts metadata from headers.
 */
export interface OriginFileResponse {
  filename: string;
  content: string;
  contentType: string;
  size: number;
  lastModified: string;
  servedAt: string;
}
