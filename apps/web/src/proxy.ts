import { NextResponse, type NextRequest } from "next/server";

/** 只传递公开页面的语言提示；不参与鉴权。 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.delete("x-tsz-public-locale");
  const locale = request.nextUrl.searchParams.get("lang");
  if (locale) headers.set("x-tsz-public-locale", locale);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!api/|_next/|manifest/|share-image/|icon|apple-icon).*)"]
};
