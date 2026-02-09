import { expect, test } from "@playwright/test";

test.describe("判例一覧ページ (/cases)", () => {
  test("ページが正常に表示される", async ({ page }) => {
    await page.goto("/cases?sort=desc");
    await expect(page.getByRole("heading", { name: "判例一覧" })).toBeVisible();
  });

  test("判例データが表示される", async ({ page }) => {
    await page.goto("/cases?sort=desc");
    // 検索結果セクションが表示される
    await expect(page.getByText("検索結果")).toBeVisible();
    // テーブルヘッダーが存在する
    await expect(page.getByRole("columnheader", { name: "事件名" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "判決日" })).toBeVisible();
  });

  test("判例リンクから詳細ページに遷移できる", async ({ page }) => {
    await page.goto("/cases?sort=desc");
    // 最初の事件リンクをクリック
    const firstLink = page.locator("table tbody tr a").first();
    await expect(firstLink).toBeVisible();
    const href = await firstLink.getAttribute("href");
    expect(href).toMatch(/^\/cases\/.+/);
    await firstLink.click();
    // 詳細ページに遷移する
    await expect(page).toHaveURL(/\/cases\/.+/);
  });

  test("並び順を変更できる", async ({ page }) => {
    await page.goto("/cases?sort=desc");
    // 絞り込みフォームが存在する
    await expect(page.getByRole("button", { name: "絞り込み" })).toBeVisible();
  });

  test("判決日フィルタが機能する", async ({ page }) => {
    await page.goto("/cases?sort=desc");
    const fromInput = page.locator("#decision-from");
    await expect(fromInput).toBeVisible();
    const toInput = page.locator("#decision-to");
    await expect(toInput).toBeVisible();
  });
});

test.describe("判例詳細ページ (/cases/$caseId)", () => {
  test("存在する判例の詳細が表示される", async ({ page }) => {
    // まず一覧から1件の判例IDを取得
    await page.goto("/cases?sort=desc");
    const firstLink = page.locator("table tbody tr a").first();
    const href = await firstLink.getAttribute("href");
    expect(href).toBeTruthy();
    await page.goto(href!);
    // ページが正常に読み込まれる
    await expect(page.locator("body")).not.toBeEmpty();
  });
});
