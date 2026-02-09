import { expect, test } from "@playwright/test";

test.describe("ナビゲーション", () => {
  test("ルートから /cases にリダイレクトされる", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/cases/);
  });

  test("/cases ページが正常にレンダリングされる", async ({ page }) => {
    await page.goto("/cases?sort=desc");
    // ページ全体がエラーなく表示される
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByRole("heading", { name: "判例一覧" })).toBeVisible();
  });

  test("/judges ページが正常にレンダリングされる", async ({ page }) => {
    await page.goto("/judges");
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByRole("heading", { name: "裁判官一覧" })).toBeVisible();
  });
});
