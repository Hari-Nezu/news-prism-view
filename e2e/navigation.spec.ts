import { test, expect } from "@playwright/test";
import { mockAPI } from "./fixtures/api-mock";

test.describe("ナビゲーション", () => {
  test.beforeEach(async ({ page }) => {
    await mockAPI(page);
  });

  test("ホーム → まとめ → ホーム（ブラウザバック）", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "NewsPrism" })).toBeVisible();

    await page.getByRole("link", { name: /まとめ/ }).first().click();
    await expect(page).toHaveURL(/\/ranking/);
    await expect(page.getByText("報道カバレッジマトリクス")).toBeVisible({ timeout: 10000 });

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "NewsPrism" })).toBeVisible();
  });

  test("ホーム → メディア比較 → ホーム", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /メディア比較/ }).click();

    await expect(page).toHaveURL(/\/compare/);
    await expect(page.getByPlaceholder("キーワードを入力して比較検索...")).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "NewsPrism" })).toBeVisible();
  });

  test("ホーム → YouTube → ホーム", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /YouTube/ }).click();

    await expect(page).toHaveURL(/\/youtube/);
    await expect(page.getByRole("heading", { name: /YouTube 分析/ })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "NewsPrism" })).toBeVisible();
  });

  test("まとめ → メディア比較（ヘッダーリンク）", async ({ page }) => {
    await page.goto("/ranking");
    await expect(page.getByText("報道カバレッジマトリクス")).toBeVisible({ timeout: 10000 });

    await page.getByRole("link", { name: /メディア比較/ }).click();
    await expect(page).toHaveURL(/\/compare/);
    await expect(page.getByPlaceholder("キーワードを入力して比較検索...")).toBeVisible();
  });

  test("点検ページ → 各ページ（ヘッダーリンク）", async ({ page }) => {
    await page.goto("/inspect");

    // フィード（ホーム）へ
    await page.getByRole("link", { name: "フィード" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "NewsPrism" })).toBeVisible();

    // まとめへ
    await page.goto("/inspect");
    await page.getByRole("link", { name: "まとめ" }).click();
    await expect(page).toHaveURL(/\/ranking/);

    // メディア比較へ
    await page.goto("/inspect");
    await page.getByRole("link", { name: /メディア比較/ }).click();
    await expect(page).toHaveURL(/\/compare/);
  });
});
