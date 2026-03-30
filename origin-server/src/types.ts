// ─── Origin Server Shared Types ─────────────────────────────────────────────
// These interfaces define the shape of every HTTP response the Origin Server
// sends, ensuring type-safe communication between services.

/**
 * Represents a single file record returned by GET /files/:filename.
 * Every field is serialised as JSON and consumed by Edge Nodes.
 */
export interface FileRecord {
  filename: string;
  content: string;
  contentType: string;
  size: number;
  lastModified: string;
  servedAt: string;
}

/**
 * Standard health-check response used by Docker HEALTHCHECK and
 * the Traffic Manager's polling loop.
 */
export interface HealthResponse {
  status: string;
  component: string;
}
