import { NextRequest, NextResponse } from "next/server";
import { getAuthToken, safeCompare, AUTH_COOKIE } from "@/lib/auth";
import { loginLimiter } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = loginLimiter.check(ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  const appPassword = process.env.APP_PASSWORD?.trim();
  if (!appPassword) {
    return NextResponse.json(
      { error: "Password protection is not configured" },
      { status: 500 },
    );
  }

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const password = body.password?.trim();
  if (!password) {
    return NextResponse.json({ error: "Password is required" }, { status: 400 });
  }

  if (!safeCompare(password, appPassword)) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const token = await getAuthToken(password);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  return response;
}
