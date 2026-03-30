import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { CDNFileResponse } from "@/lib/types";

/**
 * GET /api/cdn/file?filename=hello.txt&edgeUrl=http://edge-node-a:3001
 * Proxies to the specified Edge Node's GET /files/:filename.
 * Captures X-Cache and X-Cache-Age headers and measures latency.
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
    const res = await fetch(`${edgeUrl}/files/${encodeURIComponent(filename)}`, {
      cache: "no-store",
    });
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      return NextResponse.json(
        { error: `Edge returned ${res.status} for ${filename}` },
        { status: res.status }
      );
    }

    const body = (await res.json()) as {
      filename: string;
      content: string;
      contentType: string;
      source?: string;
      cacheHit?: boolean;
    };

    const xCache = res.headers.get("x-cache") as "HIT" | "MISS" || "MISS";
    const sourceNodeId = body.source?.replace("edge-", "") || "?";

    const response: CDNFileResponse = {
      filename: body.filename,
      content: body.content,
      contentType: body.contentType,
      size: body.content.length,
      lastModified: "",
      servedAt: new Date().toISOString(),
      xCache,
      latencyMs,
      servedBy: sourceNodeId,
      region: "",
    };

    return NextResponse.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
