import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getBackendUrl } from "@/lib/constants";
import type { PurgeResponse } from "@/lib/types";

/**
 * POST /api/cdn/purge
 * Proxies to Purge Service.
 *   Body: { filename: "hello.txt" } → POST /purge/hello.txt
 *   Body: { filename: "ALL" }       → POST /purge (full wipe)
 *   No body / empty                  → POST /purge (full wipe)
 *
 * GET /api/cdn/purge
 * Proxies to Purge Service GET /purge/history
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const purgeUrl = getBackendUrl("purge");

    let filename = "ALL";
    try {
      const body = (await request.json()) as { filename?: string };
      if (body.filename && body.filename !== "ALL") {
        filename = body.filename;
      }
    } catch {
      // No body — full purge
    }

    const url =
      filename === "ALL"
        ? `${purgeUrl}/purge`
        : `${purgeUrl}/purge/${encodeURIComponent(filename)}`;

    const res = await fetch(url, {
      method: "POST",
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Purge Service returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = (await res.json()) as PurgeResponse;
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const purgeUrl = getBackendUrl("purge");

    const res = await fetch(`${purgeUrl}/purge/history`, {
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Purge Service returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = (await res.json()) as PurgeResponse[];
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
