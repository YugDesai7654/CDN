// ─── Traffic Manager / GSLB — Global Server Load Balancer ───────────────────
// In a real CDN this component is the "Global Server Load Balancer" (GSLB).
// When a client wants content it first asks the Traffic Manager "which Edge
// Node should I talk to?".  The TM picks the best node based on:
//   1. Geographic proximity (which PoP is closest to the client?)
//   2. Current load (is that PoP overloaded?)
//   3. Health (is the node even alive?)
// Companies like Akamai and CloudFront implement this via DNS-based routing
// (GeoDNS / latency-based DNS).  Here we simplify it to an HTTP API that
// returns the chosen Edge URL.
// ─────────────────────────────────────────────────────────────────────────────

import express, { Request, Response, NextFunction } from 'express';
import fetch from 'node-fetch';
import {
  EdgeNodeConfig,
  EdgeNodeStatus,
  EdgeHealthResponse,
  RouteResponse,
} from './types';

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

// ─── Edge Node Registry ────────────────────────────────────────────────────
// Static configuration of all Edge Nodes in the CDN fleet.
const edgeNodes: EdgeNodeConfig[] = [
  { nodeId: 'A', region: 'americas', url: EDGE_A_URL },
  { nodeId: 'B', region: 'europe', url: EDGE_B_URL },
  { nodeId: 'C', region: 'asia', url: EDGE_C_URL },
];

// ─── In-Memory Health Status ────────────────────────────────────────────────
// Updated every 15 seconds by the background health poll loop.
// Between polls the Traffic Manager uses the last-known status to make
// routing decisions — this is acceptable because routing is best-effort
// and a brief period of stale health data won't cause data loss.
let edgeStatus: EdgeNodeStatus[] = edgeNodes.map(
  (node: EdgeNodeConfig): EdgeNodeStatus => ({
    ...node,
    healthy: false,
    busy: false,
    lastChecked: new Date(0), // epoch — means "never checked"
  }),
);

// ─── Round-Robin Counter ────────────────────────────────────────────────────
// Used when the client's location is unknown (no X-Client-Location header).
let roundRobinIndex: number = 0;

// ─── Routing Priority Table ────────────────────────────────────────────────
// CDN CONCEPT — GeoDNS / Anycast Routing:
// In production CDNs the "priority table" is computed dynamically from BGP
// route announcements and RTT measurements.  Here we hard-code it to
// demonstrate the concept: clients in the Americas should prefer Edge-A,
// European clients should prefer Edge-B, Asian clients Edge-C.  Fallback
// order ensures availability even if the primary PoP is down or overloaded.
const priorityTable: Record<string, string[]> = {
  americas: ['A', 'B', 'C'],
  europe: ['B', 'A', 'C'],
  asia: ['C', 'B', 'A'],
};

// ─── Health Poll Function ───────────────────────────────────────────────────
// Polls GET /health on every Edge Node and updates the in-memory status
// array.  On fetch failure the node is marked unhealthy but the loop
// continues — one unreachable node must never break the entire router.
async function pollEdgeHealth(): Promise<void> {
  console.log('[HEALTH POLL] Checking all edge nodes...');

  const updatedStatus: EdgeNodeStatus[] = await Promise.all(
    edgeNodes.map(
      async (node: EdgeNodeConfig): Promise<EdgeNodeStatus> => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);

          const res = await fetch(`${node.url}/health`, {
            signal: controller.signal as unknown as import('node-fetch').RequestInit['signal'],
          });
          clearTimeout(timeoutId);

          if (!res.ok) {
            console.log(`[HEALTH POLL] Node-${node.nodeId}: HTTP ${res.status}`);
            return {
              ...node,
              healthy: false,
              busy: false,
              lastChecked: new Date(),
            };
          }

          const data: EdgeHealthResponse =
            (await res.json()) as EdgeHealthResponse;

          console.log(
            `[HEALTH POLL] Node-${node.nodeId}: healthy=${true} busy=${data.busy} connections=${data.activeConnections}`,
          );

          return {
            ...node,
            healthy: true,
            busy: data.busy,
            lastChecked: new Date(),
          };
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : 'Unknown error';
          console.log(
            `[HEALTH POLL] Node-${node.nodeId}: UNREACHABLE (${message})`,
          );
          return {
            ...node,
            healthy: false,
            busy: false,
            lastChecked: new Date(),
          };
        }
      },
    ),
  );

  edgeStatus = updatedStatus;
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

// ─── GET /route ─────────────────────────────────────────────────────────────
// The main GSLB endpoint.  A client sends its location via the
// X-Client-Location header; the TM returns the URL of the best Edge Node.
app.get(
  '/route',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const location: string | undefined = req.headers['x-client-location'] as
        | string
        | undefined;

      let priorityOrder: string[];

      if (location && priorityTable[location]) {
        // Known region — use the geographic priority table
        priorityOrder = priorityTable[location];
      } else {
        // Unknown location — fall back to round-robin across all nodes
        // CDN CONCEPT — Round-Robin Fallback:
        // When we can't determine the client's location (e.g. the header
        // is missing or contains an unknown region) we distribute traffic
        // evenly across all healthy nodes using round-robin.  This ensures
        // no single node bears disproportionate load from "unlocated" clients.
        const healthyNodes: EdgeNodeStatus[] = edgeStatus.filter(
          (n: EdgeNodeStatus): boolean => n.healthy,
        );
        if (healthyNodes.length > 0) {
          const chosen: EdgeNodeStatus =
            healthyNodes[roundRobinIndex % healthyNodes.length];
          roundRobinIndex++;

          const route: RouteResponse = {
            edgeUrl: chosen.url,
            nodeId: chosen.nodeId,
            region: chosen.region,
            reason: 'round-robin (no location header)',
          };

          console.log(
            `Routing <unknown> → Node ${chosen.nodeId} (reason: round-robin)`,
          );

          res.json(route);
          return;
        }

        // No healthy nodes at all — fall through to load-shedding logic below
        priorityOrder = ['A', 'B', 'C'];
      }

      // ── Try each node in priority order ────────────────────────────────
      // CDN CONCEPT — Load Shedding:
      // In a real CDN, when an Edge Node is overloaded we "shed" its load
      // by redirecting traffic to the next-best node.  This is preferable
      // to queuing requests (which would increase latency for everyone)
      // because CDN traffic is latency-sensitive — users would rather get
      // a response from a slightly farther node in 150 ms than wait 2 000
      // ms in a queue at the closest node.  We redirect instead of queue
      // because serving stale-but-fast content beats fresh-but-slow content
      // in most CDN use-cases (video streaming, static assets, etc.).
      for (const nodeId of priorityOrder) {
        const node: EdgeNodeStatus | undefined = edgeStatus.find(
          (n: EdgeNodeStatus): boolean =>
            n.nodeId === nodeId && n.healthy && !n.busy,
        );

        if (node) {
          const reason: string = location
            ? `geo-priority for ${location}`
            : 'first available';

          const route: RouteResponse = {
            edgeUrl: node.url,
            nodeId: node.nodeId,
            region: node.region,
            reason,
          };

          console.log(
            `Routing <${location || 'unknown'}> → Node ${node.nodeId} (reason: ${reason})`,
          );

          res.json(route);
          return;
        }
      }

      // ── All nodes busy — use primary anyway (load-shed fallback) ───────
      // If every node in the priority list is either unhealthy or busy,
      // we still route to the primary (first in priority) and set a header
      // to indicate load shedding is active.  Dropping the request entirely
      // would be worse than sending it to a busy node.
      const fallbackNodeId: string = priorityOrder[0];
      const fallbackNode: EdgeNodeStatus | undefined = edgeStatus.find(
        (n: EdgeNodeStatus): boolean => n.nodeId === fallbackNodeId,
      );

      if (fallbackNode) {
        const route: RouteResponse = {
          edgeUrl: fallbackNode.url,
          nodeId: fallbackNode.nodeId,
          region: fallbackNode.region,
          reason: 'load-shed fallback (all nodes busy)',
        };

        console.log(
          `Routing <${location || 'unknown'}> → Node ${fallbackNode.nodeId} (reason: load-shed fallback — ALL nodes busy)`,
        );

        res.setHeader('X-Load-Shed', 'true');
        res.json(route);
        return;
      }

      // Absolute worst case — no nodes configured or all unreachable
      res.status(503).json({
        error: 'No edge nodes available',
        reason: 'All edge nodes are unhealthy and unreachable',
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /health ────────────────────────────────────────────────────────────
// Returns the last-known status of all Edge Nodes.  Used by operators and
// for the Traffic Manager's own health check.
app.get(
  '/health',
  (_req: Request, res: Response): void => {
    res.json({
      status: 'ok',
      component: 'traffic-manager',
      edges: edgeStatus.map((n: EdgeNodeStatus) => ({
        nodeId: n.nodeId,
        region: n.region,
        url: n.url,
        healthy: n.healthy,
        busy: n.busy,
        lastChecked: n.lastChecked.toISOString(),
      })),
    });
  },
);

// ─── Global Error Middleware ────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction): void => {
  console.error('[ERROR]', err.message, err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ─── Start Server ───────────────────────────────────────────────────────────
// We perform one immediate health poll BEFORE accepting any traffic.  This
// ensures the routing table is populated on the first /route request.
async function start(): Promise<void> {
  console.log('[INIT] Performing initial health poll before accepting traffic...');
  await pollEdgeHealth();

  // ── Background Health Poll — every 15 seconds ──────────────────────
  setInterval(pollEdgeHealth, 15_000);

  app.listen(PORT, (): void => {
    console.log('═══════════════════════════════════════════════════');
    console.log('  Traffic Manager / GSLB');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  PORT       : ${PORT}`);
    console.log(`  EDGE_A_URL : ${EDGE_A_URL}`);
    console.log(`  EDGE_B_URL : ${EDGE_B_URL}`);
    console.log(`  EDGE_C_URL : ${EDGE_C_URL}`);
    console.log('═══════════════════════════════════════════════════');
    console.log(`  ✓ Ready — listening on port ${PORT}`);
    console.log('═══════════════════════════════════════════════════');
  });
}

start().catch((err: unknown): void => {
  console.error('[FATAL] Failed to start Traffic Manager:', err);
  process.exit(1);
});
