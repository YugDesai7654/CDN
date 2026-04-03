import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getBackendUrl } from "@/lib/constants";

/**
 * POST /api/cdn/upload
 * Proxies upload requests to the Origin Server.
 *
 * Handles TWO cases:
 *   1. JSON body (text file, existing behavior) → Origin POST /files/:filename
 *   2. FormData (binary file upload)            → Origin POST /files/upload
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const originUrl = getBackendUrl("origin");
    const contentType = request.headers.get("content-type") || "";

    // ─── Case 1: JSON body (text file — backward compatible) ────────────
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as {
        filename?: string;
        content?: string;
      };
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
        const errorText = await res.text();
        return NextResponse.json(
          { error: `Origin returned ${res.status}`, details: errorText },
          { status: res.status }
        );
      }

      const data = await res.json();
      return NextResponse.json(data, { status: 201 });
    }

    // ─── Case 2: FormData (binary file — multipart upload) ──────────────
    // 1. Read the incoming FormData from the Next.js request
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "No file provided. Use field name 'file'." },
        { status: 400 }
      );
    }

    // 2. Load the file completely into memory.
    // **Why this is necessary**: If you try to directly forward the `File` object extracted 
    // from `request.formData()` using Node's native `fetch`, the underlying stream often gets 
    // dropped or locked, resulting in a 0-byte file arriving at the Origin server.
    // Buffering it to an ArrayBuffer guarantees the data is available for the outgoing request.
    const arrayBuffer = await file.arrayBuffer();
    const memoryBlob = new Blob([arrayBuffer], { type: file.type });

    // 3. Build a fresh FormData payload for the Origin
    const forwardForm = new FormData();
    forwardForm.append("file", memoryBlob, (file as File).name || "upload");

    // 4. Send to Origin Server
    const res = await fetch(`${originUrl}/files/upload`, {
      method: "POST",
      body: forwardForm,
      // No "Content-Type" header here! Native fetch will automatically set it to
      // 'multipart/form-data; boundary=...' when it sees the FormData body.
      cache: "no-store",
    });

    if (!res.ok) {
      const errorText = await res.text();
      let errorMessage = `Origin returned ${res.status}`;
      try {
        const parsed = JSON.parse(errorText);
        if (parsed.error) errorMessage = parsed.error;
      } catch {
        // stay with raw text
      }
      return NextResponse.json(
        { error: errorMessage, details: errorText },
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
