import { NextRequest, NextResponse } from "next/server";
import { getAuthToken, AUTH_COOKIE } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const appPassword = process.env.APP_PASSWORD?.trim();
  if (!appPassword) {
    return NextResponse.json(
      { error: "Password protection is not configured" },
      { status: 500 }
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

  if (password !== appPassword) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const token = await getAuthToken(password);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });
  return response;
}
