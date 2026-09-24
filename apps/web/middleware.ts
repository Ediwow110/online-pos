import { NextRequest, NextResponse } from "next/server";

const protectedPaths = ["/dashboard", "/pos", "/inventory", "/sales", "/customers", "/receipt", "/branches", "/billing", "/transfers"];

export function middleware(request: NextRequest) {
  if (protectedPaths.some((path) => request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(`${path}/`))) {
    if (!request.cookies.has("pos_session")) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", request.nextUrl.pathname);
      return NextResponse.redirect(login);
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*", "/pos/:path*", "/inventory/:path*", "/sales/:path*", "/customers/:path*", "/receipt/:path*", "/branches/:path*", "/billing/:path*", "/transfers/:path*"] };
