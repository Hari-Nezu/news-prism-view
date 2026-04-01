import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { embed, embedBatch, embedArticle, embedNewsGroup } from "@/lib/embeddings";

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

// ── embedBatch ──────────────────────────────────────────

describe("embedBatch", () => {
  it("空の配列を渡すと空の配列を返す", async () => {
    expect(await embedBatch([])).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("fetch を1回だけ呼び、input が配列形式になる", async () => {
    const texts = ["text1", "text2"];
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ embeddings: [MOCK_VEC, MOCK_VEC] }),
    });

    const results = await embedBatch(texts);
    expect(global.fetch).toHaveBeenCalledOnce();
    const body = JSON.parse(
      (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
    );
    expect(body.input).toEqual(["text1", "text2"]);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual(MOCK_VEC);
    expect(results[1]).toEqual(MOCK_VEC);
  });

  it("Ollama のレスポンスが短い場合に null をパディングする", async () => {
    const texts = ["text1", "text2"];
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ embeddings: [MOCK_VEC] }), // 1件足りない
    });

    const results = await embedBatch(texts);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual(MOCK_VEC);
    expect(results[1]).toBeNull();
  });

  it("fetch が ok:false の場合、入力と同じ長さの null 配列を返す", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    const results = await embedBatch(["a", "b"]);
    expect(results).toEqual([null, null]);
  });

  it("fetch が例外を投げた場合、入力と同じ長さの null 配列を返す", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("timeout"));
    const results = await embedBatch(["a", "b"]);
    expect(results).toEqual([null, null]);
  });
});

// ── embed ───────────────────────────────────────────────

describe("embed", () => {
  it("単一のテキストをベクトル化する", async () => {
    const result = await embed("hello world");
    expect(global.fetch).toHaveBeenCalledOnce();
    const body = JSON.parse(
      (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
    );
    expect(body.input).toBe("hello world");
    expect(result).toEqual(MOCK_VEC);
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
