import { test, expect } from "@playwright/test";
import { mockAPI } from "./fixtures/api-mock";
import { BATCH_LATEST_FIXTURE } from "./fixtures/data";

test.describe("ランキングページ", () => {
  test.beforeEach(async ({ page }) => {
    await mockAPI(page);
  });

  test("/ranking にアクセスするとスナップショット情報が表示される", async ({ page }) => {
    await page.goto("/ranking");

    const { groupCount, articleCount } = BATCH_LATEST_FIXTURE.snapshot;
    await expect(page.getByText(`${groupCount}グループ`)).toBeVisible();
    await expect(page.getByText(`${articleCount}記事`, { exact: false })).toBeVisible();
  });

  test("CoverageMatrix（報道カバレッジマトリクス）が表示される", async ({ page }) => {
    await page.goto("/ranking");

    await expect(page.getByText("報道カバレッジマトリクス")).toBeVisible();
    // multiOutlet グループの行が表示される
    await expect(page.getByText("防衛費増額の閣議決定")).toBeVisible();
    await expect(page.getByText("日経平均4万円突破")).toBeVisible();
    // singleOutlet=true のグループは除外される
    await expect(page.getByText("NHK独自報道")).not.toBeVisible();
  });

  test("マトリクスの行をクリック → オーバーレイで記事一覧が表示される", async ({ page }) => {
    await page.goto("/ranking");

    await page.getByRole("row", { name: /防衛費増額の閣議決定/ }).click();

    // オーバーレイのタイトルが表示される
    await expect(page.getByText("防衛費増額の閣議決定").nth(1)).toBeVisible();
    // 媒体数・記事数が表示される
    await expect(page.getByText(/3媒体.*3件|3媒体/, { exact: false })).toBeVisible();
    // 各媒体のカードが表示される
    await expect(page.getByText("NHKニュース")).toBeVisible();
    await expect(page.getByText("朝日新聞デジタル")).toBeVisible();
    await expect(page.getByText("毎日新聞")).toBeVisible();
  });

  test("オーバーレイの「✕」で閉じる", async ({ page }) => {
    await page.goto("/ranking");

    await page.getByRole("row", { name: /防衛費増額の閣議決定/ }).click();
    await expect(page.getByText("防衛費増額の閣議決定").nth(1)).toBeVisible();

    await page.getByRole("button", { name: "✕" }).click();

    await expect(page.getByText("NHKニュース")).not.toBeVisible();
  });

  test("「更新」ボタンクリック → 再読み込みされる", async ({ page }) => {
    await page.goto("/ranking");
    await expect(page.getByText("報道カバレッジマトリクス")).toBeVisible();

    const responsePromise = page.waitForResponse((res) =>
      res.url().includes("/api/batch/latest")
    );
    await page.getByRole("button", { name: /更新/ }).click();
    await responsePromise;

    // 再取得後もスナップショット情報が表示される
    await expect(page.getByText(`${BATCH_LATEST_FIXTURE.snapshot.groupCount}グループ`)).toBeVisible();
  });

  test("スナップショットなし → 「スナップショットがありません」メッセージ", async ({ page }) => {
    await page.route("**/api/batch/latest", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ snapshot: null, groups: [] }),
      })
    );

    await page.goto("/ranking");

    await expect(page.getByText("スナップショットがありません")).toBeVisible();
  });

  test("API エラー時 → エラーメッセージ表示", async ({ page }) => {
    await page.route("**/api/batch/latest", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "サーバーエラーが発生しました" }),
      })
    );

    await page.goto("/ranking");

    await expect(page.getByText("サーバーエラーが発生しました")).toBeVisible();
  });
});
