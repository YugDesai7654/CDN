import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware — protects /dashboard (admin only) and /viewer (admin or user).
 * Reads the "cdn-role" cookie set by /api/auth/login.
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const role = request.cookies.get("cdn-role")?.value;

  // /dashboard/** → admin only
  if (pathname.startsWith("/dashboard")) {
    if (role !== "admin") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  // /viewer/** → admin or user
  if (pathname.startsWith("/viewer")) {
    if (role !== "admin" && role !== "user") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  // /login → redirect away if already logged in
  if (pathname === "/login") {
    if (role === "admin") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    if (role === "user") {
      return NextResponse.redirect(new URL("/viewer", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/viewer/:path*", "/login"],
};
