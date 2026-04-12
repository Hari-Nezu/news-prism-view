import { test, expect } from "@playwright/test";
import { mockAPI } from "./fixtures/api-mock";
import { COMPARE_FIXTURE } from "./fixtures/data";

const SUGGESTED_KEYWORDS = ["防衛費", "原発", "少子化対策", "日銀", "外交", "半導体"];

test.describe("メディア比較ページ", () => {
  test.beforeEach(async ({ page }) => {
    await mockAPI(page);
  });

  test("/compare にアクセスすると検索バーとサジェストキーワードが表示される", async ({ page }) => {
    await page.goto("/compare");
    await expect(page.getByPlaceholder("キーワードを入力して比較検索...")).toBeVisible();
    for (const kw of SUGGESTED_KEYWORDS) {
      await expect(page.getByRole("button", { name: kw })).toBeVisible();
    }
  });

  test("サジェストキーワードをクリック → 検索が実行される", async ({ page }) => {
    await page.goto("/compare");

    await page.getByRole("button", { name: "防衛費" }).click();

    // グループ化中 or グループ選択画面になる
    await expect(page.getByText(/件のニュースグループが見つかりました|グループ化中/)).toBeVisible({ timeout: 10000 });
  });

  test("検索結果としてニュースグループカードが表示される", async ({ page }) => {
    await page.goto("/compare");

    await page.getByRole("button", { name: "防衛費" }).click();

    await expect(page.getByText(`${COMPARE_FIXTURE.length}件のニュースグループが見つかりました`)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("防衛費増額の閣議決定")).toBeVisible();
  });

  test("グループカードをクリック → 分析進捗画面 → 結果表示", async ({ page }) => {
    await page.goto("/compare");

    await page.getByRole("button", { name: "防衛費" }).click();
    await expect(page.getByText("防衛費増額の閣議決定")).toBeVisible({ timeout: 10000 });

    // グループカードをクリック
    await page.getByText("防衛費増額の閣議決定").click();

    // 分析中 or 完了画面
    await expect(page.getByText(/各媒体の記事を分析中|別のグループを比較/)).toBeVisible({ timeout: 10000 });
  });

  test("「リセット」ボタンで初期状態に戻る", async ({ page }) => {
    await page.goto("/compare");

    await page.getByRole("button", { name: "防衛費" }).click();
    await expect(page.getByText(/件のニュースグループ/)).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "リセット" }).click();

    // サジェストキーワードが再表示される
    await expect(page.getByRole("button", { name: "防衛費" })).toBeVisible();
  });

  test("検索結果0件 → エラーメッセージ表示", async ({ page }) => {
    await page.route("**/api/compare?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ groups: [], totalFetched: 30 }),
      })
    );

    await page.goto("/compare");
    await page.getByPlaceholder("キーワードを入力して比較検索...").fill("存在しないキーワード");
    await page.getByRole("button", { name: "検索", exact: true }).click();

    await expect(page.getByText(/合致する記事が見つかりませんでした/)).toBeVisible({ timeout: 10000 });
  });

  test("?q= パラメータ付きでアクセス → 自動検索される", async ({ page }) => {
    await page.goto("/compare?q=防衛費");

    await expect(page.getByText(/件のニュースグループが見つかりました/)).toBeVisible({ timeout: 10000 });
  });
});
