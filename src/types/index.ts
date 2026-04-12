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
  category?: string;
  subcategory?: string;
}

export interface RssFeedItem {
  title: string;
  url: string;
  summary?: string;
  publishedAt?: string;
  source: string;
  imageUrl?: string;
  category?: string;    // 大分類ID（"politics" | "economy" | ... | "other"）
  subcategory?: string; // 中分類ID（"diplomacy" | "domestic_politics" | ...）
}

// ── メディア比較ページ用 ──────────────────────────────

/** Ollamaがグループ化した「同一ニュース」のひとまとまり */
export interface NewsGroup {
  groupTitle: string;        // LLMが命名した具体的なイベント名（= topic）
  items: RssFeedItem[];      // 同一ニュースと判定された記事群
  singleOutlet: boolean;     // true = 1媒体のみ報道（比較不可）
  topic?: string;            // = groupTitle（具体的なイベント名）
  category?: string;         // グループ内の支配的大分類（"politics" | "economy" | ...）
  subcategory?: string;      // グループ内の支配的中分類
  // SnapshotGroup 由来フィールド（/inspect ページで使用）
  id?:          string;
  rank?:        number;
  coveredBy?:   string[];
  silentMedia?: string[];
}

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

// ── バッチ/スナップショット関連 ─────────────────────────

export interface SnapshotMeta {
  id:           string;
  processedAt:  string;
  articleCount: number;
  groupCount:   number;
  durationMs:   number;
  status:       string;
  error:        string | null;
}

export interface SnapshotResult {
  snapshot: SnapshotMeta | null;
  groups:   NewsGroup[];
}

export interface FeedGroupWithItems {
  id:                string;
  title:             string;
  articleCount:      number;
  lastSeenAt:        string;
  createdAt:         string;
  uniqueSourceCount: number;
  singleOutlet:      boolean;
  items: Array<{
    id:          string;
    title:       string;
    url:         string;
    source:      string;
    publishedAt: string | null;
    matchedAt:   string;
  }>;
}

export interface GroupIssue {
  type:     string;
  severity: "low" | "medium" | "high";
  message:  string;
}

export interface GroupInspectDetail {
  snapshotId:   string;
  groupId:      string;
  groupTitle:   string;
  category:     string | null;
  subcategory:  string | null;
  rank:         number;
  singleOutlet: boolean;
  coveredBy:    string[];
  silentMedia:  string[];
  articles: Array<{
    title:       string;
    url:         string;
    source:      string;
    publishedAt: string | null;
    category:    string | null;
    subcategory: string | null;
    summary:     string | null;
  }>;
  summary: {
    totalArticles: number;
    byCategory:    Record<string, number>;
    issues:        GroupIssue[];
  };
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
