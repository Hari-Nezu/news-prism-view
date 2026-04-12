import { test, expect } from "@playwright/test";
import { mockAPI } from "./fixtures/api-mock";
import { RSS_FIXTURE } from "./fixtures/data";

test.describe("ホームページ", () => {
  test.beforeEach(async ({ page }) => {
    await mockAPI(page);
  });

  test("ページが表示される（ヘッダー 'NewsPrism' が見える）", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "NewsPrism" })).toBeVisible();
  });

  test("ナビゲーションリンクが存在する（まとめ、YouTube、メディア比較）", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /まとめ/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /YouTube/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /メディア比較/ }).first()).toBeVisible();
  });

  test("RSSフィードが読み込まれ記事カードが表示される", async ({ page }) => {
    await page.goto("/");
    // フィクスチャの最初の記事タイトルが表示される
    await expect(page.getByText(RSS_FIXTURE[0].title)).toBeVisible();
    await expect(page.getByText(RSS_FIXTURE[1].title)).toBeVisible();
  });

  test("URL入力フォームが存在し、空の場合は分析ボタンが disabled", async ({ page }) => {
    await page.goto("/");
    const input = page.getByPlaceholder("URLを貼り付けて記事を分析...");
    const submitButton = page.getByRole("button", { name: "分析", exact: true });

    await expect(input).toBeVisible();
    await expect(submitButton).toBeDisabled();

    await input.fill("https://example.com/test");
    await expect(submitButton).toBeEnabled();
  });

  test("フィード設定ドロワーが開閉する（⚙ボタン → ESCで閉じる）", async ({ page }) => {
    await page.goto("/");
    // RSSが読み込まれるまで待つ
    await expect(page.getByText(RSS_FIXTURE[0].title)).toBeVisible();

    await page.getByRole("button", { name: "フィード設定" }).click();
    // ドロワーが開く（フィード設定関連のテキストが表示される）
    await expect(page.getByText(/フィード設定|チャンネル|配信元/)).toBeVisible();

    await page.keyboard.press("Escape");
    // ドロワーが閉じる
    await expect(page.getByText(/チャンネル設定|カスタムフィード設定/).first()).not.toBeVisible();
  });

  test("記事カードの「3軸分析」ボタンをクリック → ローディング表示 → 分析結果パネルが開く", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(RSS_FIXTURE[0].title)).toBeVisible();

    // 最初の「3軸分析」ボタンをクリック
    await page.getByRole("button", { name: "3軸分析" }).first().click();

    // ローディング or 分析中 → パネルが開く
    await expect(page.getByRole("heading", { name: "分析結果" })).toBeVisible({ timeout: 10000 });
  });

  test("分析結果パネルにスコアカードが表示される", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(RSS_FIXTURE[0].title)).toBeVisible();

    await page.getByRole("button", { name: "3軸分析" }).first().click();

    // パネルが開き、ScoreCard に記事タイトルが表示される
    await expect(page.getByText("テスト記事1: 防衛費増額を閣議決定")).toBeVisible({ timeout: 10000 });
  });
});
