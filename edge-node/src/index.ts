// ─── Edge Node — CDN Caching Proxy ──────────────────────────────────────────
// An Edge Node sits at a "point of presence" (PoP) close to end-users.
// It keeps an in-memory cache of recently-requested files so that most
// requests never need to travel back to the Origin Server.  Three instances
// of this same codebase run simultaneously (Edge-A, Edge-B, Edge-C), each
// differentiated only by environment variables (NODE_ID, REGION, PORT).
//
// Phase 2 additions:
//   • Binary-aware caching — content stored as Buffer, not string
//   • Streams raw bytes with correct Content-Type headers
//   • Cache stats include mediaType breakdown
// ─────────────────────────────────────────────────────────────────────────────

import express, { Request, Response, NextFunction } from 'express';
import fetch from 'node-fetch';
import path from 'path';
import {
  CacheEntry,
  CacheEntryInfo,
  CacheStats,
  EdgeHealth,
  FileContentType,
} from './types';

// ─── ENV VAR Validation ─────────────────────────────────────────────────────
const PORT: number = parseInt(process.env.PORT || '', 10);
const NODE_ID: string | undefined = process.env.NODE_ID;
const REGION: string | undefined = process.env.REGION;
const ORIGIN_URL: string | undefined = process.env.ORIGIN_URL;
const MAX_CONNECTIONS: number = parseInt(process.env.MAX_CONNECTIONS || '', 10);

if (!PORT || isNaN(PORT)) {
  console.error('[FATAL] Missing or invalid ENV VAR: PORT');
  process.exit(1);
}
if (!NODE_ID) {
  console.error('[FATAL] Missing ENV VAR: NODE_ID');
  process.exit(1);
}
if (!REGION) {
  console.error('[FATAL] Missing ENV VAR: REGION');
  process.exit(1);
}
if (!ORIGIN_URL) {
  console.error('[FATAL] Missing ENV VAR: ORIGIN_URL');
  process.exit(1);
}
if (!MAX_CONNECTIONS || isNaN(MAX_CONNECTIONS)) {
  console.error('[FATAL] Missing or invalid ENV VAR: MAX_CONNECTIONS');
  process.exit(1);
}

// ─── MIME / Media-Type Helpers ──────────────────────────────────────────────
// Duplicated from Origin Server so both components agree on content types
// without needing a shared package.

/** Map a file extension to a MIME Content-Type string. */
function getContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    '.txt':  'text/plain',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png':  'image/png',
    '.gif':  'image/gif',
    '.webp': 'image/webp',
    '.mp3':  'audio/mpeg',
    '.wav':  'audio/wav',
    '.ogg':  'audio/ogg',
    '.m4a':  'audio/mp4',
    '.mp4':  'video/mp4',
    '.webm': 'video/webm',
  };
  return map[ext] || 'application/octet-stream';
}

/** Map a MIME Content-Type to a broad media category for the frontend. */
function getMediaType(contentType: string): FileContentType {
  if (contentType.startsWith('text/'))  return 'text';
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('audio/')) return 'audio';
  if (contentType.startsWith('video/')) return 'video';
  return 'text'; // default fallback
}

// ─── In-Memory Cache ────────────────────────────────────────────────────────
// CDN CONCEPT — Edge Cache:
// Each Edge Node maintains its own independent cache.  In Phase 1 we use a
// simple TypeScript Map keyed by filename.  In a production CDN this would
// be backed by a shared store like Redis or Varnish with TTL-based eviction.
// The cache is intentionally NOT shared between Edge instances — each PoP
// caches independently, which is how real CDNs work (Akamai, CloudFront).
//
// Phase 2: CacheEntry.data is now a Buffer, not a string, so we can cache
// binary files (images, audio, video) alongside text.
const cache: Map<string, CacheEntry> = new Map();

// ─── Active Connection Counter ──────────────────────────────────────────────
// Used by the Traffic Manager to decide load shedding.  When this exceeds
// MAX_CONNECTIONS the node reports itself as "busy" and the Traffic Manager
// will try to route new requests to a less-loaded node.
let activeConnections: number = 0;

// ─── Express App ────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// ─── Request Logger Middleware ──────────────────────────────────────────────
app.use((req: Request, _res: Response, next: NextFunction): void => {
  const timestamp: string = new Date().toISOString();
  console.log(`[${timestamp}] [Node-${NODE_ID}] ${req.method} ${req.path}`);
  next();
});

// ─── Connection Tracking Middleware ─────────────────────────────────────────
// Increment on request arrival, decrement when the response finishes.
// This gives us a real-time count of in-flight requests so the Traffic
// Manager can make informed load-shedding decisions.
app.use((_req: Request, res: Response, next: NextFunction): void => {
  activeConnections++;
  res.on('finish', (): void => {
    activeConnections--;
  });
  next();
});

// ─── GET /files/:filename ───────────────────────────────────────────────────
// The primary endpoint.  Clients (or the Traffic Manager) request a file;
// the Edge Node either serves it from cache or fetches it from the Origin.
//
// Phase 2: responses are now raw binary with correct Content-Type headers
// instead of JSON-wrapped content.  This is required for images, audio,
// and video to render correctly in the browser.
app.get(
  '/files/:filename',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { filename } = req.params;

      // ── Cache Lookup ───────────────────────────────────────────────────
      // CDN CONCEPT — Cache Hit vs Cache Miss:
      // A "cache hit" means the requested content is already stored at
      // this Edge Node.  The response is served directly from memory in
      // roughly 100 ms — no round-trip to the Origin.
      // A "cache miss" means the Edge does not have the content.  It must
      // fetch from the Origin (the "cold path"), cache the result locally,
      // and then respond.  Subsequent requests for the same file will be
      // cache hits until the entry is purged or the node restarts.
      const cached: CacheEntry | undefined = cache.get(filename);

      if (cached) {
        // ── CACHE HIT ────────────────────────────────────────────────────
        cached.hits++;
        const ageSeconds: number = Math.floor(
          (Date.now() - cached.cachedAt.getTime()) / 1000,
        );

        // Add ~100 ms delay to simulate local processing / disk I/O at PoP
        await new Promise<void>((resolve) => setTimeout(resolve, 100));

        console.log(
          `[CACHE HIT] Node-${NODE_ID} served "${filename}" from cache ` +
          `(hits: ${cached.hits}, type: ${cached.contentType})`,
        );

        // Set response headers
        res.setHeader('Content-Type', cached.contentType);
        res.setHeader('Content-Length', cached.size);
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-Age', String(ageSeconds));
        res.setHeader('X-Served-By', NODE_ID);
        res.setHeader('X-Region', REGION);

        // Send raw binary buffer — not res.json(), not res.send() with string
        res.end(cached.data);
        return;
      }

      // ── CACHE MISS — fetch from Origin ─────────────────────────────────
      // This is the "cold path".  The Edge must go all the way back to the
      // Origin Server, which has a 2 000 ms artificial delay to simulate
      // backbone latency.  Once fetched, we store the result in our local
      // cache so that all future requests for this file are fast cache hits.
      //
      // Phase 2: The Origin now streams raw binary.  We read the response
      // as an ArrayBuffer and extract metadata from response headers.
      console.log(
        `[CACHE MISS] Node-${NODE_ID} fetching "${filename}" from Origin`,
      );

      const originRes = await fetch(`${ORIGIN_URL}/files/${filename}`);

      if (!originRes.ok) {
        const errorBody = await originRes.text();
        res.status(originRes.status).json({
          error: `Origin returned ${originRes.status} for ${filename}`,
          details: errorBody,
        });
        return;
      }

      // Read the full response as a Buffer
      const buffer = Buffer.from(await originRes.arrayBuffer());

      // Extract metadata from Origin's response headers
      const contentType =
        originRes.headers.get('content-type') || getContentType(filename);
      const originFilename =
        originRes.headers.get('x-filename') || filename;
      const mediaType = getMediaType(contentType);

      // Store in local cache as Buffer
      const entry: CacheEntry = {
        filename: originFilename,
        contentType,
        mediaType,
        data: buffer,
        cachedAt: new Date(),
        hits: 0,
        size: buffer.length,
      };
      cache.set(filename, entry);

      console.log(
        `[CACHED] Node-${NODE_ID} cached "${filename}" ` +
        `(${contentType}, ${buffer.length} bytes)`,
      );

      // Set response headers
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('X-Cache', 'MISS');
      res.setHeader('X-Served-By', NODE_ID);
      res.setHeader('X-Region', REGION);

      // Stream raw binary back to client
      res.end(buffer);
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE /cache/:filename ────────────────────────────────────────────────
// Called by the Purge Service when a file is updated at the Origin.
// Removes a single entry from this node's cache so the next request
// triggers a fresh fetch from the Origin.
app.delete(
  '/cache/:filename',
  (req: Request, res: Response): void => {
    const { filename } = req.params;
    const existed: boolean = cache.delete(filename);

    console.log(
      `[PURGE] Node-${NODE_ID} purged "${filename}" (existed: ${existed})`,
    );

    res.json({ purged: true, filename, nodeId: NODE_ID });
  },
);

// ─── DELETE /cache ──────────────────────────────────────────────────────────
// Full cache wipe — removes every entry from this node's cache.
app.delete(
  '/cache',
  (_req: Request, res: Response): void => {
    const count: number = cache.size;
    cache.clear();

    console.log(`[PURGE] Node-${NODE_ID} full cache wipe (${count} entries removed)`);

    res.json({ purged: true, entriesRemoved: count, nodeId: NODE_ID });
  },
);

// ─── GET /cache/stats ───────────────────────────────────────────────────────
// Returns what this node currently has cached — useful for debugging and
// for operators to understand cache distribution across the CDN.
//
// Phase 2: entries now include contentType, mediaType, size, hits, cachedAt
// instead of just filenames, enabling richer frontend dashboards.
app.get(
  '/cache/stats',
  (_req: Request, res: Response): void => {
    const entries: CacheEntryInfo[] = Array.from(cache.values()).map(
      (entry) => ({
        filename: entry.filename,
        contentType: entry.contentType,
        mediaType: entry.mediaType,
        size: entry.size,
        hits: entry.hits,
        cachedAt: entry.cachedAt.toISOString(),
      }),
    );

    const stats: CacheStats = {
      nodeId: NODE_ID,
      region: REGION,
      totalCached: cache.size,
      entries,
      activeConnections,
    };

    res.json(stats);
  },
);

// ─── GET /health ────────────────────────────────────────────────────────────
// Polled by the Traffic Manager every 15 seconds.  The `busy` flag tells
// the GSLB whether this node can accept more traffic or should be
// load-shed in favour of a less-loaded node.
app.get(
  '/health',
  (_req: Request, res: Response): void => {
    const health: EdgeHealth = {
      status: 'ok',
      nodeId: NODE_ID,
      region: REGION,
      activeConnections,
      cacheSize: cache.size,
      busy: activeConnections > MAX_CONNECTIONS,
    };

    res.json(health);
  },
);

// ─── Global Error Middleware ────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction): void => {
  console.error(`[ERROR] Node-${NODE_ID}:`, err.message, err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ─── Start Server ───────────────────────────────────────────────────────────
app.listen(PORT, (): void => {
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Edge Node — ${NODE_ID} (Phase 2 — Multimodal)`);
  console.log('═══════════════════════════════════════════════════');
  console.log(`  PORT            : ${PORT}`);
  console.log(`  NODE_ID         : ${NODE_ID}`);
  console.log(`  REGION          : ${REGION}`);
  console.log(`  ORIGIN_URL      : ${ORIGIN_URL}`);
  console.log(`  MAX_CONNECTIONS : ${MAX_CONNECTIONS}`);
  console.log('═══════════════════════════════════════════════════');
  console.log(`  ✓ Ready — listening on port ${PORT}`);
  console.log('═══════════════════════════════════════════════════');
});
