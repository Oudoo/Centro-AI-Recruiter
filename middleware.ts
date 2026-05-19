// Edge middleware: HTTP Basic Auth gate on /admin and /api/admin routes.
//
// This is a temporary stand-in until Phase 1.5 (Zoho One SSO) ships. The HR Director
// demo runs on shared credentials the TA team can use. Set ADMIN_USERNAME +
// ADMIN_PASSWORD in .env.local to enable. Leave empty to disable the gate (useful
// for pure-localhost dev only — NEVER ship to Vercel with this empty).

import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isAdmin = path.startsWith("/admin") || path.startsWith("/api/admin");
  if (!isAdmin) return NextResponse.next();

  const expectedUser = process.env.ADMIN_USERNAME ?? "";
  const expectedPass = process.env.ADMIN_PASSWORD ?? "";

  // Auth disabled — pass through (dev only). Warn loudly via response header so we
  // notice if this ever happens in production.
  if (!expectedUser || !expectedPass) {
    const res = NextResponse.next();
    res.headers.set("X-Admin-Auth-Disabled", "true");
    return res;
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Basic ")) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Centro AI Recruiter Admin"'
      }
    });
  }

  let provided: { user: string; pass: string };
  try {
    const decoded = atob(authHeader.slice(6));
    const idx = decoded.indexOf(":");
    provided = {
      user: idx >= 0 ? decoded.slice(0, idx) : decoded,
      pass: idx >= 0 ? decoded.slice(idx + 1) : ""
    };
  } catch {
    return new NextResponse("Invalid auth header", { status: 401 });
  }

  if (provided.user !== expectedUser || provided.pass !== expectedPass) {
    return new NextResponse("Invalid credentials", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Centro AI Recruiter Admin"'
      }
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"]
};
