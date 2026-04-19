import { NextRequest, NextResponse } from "next/server";

// /ranking のみ認証不要
const PUBLIC_PREFIXES = ["/ranking"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

export function middleware(request: NextRequest) {
  if (isPublic(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const password = process.env.INTERNAL_PASSWORD;
  if (!password) {
    // 未設定 = 開発モード。認証スキップ
    return NextResponse.next();
  }

  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    const decoded = Buffer.from(auth.slice(6), "base64").toString();
    const colonIdx = decoded.indexOf(":");
    const pwd = colonIdx >= 0 ? decoded.slice(colonIdx + 1) : decoded;
    if (pwd === password) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="NewsPrism Internal"',
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|favicon\\.svg).*)"],
};
