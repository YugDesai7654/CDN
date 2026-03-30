import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getBackendUrl } from "@/lib/constants";
import type { RouteResponse } from "@/lib/types";

/**
 * GET /api/cdn/route
 * Proxies to Traffic Manager GET /route.
 * Forwards the X-Client-Location header from the client.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const tmUrl = getBackendUrl("trafficManager");
    const location = request.headers.get("x-client-location") || "";

    const headers: Record<string, string> = {};
    if (location) {
      headers["X-Client-Location"] = location;
    }

    const res = await fetch(`${tmUrl}/route`, {
      cache: "no-store",
      headers,
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Traffic Manager returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = (await res.json()) as RouteResponse;
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
