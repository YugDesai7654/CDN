import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * GET /api/cdn/file?filename=hello.txt&edgeUrl=http://edge-node-a:3001
 * Proxies to the specified Edge Node's GET /files/:filename.
 *
 * Phase 2: The Edge Node now returns raw binary with correct Content-Type
 * headers instead of JSON.  We read the response as an ArrayBuffer, forward
 * the binary body, and pass through all CDN-specific headers so the browser
 * can render images, play audio/video, or display text directly.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const filename = searchParams.get("filename");
    const edgeUrl = searchParams.get("edgeUrl");

    if (!filename) {
      return NextResponse.json(
        { error: "Missing 'filename' query parameter" },
        { status: 400 }
      );
    }

    if (!edgeUrl) {
      return NextResponse.json(
        { error: "Missing 'edgeUrl' query parameter" },
        { status: 400 }
      );
    }

    const start = Date.now();
    const res = await fetch(
      `${edgeUrl}/files/${encodeURIComponent(filename)}`,
      { cache: "no-store" }
    );
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      const errorText = await res.text();
      return NextResponse.json(
        { error: `Edge returned ${res.status} for ${filename}`, details: errorText },
        { status: res.status }
      );
    }

    // Read the full response as an ArrayBuffer (binary-safe)
    const buffer = await res.arrayBuffer();

    // Extract CDN headers from the Edge Node response
    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const xCache = res.headers.get("x-cache") || "MISS";
    const xServedBy = res.headers.get("x-served-by") || "unknown";
    const xRegion = res.headers.get("x-region") || "unknown";
    const xCacheAge = res.headers.get("x-cache-age") || "0";

    // Build the response with binary body and forwarded headers
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.byteLength),
        "X-Cache": xCache,
        "X-Served-By": xServedBy,
        "X-Region": xRegion,
        "X-Cache-Age": xCacheAge,
        "X-Latency-Ms": String(latencyMs),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
