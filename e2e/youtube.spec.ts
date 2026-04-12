import { test, expect } from "@playwright/test";
import { mockAPI } from "./fixtures/api-mock";
import { YOUTUBE_FEED_FIXTURE } from "./fixtures/data";

test.describe("YouTube分析ページ", () => {
  test.beforeEach(async ({ page }) => {
    await mockAPI(page);
  });

  test("/youtube にアクセスするとチャンネル選択UIが表示される", async ({ page }) => {
    await page.goto("/youtube");
    await expect(page.getByRole("heading", { name: /YouTube 分析/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "最新動画を取得" })).toBeVisible();
  });

  test("チャンネル未選択時は取得ボタンが disabled", async ({ page }) => {
    await page.goto("/youtube");

    // 選択済みチャンネルボタン（✓ マーク付き）をすべてクリックして解除
    let selected = page.locator("button").filter({ hasText: "✓" });
    let count = await selected.count();
    while (count > 0) {
      await selected.first().click();
      count = await selected.count();
    }

    await expect(page.getByRole("button", { name: "最新動画を取得" })).toBeDisabled();
  });

  test("チャンネル選択 → 「最新動画を取得」→ 動画一覧表示", async ({ page }) => {
    await page.goto("/youtube");

    await page.getByRole("button", { name: "最新動画を取得" }).click();

    await expect(
      page.getByText(`${YOUTUBE_FEED_FIXTURE.length}本の動画を取得しました`)
    ).toBeVisible({ timeout: 10000 });

    // 動画タイトルが表示される
    await expect(page.getByText(YOUTUBE_FEED_FIXTURE[0].title)).toBeVisible();
  });

  test("「全動画を分析」→ 進捗表示 → 結果（ScoreCard）", async ({ page }) => {
    await page.goto("/youtube");

    await page.getByRole("button", { name: "最新動画を取得" }).click();
    await expect(page.getByRole("button", { name: "全動画を分析" })).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "全動画を分析" }).click();

    // 分析中 or 完了
    await expect(
      page.getByText(/動画を字幕で分析中|別のチャンネルを選択/)
    ).toBeVisible({ timeout: 10000 });
  });

  test("「リセット」ボタンで初期状態に戻る", async ({ page }) => {
    await page.goto("/youtube");

    await page.getByRole("button", { name: "最新動画を取得" }).click();
    await expect(page.getByRole("button", { name: "リセット" })).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "リセット" }).click();

    // 初期状態：取得ボタンが再表示される（リセットボタンは消える）
    await expect(page.getByRole("button", { name: "最新動画を取得" })).toBeVisible();
    await expect(page.getByText(/本の動画を取得しました/)).not.toBeVisible();
  });
});
