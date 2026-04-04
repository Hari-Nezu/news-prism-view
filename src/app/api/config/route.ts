import { NextResponse } from "next/server";
import { LLM_MODEL, CLASSIFY_MODEL, EMBED_MODEL } from "@/lib/config";

export async function GET() {
  return NextResponse.json({
    model:         LLM_MODEL,
    classifyModel: CLASSIFY_MODEL,
    embedModel:    EMBED_MODEL,
  });
}
