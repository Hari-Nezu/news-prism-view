import { NextRequest, NextResponse } from "next/server";
import { getSnapshotGroupDetail } from "@/lib/db";

export async function GET(req: NextRequest) {
  const snapshotId = req.nextUrl.searchParams.get("snapshotId");
  const groupId    = req.nextUrl.searchParams.get("groupId");

  if (!snapshotId || !groupId) {
    return NextResponse.json({ error: "snapshotId と groupId は必須" }, { status: 400 });
  }

  try {
    const detail = await getSnapshotGroupDetail(snapshotId, groupId);
    if (!detail) {
      return NextResponse.json({ error: "グループが見つかりません" }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (e) {
    console.error("[inspect]", e);
    return NextResponse.json({ error: "取得失敗" }, { status: 500 });
  }
}
