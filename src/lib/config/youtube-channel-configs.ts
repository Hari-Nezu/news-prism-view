/**
 * YouTube チャンネル設定（クライアント・サーバー共用）
 * Node.js 依存を持たないので Client Component からも import 可能。
 *
 * チャンネルIDの確認方法:
 *   https://www.youtube.com/@{handle}/about → ページソースで "channelId" を検索
 *   または https://commentpicker.com/youtube-channel-id.php
 */

export interface YouTubeChannelConfig {
  id: string;
  name: string;
  channelId: string;          // YouTube channel ID (UC...)
  category: "mainstream" | "independent" | "commentary";
  leaningHint?: string;       // 参考情報（表示のみ、分析に影響しない）
  defaultEnabled: boolean;
  maxVideos: number;          // 取得する最新動画数
}

export const ALL_YOUTUBE_CHANNELS: YouTubeChannelConfig[] = [
  // ── メインストリーム（主要メディア） ──────────────────────
  {
    id: "tbsnews",
    name: "TBS NEWS DIG",
    channelId: "UC6AG81pAkf6Lbi_1VC5NmPA",  // 確認済み
    category: "mainstream",
    defaultEnabled: true,
    maxVideos: 5,
  },
  {
    id: "annnews",
    name: "テレ朝news",
    channelId: "UCGCZAYq5Xxojl_tSXcVJhiQ",  // 確認済み
    category: "mainstream",
    defaultEnabled: true,
    maxVideos: 5,
  },
  {
    id: "ntv",
    name: "日テレNEWS",
    channelId: "UCuTAXTexrhetbOe3zgskJBQ",   // 要確認: https://www.youtube.com/@ntvnews24
    category: "mainstream",
    defaultEnabled: false,
    maxVideos: 5,
  },
  {
    id: "fnn",
    name: "FNNプライムオンライン",
    channelId: "UCE_pHCKVR4m16EfSSEaTBJg",   // 要確認: https://www.youtube.com/@FNNnewsCH
    category: "mainstream",
    defaultEnabled: false,
    maxVideos: 5,
  },

  // ── インディペンデント（独立系メディア） ───────────────────
  {
    id: "pivot",
    name: "PIVOT",
    channelId: "UC8yHePe_RgUBE-waRWy6olw",  // 確認済み
    category: "independent",
    leaningHint: "ビジネス・テック系",
    defaultEnabled: true,
    maxVideos: 5,
  },
  {
    id: "rehacq",
    name: "ReHacQ",
    channelId: "UCG_oqDSlIYEspNpd2H4zWhw",  // 確認済み
    category: "independent",
    leaningHint: "中立・討論系",
    defaultEnabled: true,
    maxVideos: 5,
  },
  {
    id: "bunkahouse",
    name: "文化人放送局",
    channelId: "UCCSPJbVEuAGRFDPLPBQRBEg",  // 要確認: https://www.youtube.com/@bunkajin_housou
    category: "independent",
    leaningHint: "保守系",
    defaultEnabled: false,
    maxVideos: 5,
  },
  {
    id: "clp",
    name: "Choose Life Project",
    channelId: "UCe7nBCBFVzFDLnM3S7L2V6Q",  // 要確認: https://www.youtube.com/@ChooseLifeProject
    category: "independent",
    leaningHint: "リベラル系",
    defaultEnabled: false,
    maxVideos: 5,
  },

  // ── コメンタリー（論説・解説系） ────────────────────────────
  {
    id: "takahashi",
    name: "高橋洋一チャンネル",
    channelId: "UCECfnRv8lSbn90zCAJWC7cg",  // 確認済み
    category: "commentary",
    leaningHint: "保守・経済系",
    defaultEnabled: false,
    maxVideos: 5,
  },
  {
    id: "ichimanmasamitsu",
    name: "一月万冊",
    channelId: "UCMirnQIiZsqNHaYXSXFQ17Q",  // 要確認: https://www.youtube.com/@ichimanmansatsu
    category: "commentary",
    leaningHint: "リベラル系",
    defaultEnabled: false,
    maxVideos: 5,
  },
];

export const DEFAULT_ENABLED_CHANNEL_IDS = ALL_YOUTUBE_CHANNELS
  .filter((c) => c.defaultEnabled)
  .map((c) => c.id);

export const CATEGORY_LABELS: Record<YouTubeChannelConfig["category"], string> = {
  mainstream:  "主要メディア",
  independent: "独立系メディア",
  commentary:  "論説・解説",
};
