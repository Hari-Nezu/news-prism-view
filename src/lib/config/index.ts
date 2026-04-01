/**
 * アプリケーション設定
 *
 * 環境変数はすべてここで読み込む。
 * 各モジュールは process.env を直接参照せず、このファイルからインポートする。
 *
 * 設定方法: プロジェクトルートの .env.local に記載する。
 *
 * ── Ollama（ローカルLLMサーバー） ──────────────────────────
 *
 * OLLAMA_BASE_URL
 *   OllamaサーバーのベースURL。
 *   デフォルト: http://localhost:11434
 *
 * OLLAMA_MODEL
 *   3軸政治分析（economic/social/diplomatic スコアリング）に使うモデル。
 *   精度が重要なため、思考力の高いモデルを推奨。
 *   デフォルト: gemma3:12b
 *
 * CLASSIFY_MODEL
 *   ニュースカテゴリ分類（8カテゴリ × 34サブカテゴリ）に使うモデル。
 *   分類タスクは軽量なため、小型モデルで十分。
 *   デフォルト: gemma3:4b
 *
 * EMBED_MODEL
 *   テキストのベクトル埋め込みに使うモデル。
 *   記事の類似度計算・グルーピングに使用。出力次元: 768。
 *   デフォルト: nomic-embed-text
 *
 * MULTI_MODELS
 *   マルチモデル分析モード（/analyze?multiModel=true）で使うモデル一覧。
 *   カンマ区切りで複数指定可能。
 *   デフォルト: gemma3:12b,qwen3.5:4b,llama3.2
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

// ── Ollama ────────────────────────────────────────────────
export const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
export const OLLAMA_MODEL    = process.env.OLLAMA_MODEL    ?? "gemma3:12b";
export const CLASSIFY_MODEL  = process.env.CLASSIFY_MODEL  ?? "gemma3:4b";
export const EMBED_MODEL     = process.env.EMBED_MODEL     ?? "nomic-embed-text";
export const MULTI_MODELS    = (process.env.MULTI_MODELS   ?? "gemma3:12b,qwen3.5:4b,llama3.2")
  .split(",")
  .map((s) => s.trim());

// ── 類似度閾値 ─────────────────────────────────────────────
export const GROUP_CLUSTER_THRESHOLD   = parseFloat(process.env.GROUP_CLUSTER_THRESHOLD   ?? "0.72");
export const FEED_GROUP_SIMILARITY_THRESHOLD = parseFloat(process.env.FEED_GROUP_SIMILARITY_THRESHOLD ?? "0.68");
export const EMBED_CLASSIFY_THRESHOLD  = parseFloat(process.env.EMBED_CLASSIFY_THRESHOLD  ?? "0.5");

// ── データベース ───────────────────────────────────────────
export const DATABASE_URL = process.env.DATABASE_URL
  ?? "postgresql://newsprism:newsprism@localhost:5432/newsprism";

// ── 外部API ───────────────────────────────────────────────
export const NEWSDATA_API_KEY = process.env.NEWSDATA_API_KEY ?? null;
