import { NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/constants";

export const dynamic = "force-dynamic";

/**
 * GET /api/cdn/files
 * Proxies to Origin Server GET /files — returns the list of all files
 * stored on the Origin with metadata (filename, contentType, mediaType,
 * size, lastModified).
 *
 * Used by the frontend file browser to populate a grid of available files.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const originUrl = getBackendUrl("origin");

    const res = await fetch(`${originUrl}/files`, {
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Origin returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
