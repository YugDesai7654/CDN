import { NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/constants";
import type { TrafficManagerHealth } from "@/lib/types";

/**
 * GET /api/cdn/health
 * Proxies to Traffic Manager GET /health, which returns status of all edge nodes.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const tmUrl = getBackendUrl("trafficManager");

    const res = await fetch(`${tmUrl}/health`, { cache: "no-store" });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Traffic Manager returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = (await res.json()) as TrafficManagerHealth;
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
