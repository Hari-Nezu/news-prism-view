/**
 * アプリケーション設定
 *
 * 環境変数はすべてここで読み込む。
 * 各モジュールは process.env を直接参照せず、このファイルからインポートする。
 *
 * 設定方法: プロジェクトルートの .env.local に記載する。
 *
 * ── llama.cpp サーバー ────────────────────────────────────
 *
 * LLM_BASE_URL
 *   llama.cppサーバーのベースURL（OpenAI互換API）。
 *   デフォルト: http://localhost:8080
 *
 * LLM_MODEL
 *   3軸政治分析（economic/social/diplomatic スコアリング）に使うモデル。
 *   llama.cppサーバーにロードされているモデル名を指定。
 *   デフォルト: ggml-org/gemma-4-E4B-it-Q8_0
 *
 * CLASSIFY_MODEL
 *   ニュースカテゴリ分類（8カテゴリ × 34サブカテゴリ）に使うモデル。
 *   デフォルト: ggml-org/gemma-4-E4B-it-Q8_0
 *
 * EMBED_MODEL
 *   テキストのベクトル埋め込みに使うモデル。
 *   記事の類似度計算・グルーピングに使用。出力次元: 1024。
 *   デフォルト: Targoyle/ruri-v3
 *
 * MULTI_MODELS
 *   マルチモデル分析モード（/analyze?multiModel=true）で使うモデル一覧。
 *   カンマ区切りで複数指定可能。llama.cppは1サーバー1モデルのため通常は1つ。
 *   デフォルト: ggml-org/gemma-4-E4B-it-Q8_0
 *
 * ── 類似度閾値 ─────────────────────────────────────────────
 *
 * GROUP_CLUSTER_THRESHOLD
 *   groupArticlesByEvent でのembeddingクラスタリング閾値。
 *   値が高いほど厳密（同一記事と判定しにくい）。
 *   デフォルト: 0.72
 *
 * FEED_GROUP_SIMILARITY_THRESHOLD
 *   incrementalGroupArticles での既存グループへのマッチング閾値。
 *   デフォルト: 0.68
 *
 * EMBED_CLASSIFY_THRESHOLD
 *   embeddingカテゴリ分類でのconfidence閾値。これ未満はLLMにエスカレーション。
 *   デフォルト: 0.5
 *
 * ── データベース ───────────────────────────────────────────
 *
 * DATABASE_URL
 *   PostgreSQL接続文字列。pgvectorエクステンションが必要。
 *   マイグレーション用URLは prisma.config.ts で別途管理。
 *   デフォルト: postgresql://newsprism:newsprism@localhost:5432/newsprism
 *
 * ── 外部API ───────────────────────────────────────────────
 *
 * NEWSDATA_API_KEY
 *   newsdata.io のAPIキー。未設定の場合はNewsdata取得をスキップ。
 *   取得: https://newsdata.io/
 */

// ── llama.cpp ─────────────────────────────────────────────
export const LLM_BASE_URL    = process.env.LLM_BASE_URL    ?? "http://localhost:8081";
export const LLM_MODEL       = process.env.LLM_MODEL       ?? "ggml-org/gemma-4-E4B-it-Q8_0";
export const CLASSIFY_MODEL  = process.env.CLASSIFY_MODEL  ?? "ggml-org/gemma-4-E4B-it-Q8_0";
export const EMBED_MODEL     = process.env.EMBED_MODEL     ?? "Targoyle/ruri-v3-310m-GGUF:Q8_0";
export const MULTI_MODELS    = (process.env.MULTI_MODELS   ?? "ggml-org/gemma-4-E4B-it-Q8_0")
  .split(",")
  .map((s) => s.trim());

// ── 類似度閾値 ─────────────────────────────────────────────
export const GROUP_CLUSTER_THRESHOLD   = parseFloat(process.env.GROUP_CLUSTER_THRESHOLD   ?? "0.87");
export const FEED_GROUP_SIMILARITY_THRESHOLD = parseFloat(process.env.FEED_GROUP_SIMILARITY_THRESHOLD ?? "0.87");
export const EMBED_CLASSIFY_THRESHOLD  = parseFloat(process.env.EMBED_CLASSIFY_THRESHOLD  ?? "0.5");

// ── データベース ───────────────────────────────────────────
export const DATABASE_URL = process.env.DATABASE_URL
  ?? "postgresql://newsprism:newsprism@localhost:5432/newsprism";

// ── 外部API ───────────────────────────────────────────────
export const NEWSDATA_API_KEY = process.env.NEWSDATA_API_KEY ?? null;

// ── ログ出力 ──────────────────────────────────────────────
if (typeof window === "undefined") {
  console.log("──────────────────────────────────────────────────");
  console.log("🚀 NewsPrism Configuration:");
  console.log(`📡 LLM Base URL:    ${LLM_BASE_URL}`);
  console.log(`🤖 Analysis Model: ${LLM_MODEL}`);
  console.log(`🏷️ Classify Model: ${CLASSIFY_MODEL}`);
  console.log(`📐 Embed    Model: ${EMBED_MODEL}`);
  console.log(`🔄 Multi Models:    ${MULTI_MODELS.join(", ")}`);
  console.log(`📏 Group Threshold: ${GROUP_CLUSTER_THRESHOLD}`);
  console.log("──────────────────────────────────────────────────");
}
