import { test, expect } from "@playwright/test";
import { mockAPI } from "./fixtures/api-mock";
import { FEED_GROUPS_FIXTURE, INSPECT_DETAIL_FIXTURE } from "./fixtures/data";

test.describe("点検ページ", () => {
  test.beforeEach(async ({ page }) => {
    await mockAPI(page);
  });

  test("/inspect にアクセスすると FeedGroups タブが表示される", async ({ page }) => {
    await page.goto("/inspect");

    await expect(page.getByRole("button", { name: "FeedGroups（DB）" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Snapshot（バッチ結果）" })).toBeVisible();

    // FeedGroups が初期表示
    await expect(page.getByText("グループ総数:")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(FEED_GROUPS_FIXTURE[0].title)).toBeVisible();
  });

  test("タブ切り替え（FeedGroups ↔ Snapshot）", async ({ page }) => {
    await page.goto("/inspect");
    await expect(page.getByText("グループ総数:")).toBeVisible({ timeout: 10000 });

    // Snapshot タブに切り替え
    await page.getByRole("button", { name: "Snapshot（バッチ結果）" }).click();
    await expect(page.getByText(/グループ数/).first()).toBeVisible({ timeout: 10000 });

    // FeedGroups タブに戻る
    await page.getByRole("button", { name: "FeedGroups（DB）" }).click();
    await expect(page.getByText("グループ総数:")).toBeVisible();
  });

  test("FeedGroups: グループをクリック → 記事リスト展開", async ({ page }) => {
    await page.goto("/inspect");
    await expect(page.getByText(FEED_GROUPS_FIXTURE[0].title)).toBeVisible({ timeout: 10000 });

    await page.getByText(FEED_GROUPS_FIXTURE[0].title).click();

    // 記事一覧が展開される
    await expect(page.getByText("防衛費増額決定")).toBeVisible();
    await expect(page.getByText("NHKニュース").first()).toBeVisible();
  });

  test("Snapshot: グループをクリック → inspect detail 読み込み・展開", async ({ page }) => {
    await page.goto("/inspect");

    await page.getByRole("button", { name: "Snapshot（バッチ結果）" }).click();
    await expect(page.getByText("防衛費増額の閣議決定").first()).toBeVisible({ timeout: 10000 });

    // Snapshot グループをクリック
    await page.getByText("防衛費増額の閣議決定").first().click();

    // inspect detail が表示される（記事リスト）
    await expect(
      page.getByText(INSPECT_DETAIL_FIXTURE.articles[0].title)
    ).toBeVisible({ timeout: 10000 });
  });

  test("「再計算診断を実行」ボタン → 結果が表示される", async ({ page }) => {
    // recompute API をモック
    await page.route("**/api/batch/inspect/recompute*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          snapshotId: "snap-001",
          groupId: "grp-001",
          groupTitle: "防衛費増額の閣議決定",
          groupCategory: "politics",
          hasCentroid: true,
          articles: [],
          thresholdSimulation: { threshold: 0.7, wouldStay: 2, wouldLeave: 1, noEmbedding: 0 },
        }),
      })
    );
    await mockAPI(page);

    await page.goto("/inspect");
    await page.getByRole("button", { name: "Snapshot（バッチ結果）" }).click();
    await expect(page.getByText("防衛費増額の閣議決定").first()).toBeVisible({ timeout: 10000 });

    await page.getByText("防衛費増額の閣議決定").first().click();
    // inspect detail ロード後に「再計算診断を実行」が表示される
    await expect(page.getByRole("button", { name: "再計算診断を実行" })).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "再計算診断を実行" }).click();

    // 閾値シミュレーション結果が表示される
    await expect(page.getByText(/閾値シミュレーション/)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/残留 2/)).toBeVisible();
  });

  test("API エラー時 → エラーメッセージ表示", async ({ page }) => {
    await page.route("**/api/feed-groups*", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "DBへの接続に失敗しました" }),
      })
    );

    await page.goto("/inspect");

    await expect(page.getByText("DBへの接続に失敗しました")).toBeVisible({ timeout: 10000 });
  });
});
