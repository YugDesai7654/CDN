// ─── Origin Server Shared Types ─────────────────────────────────────────────
// These interfaces define the shape of every HTTP response the Origin Server
// sends, ensuring type-safe communication between services.

// ─── Media Type Categories ──────────────────────────────────────────────────
// Used across Origin + Edge to classify files into high-level categories
// for rendering decisions on the frontend.
export type FileContentType = 'text' | 'image' | 'audio' | 'video';

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
 * Metadata for a file stored on the Origin.
 * Returned by the GET /files list endpoint.
 */
export interface FileMetadata {
  filename: string;
  contentType: string;
  mediaType: FileContentType;
  size: number;
  lastModified: string;
}

/**
 * Response returned after a successful multipart file upload.
 */
export interface UploadResponse {
  filename: string;
  contentType: string;
  size: number;
  uploadedAt: string;
}

/**
 * Standard health-check response used by Docker HEALTHCHECK and
 * the Traffic Manager's polling loop.
 */
export interface HealthResponse {
  status: string;
  component: string;
}
