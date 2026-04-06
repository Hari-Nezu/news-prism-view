import { NextResponse } from "next/server";
import { getSnapshotHistory } from "@/lib/db";

export async function GET() {
  try {
    const history = await getSnapshotHistory();
    return NextResponse.json({ history });
  } catch (e) {
    console.error("[batch/history]", e);
    return NextResponse.json({ error: "履歴取得に失敗しました" }, { status: 500 });
  }
}
