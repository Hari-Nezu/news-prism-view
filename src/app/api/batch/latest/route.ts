import { NextResponse } from "next/server";
import { getLatestSnapshot } from "@/lib/db";

export async function GET() {
  try {
    const result = await getLatestSnapshot();
    return NextResponse.json(result);
  } catch (e) {
    console.error("[batch/latest]", e);
    return NextResponse.json({ error: "スナップショット取得に失敗しました" }, { status: 500 });
  }
}
