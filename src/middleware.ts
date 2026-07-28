import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, expectedTokenEdge } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const password = process.env.OPERATOR_PASSWORD;
  if (!password) return NextResponse.next(); // gate disabled

  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/auth") return NextResponse.next();

  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (cookie && cookie === (await expectedTokenEdge(password))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const login = req.nextUrl.clone();
  login.pathname = "/login";
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
