import { NextResponse } from "next/server";
import { getFeedGroupsWithItems } from "@/lib/db";

export async function GET() {
  try {
    const groups = await getFeedGroupsWithItems();
    return NextResponse.json({ groups });
  } catch (e) {
    console.error("[feed-groups]", e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}
