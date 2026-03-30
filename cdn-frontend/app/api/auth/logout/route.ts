import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, USERNAME_COOKIE_NAME } from "@/lib/constants";

export async function POST(): Promise<NextResponse> {
  const response = NextResponse.json({ success: true });

  // Clear both auth cookies
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0, // expires immediately
  });

  response.cookies.set(USERNAME_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
