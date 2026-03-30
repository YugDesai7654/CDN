// ─── CDN Frontend Shared Types ──────────────────────────────────────────────
// All TypeScript interfaces used across the frontend.
// Import from "@/lib/types" everywhere — never define ad-hoc types elsewhere.

/** Response from an Edge Node file fetch, enriched with CDN metadata */
export interface CDNFileResponse {
  filename: string;
  content: string;
  contentType: string;
  size: number;
  lastModified: string;
  servedAt: string;
  xCache: "HIT" | "MISS";
  latencyMs: number;
  servedBy: string;   // nodeId that served it
  region: string;
}

/** Cache statistics for a single Edge Node (GET /cache/stats) */
export interface EdgeNodeStats {
  nodeId: string;
  region: string;
  totalCached: number;
  entries: string[];
  activeConnections: number;
}

/** Health status for a single Edge Node (GET /health) */
export interface EdgeNodeHealth {
  status: string;
  nodeId: string;
  region: string;
  activeConnections: number;
  cacheSize: number;
  busy: boolean;
}

/** Traffic Manager route response (GET /route) */
export interface RouteResponse {
  edgeUrl: string;
  nodeId: string;
  region: string;
  reason: string;
}

/** Result of purging a single Edge Node */
export interface PurgeResult {
  nodeId: string;
  success: boolean;
  statusCode: number | null;
  ms: number;
  error?: string;
}

/** Full purge response with per-node results */
export interface PurgeResponse {
  filename: string;
  results: PurgeResult[];
  totalMs: number;
  timestamp: string;
}

/** Current user session, derived from the cdn-role cookie */
export interface UserSession {
  role: "admin" | "user";
  username: string;
}

/** Traffic Manager health response including edge statuses */
export interface TrafficManagerHealth {
  status: string;
  component: string;
  edges: {
    nodeId: string;
    region: string;
    url: string;
    healthy: boolean;
    busy: boolean;
    lastChecked: string;
  }[];
}

/** Generic API error response */
export interface ApiError {
  error: string;
}
