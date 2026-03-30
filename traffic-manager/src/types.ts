// ─── Traffic Manager / GSLB Shared Types ────────────────────────────────────

/**
 * Static configuration for an Edge Node — loaded from ENV VARS at startup.
 */
export interface EdgeNodeConfig {
  nodeId: string;
  region: string;
  url: string;
}

/**
 * Runtime status of an Edge Node, updated by the periodic health-poll loop.
 * Extends the static config with liveness and load information.
 */
export interface EdgeNodeStatus extends EdgeNodeConfig {
  healthy: boolean;
  busy: boolean;
  lastChecked: Date;
}

/**
 * Returned by GET /route — tells the client which Edge Node to use.
 * `reason` is a human-readable explanation of the routing decision,
 * useful for debugging and for demonstrating GSLB concepts in the lab.
 */
export interface RouteResponse {
  edgeUrl: string;
  nodeId: string;
  region: string;
  reason: string;
}

/**
 * The shape of the JSON returned by each Edge Node's GET /health endpoint.
 * We cast the fetch response body to this interface for type-safe access.
 */
export interface EdgeHealthResponse {
  status: string;
  nodeId: string;
  region: string;
  activeConnections: number;
  cacheSize: number;
  busy: boolean;
}
