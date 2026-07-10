import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { nextUrl } = req;
  const isApiAuthRoute = nextUrl.pathname.startsWith("/api/auth");
  const isPublicRoute = nextUrl.pathname === "/login" || nextUrl.pathname.startsWith("/api/public");

  if (isApiAuthRoute) {
    return NextResponse.next();
  }

  if (isPublicRoute) {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL("/dashboard", nextUrl));
    }
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    let callbackUrl = nextUrl.pathname;
    if (nextUrl.search) {
      callbackUrl += nextUrl.search;
    }
    const encodedCallbackUrl = encodeURIComponent(callbackUrl);
    return NextResponse.redirect(new URL(`/login?callbackUrl=${encodedCallbackUrl}`, nextUrl));
  }

  const userRole = (req.auth?.user as any)?.role;
  const pathname = nextUrl.pathname;

  // Scoping Role Access:
  // DEVELOPER: All pages
  // OWNER: Dashboard, Kasir, Daftar Belanja, Produk, Stok Produk, Keuangan, Laporan, User Management
  // KOORLAP: Dashboard, Kasir, Daftar Belanja, Stok Produk, Laporan
  // KASIR: Dashboard, Kasir, Daftar Belanja

  if (pathname.startsWith("/pengaturan") && userRole !== "DEVELOPER") {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  if (pathname.startsWith("/user-management") && userRole !== "DEVELOPER" && userRole !== "OWNER") {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  if (pathname.startsWith("/outlet") && userRole !== "DEVELOPER" && userRole !== "OWNER") {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  if (pathname.startsWith("/keuangan") && userRole !== "DEVELOPER" && userRole !== "OWNER") {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  if (pathname.startsWith("/produk") && userRole !== "DEVELOPER" && userRole !== "OWNER") {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  if (pathname.startsWith("/stok-opname") && userRole !== "DEVELOPER" && userRole !== "OWNER" && userRole !== "KOORLAP") {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  if (pathname.startsWith("/stok") && userRole !== "DEVELOPER" && userRole !== "OWNER" && userRole !== "KOORLAP") {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  if (pathname.startsWith("/input-stok") && userRole !== "DEVELOPER" && userRole !== "OWNER" && userRole !== "KOORLAP") {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  if (pathname.startsWith("/laporan") && userRole === "KASIR") {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.svg$|.*\\.ico$|.*\\.webp$|.*\\.gif$).*)"],
};
