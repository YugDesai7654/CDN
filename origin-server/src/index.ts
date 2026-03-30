// ─── Origin Server — CDN Source of Truth ────────────────────────────────────
// This is the "Origin" in a Content Delivery Network.  It holds the
// authoritative copy of every file.  Edge Nodes cache content from here so
// that end-users get fast responses from a nearby point-of-presence (PoP)
// instead of hitting this central store every time.
// ─────────────────────────────────────────────────────────────────────────────

import express, { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { FileRecord, HealthResponse } from './types';

// ─── ENV VAR Validation ─────────────────────────────────────────────────────
// In a real CDN the Origin would also validate credentials, TLS certs, etc.
// Here we only need the port and the Purge Service URL so edge caches can be
// invalidated when content changes.
const PORT: number = parseInt(process.env.PORT || '', 10);
const PURGE_SERVICE_URL: string | undefined = process.env.PURGE_SERVICE_URL;

if (!PORT || isNaN(PORT)) {
  console.error('[FATAL] Missing or invalid ENV VAR: PORT');
  process.exit(1);
}
if (!PURGE_SERVICE_URL) {
  console.error('[FATAL] Missing ENV VAR: PURGE_SERVICE_URL');
  process.exit(1);
}

// ─── Data Directory ─────────────────────────────────────────────────────────
// In production this would be backed by S3, GCS, or a distributed filesystem.
// For Phase 1 we keep things simple with a local /data/ directory.
const DATA_DIR: string = path.join(__dirname, '..', 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ─── Pre-load sample files ──────────────────────────────────────────────────
// A real Origin would be populated by a CMS or ingest pipeline.  We seed a
// few text files so there's something to serve immediately after startup.
const sampleFiles: Record<string, string> = {
  'hello.txt': [
    'Hello from the Origin Server!',
    'This file is served by the CDN origin.',
    'Edge nodes will cache this content to reduce latency for end-users.',
  ].join('\n'),
  'about.txt': [
    'About the CDN Project',
    'This is a simplified Content Delivery Network built for a',
    'Distributed Computing lab.  It demonstrates caching, cache',
    'invalidation, traffic routing, and load shedding.',
  ].join('\n'),
  'news.txt': [
    'CDN News — Latest Updates',
    'Edge Node C has been deployed in the Asia region.',
    'Traffic Manager now supports location-aware routing.',
    'Purge Service fan-out latency is under 50 ms.',
  ].join('\n'),
};

for (const [filename, content] of Object.entries(sampleFiles)) {
  const filePath: string = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`[INIT] Pre-loaded sample file: ${filename}`);
  }
}

// ─── Express App ────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// ─── Request Logger Middleware ──────────────────────────────────────────────
// Every CDN component should emit structured access logs so operators can
// trace a request across the system (Origin → Edge → Client).
app.use((req: Request, _res: Response, next: NextFunction): void => {
  const timestamp: string = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ─── GET /files ─────────────────────────────────────────────────────────────
// Returns a list of all files present in the Origin Server's data directory.
app.get(
  '/files',
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const files = fs.readdirSync(DATA_DIR);
      const fileList = files.map((filename) => {
        const filePath = path.join(DATA_DIR, filename);
        const stats = fs.statSync(filePath);
        return {
          filename,
          size: stats.size,
          lastModified: stats.mtime.toISOString(),
        };
      });
      res.json({ files: fileList });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /files/:filename ───────────────────────────────────────────────────
// Serves a file from the Origin's local data directory.
//
// CDN CONCEPT — "Cold Path" vs "Warm Path":
// In a real CDN the Origin is the "cold path" — the slow, authoritative
// backend that is only hit when no Edge Node has a cached copy.  The 2 000 ms
// artificial delay below simulates the latency of fetching from a faraway
// data-centre over the backbone network.  Edge Nodes (the "warm path") will
// serve the same content in ~100 ms because they keep an in-memory cache.
// The entire point of a CDN is to keep most traffic on the warm path so
// that end-users experience low latency regardless of where the Origin is.
app.get(
  '/files/:filename',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { filename } = req.params;
      const filePath: string = path.join(DATA_DIR, filename);

      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: `File not found: ${filename}` });
        return;
      }

      // ── 2 000 ms artificial delay ──────────────────────────────────────
      // This simulates the "cold path" — the high-latency trip from an
      // Edge Node all the way back to the Origin data-centre over the
      // internet backbone.  Without Edge caching every single user
      // request would pay this penalty.
      await new Promise<void>((resolve) => setTimeout(resolve, 2000));

      const content: string = fs.readFileSync(filePath, 'utf-8');
      const stats = fs.statSync(filePath);

      const record: FileRecord = {
        filename,
        content,
        contentType: 'text/plain',
        size: stats.size,
        lastModified: stats.mtime.toISOString(),
        servedAt: new Date().toISOString(),
      };

      res.json(record);
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /files/:filename ──────────────────────────────────────────────────
// Creates or updates a file on the Origin, then triggers a cache purge on
// all Edge Nodes via the Purge Service.
//
// CDN CONCEPT — Write-Through Invalidation:
// When content changes at the Origin, every cached copy on every Edge Node
// becomes stale.  The Origin fires a purge request so that the next client
// request will result in a cache MISS and pull the fresh version.  This is
// "push-based" invalidation — simpler and faster than waiting for TTL expiry.
app.post(
  '/files/:filename',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { filename } = req.params;
      const body = req.body as { content?: string };

      if (!body.content || typeof body.content !== 'string') {
        res.status(400).json({ error: 'Request body must include a "content" string field.' });
        return;
      }

      const filePath: string = path.join(DATA_DIR, filename);
      fs.writeFileSync(filePath, body.content, 'utf-8');

      const stats = fs.statSync(filePath);

      const record: FileRecord = {
        filename,
        content: body.content,
        contentType: 'text/plain',
        size: stats.size,
        lastModified: stats.mtime.toISOString(),
        servedAt: new Date().toISOString(),
      };

      console.log(`[WRITE] File created/updated: ${filename}`);

      // ── Fire-and-forget purge ──────────────────────────────────────────
      // We intentionally do NOT await this call.  The client that uploaded
      // the file should not have to wait for every Edge Node to be purged
      // before receiving a response.  If the Purge Service is temporarily
      // down the Origin still succeeds — eventual consistency is
      // acceptable here.
      try {
        fetch(`${PURGE_SERVICE_URL}/purge/${filename}`, { method: 'POST' })
          .then(() => console.log(`[PURGE] Triggered purge for: ${filename}`))
          .catch((purgeErr: unknown) =>
            console.error(`[PURGE] Failed to purge ${filename}:`, purgeErr),
          );
      } catch (purgeErr: unknown) {
        console.error(`[PURGE] Failed to trigger purge for ${filename}:`, purgeErr);
      }

      res.status(201).json(record);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /health ────────────────────────────────────────────────────────────
// Used by Docker HEALTHCHECK, the Traffic Manager, and operators to verify
// the Origin is alive.
app.get(
  '/health',
  (_req: Request, res: Response): void => {
    const health: HealthResponse = {
      status: 'ok',
      component: 'origin-server',
    };
    res.json(health);
  },
);

// ─── Global Error Middleware ────────────────────────────────────────────────
// Catches any unhandled error thrown (or passed via next(err)) in route
// handlers and returns a structured 500 response.  In production you'd also
// report to an error-tracking service like Sentry.
app.use((err: Error, _req: Request, res: Response, _next: NextFunction): void => {
  console.error('[ERROR]', err.message, err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ─── Start Server ───────────────────────────────────────────────────────────
app.listen(PORT, (): void => {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Origin Server');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  PORT              : ${PORT}`);
  console.log(`  PURGE_SERVICE_URL : ${PURGE_SERVICE_URL}`);
  console.log(`  DATA_DIR          : ${DATA_DIR}`);
  console.log('═══════════════════════════════════════════════════');
  console.log(`  ✓ Ready — listening on port ${PORT}`);
  console.log('═══════════════════════════════════════════════════');

  // TODO Phase 2: stream binary files using res.pipe() instead of res.json()
  // TODO Phase 2: integrate with AWS S3 SDK for large file storage
});
