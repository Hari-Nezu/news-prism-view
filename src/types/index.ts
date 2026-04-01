export interface AxisScore {
  economic: number;    // -1.0 (市場原理) ～ +1.0 (再分配)
  social: number;      // -1.0 (伝統・秩序) ～ +1.0 (多様性・個人の自由)
  diplomatic: number;  // -1.0 (抑止力・タカ派) ～ +1.0 (対話・ハト派)
}

export interface AnalysisResult {
  scores: AxisScore;
  emotionalTone: number;    // -1.0 (恐怖・怒り) ～ +1.0 (希望・喜び)
  biasWarning: boolean;     // 煽情的なトーンの警告
  summary: string;          // 記事の要約（日本語）
  counterOpinion: string;   // 反対座標からの反論
  confidence: number;       // スコアの信頼度 0.0〜1.0
}

export interface Article {
  title: string;
  content: string;
  url?: string;
  publishedAt?: string;
  source?: string;
}

export interface AnalyzedArticle extends Article {
  analysis: AnalysisResult;
  analyzedAt: string;
  topic?: string;
  subcategory?: string;
}

export interface RssFeedItem {
  title: string;
  url: string;
  summary?: string;
  publishedAt?: string;
  source: string;
  imageUrl?: string;
  topic?: string;       // カテゴリID（"politics" | "economy" | ... | "other"）
  subcategory?: string; // サブカテゴリID（"diplomacy" | "domestic_politics" | ...）
}

// ── メディア比較ページ用 ──────────────────────────────

/** Ollamaがグループ化した「同一ニュース」のひとまとまり */
export interface NewsGroup {
  groupTitle: string;        // Ollamaが命名した見出し（例: "防衛費増額の閣議決定"）
  items: RssFeedItem[];      // 同一ニュースと判定された記事群
  singleOutlet: boolean;     // true = 1媒体のみ報道（比較不可）
  topic?: string;            // 支配的トピック（TopicId | "other"）
}

/** ニュースフィードのグループ表示モード */
export type GroupMode = "off" | "ranking";

// ── マルチモデル分析 ─────────────────────────────────

/** 単一モデルの分析結果（モデル名付き） */
export interface ModelAnalysisResult extends AnalysisResult {
  model: string;
}

/** マルチモデル分析の集約結果 */
export interface MultiModelAnalysis {
  results: ModelAnalysisResult[];
  consensus: AxisScore;
  variance: AxisScore;               // 各軸の分散（モデル間のばらつき）
  maxDivergenceAxis: string;         // 最も意見が割れた軸名
}

/** マルチモデル対応の分析済み記事 */
export interface MultiModelAnalyzedArticle extends AnalyzedArticle {
  multiModel?: MultiModelAnalysis;
}

/** 比較ページの分析ステート */
export type CompareStep =
  | { type: "idle" }
  | { type: "fetching" }                              // RSS収集中
  | { type: "grouping" }                              // 同一ニュース判定中
  | { type: "grouped"; groups: NewsGroup[] }          // グループ選択待ち
  | { type: "analyzing"; group: NewsGroup; progress: number; total: number }
  | { type: "done"; group: NewsGroup; results: AnalyzedArticle[] }
  | { type: "error"; message: string };
