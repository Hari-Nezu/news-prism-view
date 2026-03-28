import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { embedArticle, embedNewsGroup } from "./embeddings";

const MOCK_VEC = [0.1, 0.2, 0.3];

// Ollama への実際のリクエストを防ぐため fetch グローバルをスタブ
beforeAll(() => {
  vi.stubGlobal("fetch", vi.fn());
});

beforeEach(() => {
  vi.clearAllMocks(); // 各テスト前に呼び出し履歴をリセット
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    json: async () => ({ embeddings: [MOCK_VEC] }),
  });
});

// ── embedArticle ────────────────────────────────────────

describe("embedArticle", () => {
  it("title と summary を結合した input で fetch を呼ぶ", async () => {
    await embedArticle("記事タイトル", "記事の要約");
    expect(global.fetch).toHaveBeenCalledOnce();
    const body = JSON.parse(
      (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
    );
    expect(body.input).toContain("記事タイトル");
    expect(body.input).toContain("記事の要約");
  });

  it("Ollama のレスポンスベクトルをそのまま返す", async () => {
    const result = await embedArticle("タイトル", "要約");
    expect(result).toEqual(MOCK_VEC);
  });

  it("fetch が ok:false の場合 null を返す", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    expect(await embedArticle("タイトル", "要約")).toBeNull();
  });

  it("fetch が例外を投げた場合 null を返す", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("timeout"));
    expect(await embedArticle("タイトル", "要約")).toBeNull();
  });
});

// ── embedNewsGroup ──────────────────────────────────────

describe("embedNewsGroup", () => {
  const group = {
    groupTitle: "防衛費増額の閣議決定",
    items: [
      { title: "防衛費増額を閣議決定", source: "NHK政治" },
      { title: "防衛費増額 野党が反発", source: "朝日新聞" },
    ],
  };

  it("fetch を1回だけ呼ぶ", async () => {
    await embedNewsGroup(group);
    expect(global.fetch).toHaveBeenCalledOnce();
  });

  it("groupTitle を input に含む", async () => {
    await embedNewsGroup(group);
    const body = JSON.parse(
      (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
    );
    expect(body.input).toContain("防衛費増額の閣議決定");
  });

  it("各記事のタイトルを input に含む", async () => {
    await embedNewsGroup(group);
    const body = JSON.parse(
      (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
    );
    expect(body.input).toContain("防衛費増額を閣議決定");
    expect(body.input).toContain("防衛費増額 野党が反発");
  });

  it("参加媒体名を input に含む", async () => {
    await embedNewsGroup(group);
    const body = JSON.parse(
      (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
    );
    expect(body.input).toContain("NHK政治");
    expect(body.input).toContain("朝日新聞");
  });

  it("媒体名が重複しない（同じ媒体が2件あっても1回だけ）", async () => {
    const dupGroup = {
      groupTitle: "テスト",
      items: [
        { title: "記事A", source: "NHK" },
        { title: "記事B", source: "NHK" },
      ],
    };
    await embedNewsGroup(dupGroup);
    const body = JSON.parse(
      (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
    );
    const matches = (body.input as string).match(/NHK/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("ベクトルを返す", async () => {
    expect(await embedNewsGroup(group)).toEqual(MOCK_VEC);
  });
});
