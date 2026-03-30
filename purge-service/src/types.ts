// ─── Purge Service Shared Types ─────────────────────────────────────────────

/**
 * The result of purging a single Edge Node.
 * `success` is false if the node was unreachable or returned an error.
 * `ms` records the round-trip time so operators can spot slow nodes.
 */
export interface PurgeResult {
  nodeId: string;
  success: boolean;
  statusCode: number | null;
  ms: number;
  error?: string;
}

/**
 * The full response returned by POST /purge/:filename and POST /purge.
 * Contains per-node results, total latency, and a timestamp for the
 * purge history log.
 */
export interface PurgeResponse {
  filename: string | 'ALL';
  results: PurgeResult[];
  totalMs: number;
  timestamp: string;
}

/**
 * Configuration for a single Edge Node that the Purge Service
 * will send DELETE requests to.
 */
export interface EdgeTarget {
  nodeId: string;
  url: string;
}
