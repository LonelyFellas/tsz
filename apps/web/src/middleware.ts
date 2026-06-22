// 路由级粗粒度鉴权。细粒度操作显隐放在组件里用角色判断。
import { NextResponse, type NextRequest } from "next/server";

const TOKEN_COOKIE = "tsz_token";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(TOKEN_COOKIE)?.value;

  // 未登录访问受保护区 → 跳登录。
  const isProtected =
    pathname.startsWith("/teacher") ||
    pathname.startsWith("/student") ||
    pathname.startsWith("/apply-teacher");

  if (isProtected && !token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // 角色级判断(teacher/student 区)留待接入 session 后补充。
  return NextResponse.next();
}

export const config = {
  matcher: ["/teacher/:path*", "/student/:path*", "/apply-teacher/:path*"]
};
