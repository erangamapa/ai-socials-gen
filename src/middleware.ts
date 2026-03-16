import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthToken, safeCompare, AUTH_COOKIE } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout"];
const API_INNGEST = "/api/inngest";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-DNS-Prefetch-Control": "off",
};

let _authBypassWarned = false;

export async function middleware(request: NextRequest) {
  const appPassword = process.env.APP_PASSWORD?.trim();
  if (!appPassword) {
    if (!_authBypassWarned) {
      console.warn(
        "[SECURITY] APP_PASSWORD is not set — authentication is disabled. " +
        "Set APP_PASSWORD in your environment variables for production deployments.",
      );
      _authBypassWarned = true;
    }
    const response = NextResponse.next();
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) response.headers.set(k, v);
    return response;
  }

  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    const response = NextResponse.next();
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) response.headers.set(k, v);
    return response;
  }
  if (pathname.startsWith(API_INNGEST)) {
    const response = NextResponse.next();
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) response.headers.set(k, v);
    return response;
  }

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const expectedToken = await getAuthToken(appPassword);
  if (token && safeCompare(token, expectedToken)) {
    const response = NextResponse.next();
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) response.headers.set(k, v);
    return response;
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirect", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
