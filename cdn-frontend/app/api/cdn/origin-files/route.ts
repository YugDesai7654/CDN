import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET() {
  const originUrl = process.env.ORIGIN_URL;
  if (!originUrl) {
    return NextResponse.json({ error: "ORIGIN_URL environment variable missing" }, { status: 500 });
  }

  try {
    const res = await fetch(`${originUrl}/files`);
    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch files from origin server" },
        { status: res.status }
      );
    }
    
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Origin Fetch Error:", error);
    return NextResponse.json({ error: "Failed to connect to Origin Server" }, { status: 502 });
  }
}
