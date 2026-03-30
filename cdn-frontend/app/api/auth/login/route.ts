import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  CREDENTIALS,
  AUTH_COOKIE_NAME,
  USERNAME_COOKIE_NAME,
  COOKIE_MAX_AGE,
} from "@/lib/constants";

interface LoginBody {
  username?: string;
  password?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as LoginBody;
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    // Check against hardcoded credentials
    let matchedRole: "admin" | "user" | null = null;

    if (
      username === CREDENTIALS.admin.username &&
      password === CREDENTIALS.admin.password
    ) {
      matchedRole = "admin";
    } else if (
      username === CREDENTIALS.user.username &&
      password === CREDENTIALS.user.password
    ) {
      matchedRole = "user";
    }

    if (!matchedRole) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Set HttpOnly cookies for role and username
    const response = NextResponse.json({
      success: true,
      role: matchedRole,
      username,
      redirectTo: matchedRole === "admin" ? "/dashboard" : "/viewer",
    });

    response.cookies.set(AUTH_COOKIE_NAME, matchedRole, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });

    response.cookies.set(USERNAME_COOKIE_NAME, username, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
