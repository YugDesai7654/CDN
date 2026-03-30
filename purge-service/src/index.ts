// ─── Purge Service — Cache Consistency Controller ───────────────────────────
// When content changes at the Origin, stale cached copies must be removed
// from every Edge Node.  The Purge Service is responsible for this "fan-out"
// invalidation.  It receives a purge request (from the Origin's POST handler)
// and sends parallel DELETE requests to all Edge Nodes.
//
// CDN CONCEPT — Cache Invalidation:
// "There are only two hard things in Computer Science: cache invalidation
// and naming things." — Phil Karlton.  In production CDNs this is
// implemented through:
//   • Push invalidation (what we do here) — Origin tells edges to purge
//   • TTL-based expiry — cached entries auto-expire after N seconds
//   • Stale-while-revalidate — serve stale content while fetching fresh
// Push invalidation is the fastest but most complex approach.  We use
// Promise.allSettled() to ensure one failing edge never blocks the others.
// ─────────────────────────────────────────────────────────────────────────────

import express, { Request, Response, NextFunction } from 'express';
import fetch from 'node-fetch';
import { PurgeResult, PurgeResponse, EdgeTarget } from './types';

// ─── ENV VAR Validation ─────────────────────────────────────────────────────
const PORT: number = parseInt(process.env.PORT || '', 10);
const EDGE_A_URL: string | undefined = process.env.EDGE_A_URL;
const EDGE_B_URL: string | undefined = process.env.EDGE_B_URL;
const EDGE_C_URL: string | undefined = process.env.EDGE_C_URL;

if (!PORT || isNaN(PORT)) {
  console.error('[FATAL] Missing or invalid ENV VAR: PORT');
  process.exit(1);
}
if (!EDGE_A_URL) {
  console.error('[FATAL] Missing ENV VAR: EDGE_A_URL');
  process.exit(1);
}
if (!EDGE_B_URL) {
  console.error('[FATAL] Missing ENV VAR: EDGE_B_URL');
  process.exit(1);
}
if (!EDGE_C_URL) {
  console.error('[FATAL] Missing ENV VAR: EDGE_C_URL');
  process.exit(1);
}

// ─── Edge Node Targets ──────────────────────────────────────────────────────
const edgeTargets: EdgeTarget[] = [
  { nodeId: 'A', url: EDGE_A_URL },
  { nodeId: 'B', url: EDGE_B_URL },
  { nodeId: 'C', url: EDGE_C_URL },
];

// ─── Purge History ──────────────────────────────────────────────────────────
// Keep the last 50 purge operations in memory (FIFO).  In production this
// would be persisted to a database for audit trails, but for Phase 1 an
// in-memory array is sufficient.
const purgeHistory: PurgeResponse[] = [];
const MAX_HISTORY: number = 50;

function addToHistory(entry: PurgeResponse): void {
  purgeHistory.push(entry);
  if (purgeHistory.length > MAX_HISTORY) {
    purgeHistory.shift(); // FIFO — drop the oldest entry
  }
}

// ─── Fan-Out Purge Function ─────────────────────────────────────────────────
// Sends DELETE requests to all Edge Nodes in PARALLEL and collects results.
//
// CDN CONCEPT — Partial Failure Tolerance:
// In a distributed system you must assume that any node can fail at any
// time.  Using Promise.allSettled() (instead of Promise.all()) ensures
// that one unreachable edge node does NOT prevent the other nodes from
// being purged.  The caller always gets a 200 response with per-node
// results, including which nodes succeeded and which failed.  This is
// a key principle: "don't let a partial failure become a total failure."
async function fanOutPurge(
  deleteUrl: (target: EdgeTarget) => string,
  label: string,
): Promise<{ results: PurgeResult[]; totalMs: number }> {
  const overallStart: number = Date.now();

  const settled = await Promise.allSettled(
    edgeTargets.map(
      async (target: EdgeTarget): Promise<PurgeResult> => {
        const start: number = Date.now();
        try {
          const res = await fetch(deleteUrl(target), { method: 'DELETE' });
          const ms: number = Date.now() - start;

          console.log(
            `[PURGE] ${label} → Node-${target.nodeId}: ${res.status} (${ms}ms)`,
          );

          return {
            nodeId: target.nodeId,
            success: res.ok,
            statusCode: res.status,
            ms,
          };
        } catch (err: unknown) {
          const ms: number = Date.now() - start;
          const errorMessage: string =
            err instanceof Error ? err.message : 'Unknown error';

          console.error(
            `[PURGE] ${label} → Node-${target.nodeId}: FAILED (${ms}ms) — ${errorMessage}`,
          );

          return {
            nodeId: target.nodeId,
            success: false,
            statusCode: null,
            ms,
            error: errorMessage,
          };
        }
      },
    ),
  );

  // Map PromiseSettledResult to PurgeResult — fulfilled results already
  // have the right shape; rejected results should never happen because
  // we catch inside the mapper, but we handle them defensively.
  const results: PurgeResult[] = settled.map(
    (outcome: PromiseSettledResult<PurgeResult>): PurgeResult => {
      if (outcome.status === 'fulfilled') {
        return outcome.value;
      }
      // This branch should be unreachable due to our internal try/catch,
      // but TypeScript requires us to handle it.
      return {
        nodeId: 'unknown',
        success: false,
        statusCode: null,
        ms: 0,
        error:
          outcome.reason instanceof Error
            ? outcome.reason.message
            : 'Unknown rejection',
      };
    },
  );

  const totalMs: number = Date.now() - overallStart;
  return { results, totalMs };
}

// ─── Express App ────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// ─── Request Logger Middleware ──────────────────────────────────────────────
app.use((req: Request, _res: Response, next: NextFunction): void => {
  const timestamp: string = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ─── POST /purge/:filename ──────────────────────────────────────────────────
// Purge a specific file from all Edge Node caches.
// Called by the Origin Server when a file is updated via POST /files/:filename.
app.post(
  '/purge/:filename',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { filename } = req.params;
      console.log(`[PURGE] Initiating purge for: ${filename}`);

      const { results, totalMs } = await fanOutPurge(
        (target: EdgeTarget): string => `${target.url}/cache/${filename}`,
        filename,
      );

      const response: PurgeResponse = {
        filename,
        results,
        totalMs,
        timestamp: new Date().toISOString(),
      };

      addToHistory(response);

      console.log(
        `[PURGE] Completed purge for "${filename}" in ${totalMs}ms ` +
          `(${results.filter((r: PurgeResult): boolean => r.success).length}/${results.length} succeeded)`,
      );

      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /purge ────────────────────────────────────────────────────────────
// Full cache wipe — purge ALL entries from every Edge Node.
app.post(
  '/purge',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      console.log('[PURGE] Initiating FULL cache wipe across all edges');

      const { results, totalMs } = await fanOutPurge(
        (target: EdgeTarget): string => `${target.url}/cache`,
        'ALL',
      );

      const response: PurgeResponse = {
        filename: 'ALL',
        results,
        totalMs,
        timestamp: new Date().toISOString(),
      };

      addToHistory(response);

      console.log(
        `[PURGE] Completed full wipe in ${totalMs}ms ` +
          `(${results.filter((r: PurgeResult): boolean => r.success).length}/${results.length} succeeded)`,
      );

      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /purge/history ─────────────────────────────────────────────────────
// Returns the last 50 purge operations.  Useful for debugging cache
// consistency issues and for the lab report.
app.get(
  '/purge/history',
  (_req: Request, res: Response): void => {
    res.json(purgeHistory);
  },
);

// ─── GET /health ────────────────────────────────────────────────────────────
app.get(
  '/health',
  (_req: Request, res: Response): void => {
    res.json({
      status: 'ok',
      component: 'purge-service',
      edgesConfigured: edgeTargets.length,
    });
  },
);

// ─── Global Error Middleware ────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction): void => {
  console.error('[ERROR]', err.message, err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ─── Start Server ───────────────────────────────────────────────────────────
app.listen(PORT, (): void => {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Purge Service');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  PORT       : ${PORT}`);
  console.log(`  EDGE_A_URL : ${EDGE_A_URL}`);
  console.log(`  EDGE_B_URL : ${EDGE_B_URL}`);
  console.log(`  EDGE_C_URL : ${EDGE_C_URL}`);
  console.log(`  HISTORY    : last ${MAX_HISTORY} entries`);
  console.log('═══════════════════════════════════════════════════');
  console.log(`  ✓ Ready — listening on port ${PORT}`);
  console.log('═══════════════════════════════════════════════════');
});
