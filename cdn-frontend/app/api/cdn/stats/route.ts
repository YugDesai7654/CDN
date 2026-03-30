import { NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/constants";
import type { EdgeNodeStats } from "@/lib/types";

/**
 * GET /api/cdn/stats
 * Fetches cache stats from all 3 edge nodes in parallel.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const edgeUrls = [
      { nodeId: "A", url: getBackendUrl("edgeA") },
      { nodeId: "B", url: getBackendUrl("edgeB") },
      { nodeId: "C", url: getBackendUrl("edgeC") },
    ];

    const results = await Promise.allSettled(
      edgeUrls.map(async (edge): Promise<EdgeNodeStats> => {
        const res = await fetch(`${edge.url}/cache/stats`, {
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error(`Edge ${edge.nodeId} returned ${res.status}`);
        }
        return (await res.json()) as EdgeNodeStats;
      })
    );

    const stats: EdgeNodeStats[] = results.map(
      (result, index): EdgeNodeStats => {
        if (result.status === "fulfilled") {
          return result.value;
        }
        return {
          nodeId: edgeUrls[index].nodeId,
          region: "unknown",
          totalCached: 0,
          entries: [],
          activeConnections: 0,
        };
      }
    );

    return NextResponse.json(stats);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
