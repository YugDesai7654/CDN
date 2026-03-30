import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getBackendUrl } from "@/lib/constants";

interface UploadBody {
  filename?: string;
  content?: string;
}

/**
 * POST /api/cdn/upload
 * Proxies to Origin Server POST /files/:filename.
 * The Origin will automatically trigger a cache purge after updating.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as UploadBody;
    const { filename, content } = body;

    if (!filename || typeof filename !== "string") {
      return NextResponse.json(
        { error: "Missing 'filename' in request body" },
        { status: 400 }
      );
    }

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { error: "Missing 'content' in request body" },
        { status: 400 }
      );
    }

    const originUrl = getBackendUrl("origin");

    const res = await fetch(
      `${originUrl}/files/${encodeURIComponent(filename)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
        cache: "no-store",
      }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: `Origin returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
