import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    model:      process.env.OLLAMA_MODEL      ?? "llama3.2",
    embedModel: process.env.EMBED_MODEL       ?? "nomic-embed-text",
  });
}
