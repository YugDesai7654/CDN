// ─── Origin Server — CDN Source of Truth ────────────────────────────────────
// This is the "Origin" in a Content Delivery Network.  It holds the
// authoritative copy of every file.  Edge Nodes cache content from here so
// that end-users get fast responses from a nearby point-of-presence (PoP)
// instead of hitting this central store every time.
//
// Phase 2 additions:
//   • Multipart file upload via multer  (POST /files/upload)
//   • Binary streaming via fs.createReadStream()  (GET /files/:filename)
//   • File listing with metadata  (GET /files)
// ─────────────────────────────────────────────────────────────────────────────

import express, { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import multer from 'multer';
import {
  FileRecord,
  HealthResponse,
  FileContentType,
  FileMetadata,
  UploadResponse,
} from './types';

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

// ─── MIME / Media-Type Helpers ──────────────────────────────────────────────
// These two functions are used both on the Origin (serve) and will be
// duplicated on the Edge Node so that both components agree on content types.

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

// ─── Allowed MIME Types & Size Limits ───────────────────────────────────────
// Strict allowlists prevent users from uploading executables, scripts, etc.
const ALLOWED_MIME_TYPES: string[] = [
  // Text
  'text/plain',
  // Images
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  // Audio
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4',
  // Video
  'video/mp4', 'video/webm', 'video/ogg',
];

/** Per-category maximum file size in bytes. */
const SIZE_LIMITS: Record<FileContentType, number> = {
  text:  2  * 1024 * 1024,   //   2 MB
  image: 5  * 1024 * 1024,   //   5 MB
  audio: 20 * 1024 * 1024,   //  20 MB
  video: 100 * 1024 * 1024,  // 100 MB
};

// ─── Multer Configuration ───────────────────────────────────────────────────
// Multer handles multipart/form-data parsing and writes the uploaded file
// directly to DATA_DIR.  We use diskStorage so large videos don't blow up
// the Node.js heap.
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, DATA_DIR);
  },
  filename: (_req, file, cb) => {
    // Sanitize: strip any path separators from the original filename
    const sanitized = file.originalname.replace(/[/\\]/g, '_');
    cb(null, sanitized);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // absolute max (video); fine-grained check below
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(new Error(`File type not allowed: ${file.mimetype}`));
      return;
    }
    cb(null, true);
  },
});

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
// Returns a list of all files present in the Origin Server's data directory,
// now including contentType and mediaType for frontend file-browser rendering.
app.get(
  '/files',
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const entries = fs.readdirSync(DATA_DIR);
      const files: FileMetadata[] = entries
        .filter((name) => {
          // Only include actual files, skip directories
          const filePath = path.join(DATA_DIR, name);
          return fs.statSync(filePath).isFile();
        })
        .map((filename) => {
          const filePath = path.join(DATA_DIR, filename);
          const stats = fs.statSync(filePath);
          const contentType = getContentType(filename);
          return {
            filename,
            contentType,
            mediaType: getMediaType(contentType),
            size: stats.size,
            lastModified: stats.mtime.toISOString(),
          };
        });
      res.json({ files });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /files/:filename ───────────────────────────────────────────────────
// Serves a file from the Origin's local data directory as a BINARY STREAM.
//
// CDN CONCEPT — "Cold Path" vs "Warm Path":
// In a real CDN the Origin is the "cold path" — the slow, authoritative
// backend that is only hit when no Edge Node has a cached copy.  The 2 000 ms
// artificial delay below simulates the latency of fetching from a faraway
// data-centre over the backbone network.  Edge Nodes (the "warm path") will
// serve the same content in ~100 ms because they keep an in-memory cache.
// The entire point of a CDN is to keep most traffic on the warm path so
// that end-users experience low latency regardless of where the Origin is.
//
// Phase 2 change: we now stream raw bytes with correct Content-Type instead
// of wrapping everything in JSON.  This is essential for images, audio, and
// video — you cannot JSON-encode a binary file.
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

      const stats = fs.statSync(filePath);
      const contentType = getContentType(filename);

      // Cold path penalty — simulates backbone latency to origin
      await new Promise<void>((resolve) => setTimeout(resolve, 2000));

      // Set response headers so Edge Nodes and clients know the type + size
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', stats.size);
      res.setHeader('X-Filename', filename);
      res.setHeader('X-Last-Modified', stats.mtime.toISOString());

      // Stream the file — efficient for large video files
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /files/upload (multipart — binary file upload) ────────────────────
// Accepts multipart/form-data with a single field "file".
// Multer writes the file directly to DATA_DIR using disk storage.
// After saving, we validate the per-category size limit and fire a purge.
app.post(
  '/files/upload',
  (req: Request, res: Response, next: NextFunction): void => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err) {
        // Multer or fileFilter error
        const message = err instanceof Error ? err.message : 'Upload failed';
        res.status(400).json({ error: message });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'No file provided. Use field name "file".' });
        return;
      }

      const file = req.file;
      const contentType = getContentType(file.filename);
      const mediaType = getMediaType(contentType);
      const maxSize = SIZE_LIMITS[mediaType];

      // ── Fine-grained size validation ─────────────────────────────────
      // Multer already enforces the absolute max (100 MB) but we also
      // need per-category limits (e.g. images ≤ 5 MB).
      if (file.size > maxSize) {
        // Remove the already-saved file
        try {
          fs.unlinkSync(file.path);
        } catch {
          // ignore cleanup errors
        }
        const maxMB = (maxSize / (1024 * 1024)).toFixed(0);
        res.status(413).json({
          error: `File too large. Max size for ${mediaType} is ${maxMB}MB, got ${(file.size / (1024 * 1024)).toFixed(2)}MB.`,
        });
        return;
      }

      console.log(`[UPLOAD] ${file.filename} (${contentType}, ${file.size} bytes)`);

      // ── Fire-and-forget purge ────────────────────────────────────────
      try {
        fetch(`${PURGE_SERVICE_URL}/purge/${file.filename}`, { method: 'POST' })
          .then(() => console.log(`[PURGE] Triggered purge for: ${file.filename}`))
          .catch((purgeErr: unknown) =>
            console.error(`[PURGE] Failed to purge ${file.filename}:`, purgeErr),
          );
      } catch (purgeErr: unknown) {
        console.error(`[PURGE] Failed to trigger purge for ${file.filename}:`, purgeErr);
      }

      const response: UploadResponse = {
        filename: file.filename,
        contentType,
        size: file.size,
        uploadedAt: new Date().toISOString(),
      };

      res.status(201).json(response);
    });
  },
);

// ─── POST /files/:filename (text — backward compatible) ─────────────────────
// Creates or updates a TEXT file on the Origin, then triggers a cache purge on
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
  console.log('  Origin Server (Phase 2 — Multimodal)');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  PORT              : ${PORT}`);
  console.log(`  PURGE_SERVICE_URL : ${PURGE_SERVICE_URL}`);
  console.log(`  DATA_DIR          : ${DATA_DIR}`);
  console.log(`  Accepted types    : ${ALLOWED_MIME_TYPES.join(', ')}`);
  console.log('═══════════════════════════════════════════════════');
  console.log(`  ✓ Ready — listening on port ${PORT}`);
  console.log('═══════════════════════════════════════════════════');
});
