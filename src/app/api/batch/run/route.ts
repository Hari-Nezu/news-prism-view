import { NextResponse } from "next/server";
import { BATCH_SERVER_URL } from "@/lib/config";

export async function POST() {
  try {
    const res = await fetch(`${BATCH_SERVER_URL}/run`, {
      method: "POST",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: "バッチサーバーがエラーを返しました" }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[batch/run]", e);
    return NextResponse.json({ error: "バッチサーバーに接続できませんでした" }, { status: 502 });
  }
}
