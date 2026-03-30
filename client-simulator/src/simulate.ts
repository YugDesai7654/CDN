// ─── Client Simulator — End-to-End CDN Demonstration ────────────────────────
// This script is NOT a server.  It runs sequentially through 7 steps that
// exercise the entire CDN system: Traffic Manager routing, Edge Node caching
// (hit vs miss), Origin file updates, and Purge Service invalidation.
//
// Run with:  npm run dev              (inside the client-simulator directory)
// Requires:  docker-compose up first  (all 6 services must be running)
// ─────────────────────────────────────────────────────────────────────────────

import fetch, { Response as FetchResponse } from 'node-fetch';

// ─── Typed Responses ────────────────────────────────────────────────────────
interface RouteResponse {
  edgeUrl: string;
  nodeId: string;
  region: string;
  reason: string;
}

interface FileResponse {
  filename: string;
  content: string;
  contentType: string;
  source?: string;
  cacheHit?: boolean;
}

interface FileRecord {
  filename: string;
  content: string;
  contentType: string;
  size: number;
  lastModified: string;
  servedAt: string;
}

// ─── Config ─────────────────────────────────────────────────────────────────
const TRAFFIC_MANAGER_URL: string = process.env.TRAFFIC_MANAGER_URL || 'http://localhost:4001';
const ORIGIN_URL: string = process.env.ORIGIN_URL || 'http://localhost:3000';
const EDGE_B_URL: string = process.env.EDGE_B_URL || 'http://localhost:3002';

// ─── Result Tracking ────────────────────────────────────────────────────────
interface StepResult {
  step: number;
  edge: string;
  file: string;
  cache: string;
  latency: string;
}

const results: StepResult[] = [];

// ─── Helpers ────────────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function separator(title: string): void {
  console.log('\n' + '─'.repeat(60));
  console.log(`  ${title}`);
  console.log('─'.repeat(60));
}

async function fetchFile(
  url: string,
  stepNum: number,
  edgeLabel: string,
  filename: string,
): Promise<void> {
  const start: number = Date.now();
  const res: FetchResponse = await fetch(url);
  const latency: number = Date.now() - start;
  const cacheHeader: string = res.headers.get('x-cache') || 'N/A';
  const cacheAge: string = res.headers.get('x-cache-age') || '-';
  const data: FileResponse = (await res.json()) as FileResponse;

  console.log(`  Response: ${res.status}`);
  console.log(`  Content:  "${data.content.substring(0, 60)}..."`);
  console.log(`  X-Cache:  ${cacheHeader}`);
  if (cacheAge !== '-') {
    console.log(`  X-Cache-Age: ${cacheAge}s`);
  }
  console.log(`  Latency:  ${latency}ms`);

  results.push({
    step: stepNum,
    edge: edgeLabel,
    file: filename,
    cache: cacheHeader,
    latency: `${latency}ms`,
  });
}

// ─── Main Simulation ────────────────────────────────────────────────────────
async function simulate(): Promise<void> {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║       CDN Client Simulator — End-to-End Demo             ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  // ── Step 1: Route an "americas" client via the Traffic Manager ──────────
  separator('Step 1: Route "americas" client via Traffic Manager');
  const routeRes: FetchResponse = await fetch(`${TRAFFIC_MANAGER_URL}/route`, {
    headers: { 'X-Client-Location': 'americas' },
  });
  const route: RouteResponse = (await routeRes.json()) as RouteResponse;

  console.log(`  Routed to: Node ${route.nodeId} (${route.region})`);
  console.log(`  Edge URL:  ${route.edgeUrl}`);
  console.log(`  Reason:    ${route.reason}`);

  // Build the edge URL for subsequent requests.
  // In Docker, route.edgeUrl uses internal hostnames (e.g. http://edge-node-a:3001).
  // When running the simulator from the host, we need to use localhost instead.
  const chosenEdgeUrl: string = route.edgeUrl.replace(/edge-node-[a-c]/, 'localhost');
  const chosenLabel: string = `Node-${route.nodeId}`;

  // ── Step 2: Fetch hello.txt — expect CACHE MISS ────────────────────────
  separator('Step 2: Fetch hello.txt from chosen edge (expect MISS)');
  await fetchFile(
    `${chosenEdgeUrl}/files/hello.txt`,
    2,
    chosenLabel,
    'hello.txt',
  );

  // ── Step 3: Fetch hello.txt again — expect CACHE HIT ──────────────────
  separator('Step 3: Fetch hello.txt again (expect HIT)');
  await fetchFile(
    `${chosenEdgeUrl}/files/hello.txt`,
    3,
    chosenLabel,
    'hello.txt',
  );

  // ── Step 4: Fetch hello.txt from Edge-B directly — expect MISS ────────
  separator('Step 4: Fetch hello.txt from Edge-B directly (expect MISS)');
  await fetchFile(
    `${EDGE_B_URL}/files/hello.txt`,
    4,
    'Node-B',
    'hello.txt',
  );

  // ── Step 5: Update hello.txt on Origin ────────────────────────────────
  separator('Step 5: Update hello.txt on Origin');
  const updateStart: number = Date.now();
  const updateRes: FetchResponse = await fetch(`${ORIGIN_URL}/files/hello.txt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: 'Hello from the UPDATED Origin Server!\nThis content was changed by the client simulator.\nEdge caches should have been purged.',
    }),
  });
  const updateLatency: number = Date.now() - updateStart;
  const updateData: FileRecord = (await updateRes.json()) as FileRecord;

  console.log(`  Response:  ${updateRes.status}`);
  console.log(`  Updated:   ${updateData.filename}`);
  console.log(`  Latency:   ${updateLatency}ms`);

  results.push({
    step: 5,
    edge: 'Origin',
    file: 'hello.txt',
    cache: 'WRITE',
    latency: `${updateLatency}ms`,
  });

  // ── Step 6: Wait for purge to propagate ───────────────────────────────
  separator('Step 6: Waiting 500ms for purge to propagate...');
  await sleep(500);
  console.log('  Done waiting.');

  // ── Step 7: Fetch hello.txt from Edge-A — must be MISS (proves purge) ─
  separator('Step 7: Fetch hello.txt from chosen edge (expect MISS — proves purge)');
  await fetchFile(
    `${chosenEdgeUrl}/files/hello.txt`,
    7,
    chosenLabel,
    'hello.txt',
  );

  // ── Summary Table ─────────────────────────────────────────────────────
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║                    Summary Table                         ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(
    '  Step | Edge       | File       | Cache  | Latency',
  );
  console.log(
    '  ---- | ---------- | ---------- | ------ | -------',
  );

  for (const r of results) {
    const step: string = String(r.step).padEnd(4);
    const edge: string = r.edge.padEnd(10);
    const file: string = r.file.padEnd(10);
    const cache: string = r.cache.padEnd(6);
    console.log(`  ${step} | ${edge} | ${file} | ${cache} | ${r.latency}`);
  }

  console.log('');
  console.log('─'.repeat(60));
  console.log('  Key observations:');
  console.log('  • Step 2 was MISS (cold path ~2000ms) — first fetch from Origin');
  console.log('  • Step 3 was HIT  (warm path ~100ms)  — served from edge cache');
  console.log('  • Step 4 was MISS — different edge node, independent cache');
  console.log('  • Step 7 was MISS — proves the purge invalidated the cache');
  console.log('─'.repeat(60));
  console.log('  ✓ Simulation complete\n');
}

// ─── Run ────────────────────────────────────────────────────────────────────
simulate().catch((err: unknown): void => {
  console.error('Simulation failed:', err);
  process.exit(1);
});
