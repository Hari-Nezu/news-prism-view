import { NextResponse } from "next/server";
import { OLLAMA_MODEL, CLASSIFY_MODEL, EMBED_MODEL } from "@/lib/config";

export async function GET() {
  return NextResponse.json({
    model:         OLLAMA_MODEL,
    classifyModel: CLASSIFY_MODEL,
    embedModel:    EMBED_MODEL,
  });
}
