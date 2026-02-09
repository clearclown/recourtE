import { expect, test } from "@playwright/test";

test.describe("裁判官一覧ページ (/judges)", () => {
  test("ページが正常に表示される", async ({ page }) => {
    await page.goto("/judges");
    await expect(page.getByRole("heading", { name: "裁判官一覧" })).toBeVisible();
  });

  test("裁判官データが表示される", async ({ page }) => {
    await page.goto("/judges");
    // 裁判官テーブルが表示される
    await expect(page.getByRole("columnheader", { name: "裁判官" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "関与事件数" })).toBeVisible();
    // テストデータの裁判官が表示される（テーブル内のリンク）
    await expect(page.locator("table tbody").getByText("山田太郎")).toBeVisible();
    await expect(page.locator("table tbody").getByText("佐藤花子")).toBeVisible();
    await expect(page.locator("table tbody").getByText("鈴木一郎")).toBeVisible();
  });

  test("裁判官が0名でないことを確認", async ({ page }) => {
    await page.goto("/judges");
    // 「裁判官がまだ登録されていません」が表示されないこと
    await expect(page.getByText("裁判官がまだ登録されていません")).not.toBeVisible();
    // 「全 X 名」が0でないこと
    const chipTexts = await page.locator(".scv-chip").allTextContents();
    const countChip = chipTexts.find((text) => text.includes("名"));
    expect(countChip).toBeTruthy();
    const count = Number.parseInt(countChip!.replace(/[^0-9]/g, ""), 10);
    expect(count).toBeGreaterThan(0);
  });

  test("各裁判官の関与事件数が正しい", async ({ page }) => {
    await page.goto("/judges");
    // テーブル行から裁判官名と事件数を取得
    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);

    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      const caseCountText = await row.locator("td").nth(1).textContent();
      expect(caseCountText).toBeTruthy();
      const caseCount = Number.parseInt(caseCountText!.replace(/[^0-9]/g, ""), 10);
      // 各裁判官に少なくとも1件の事件が関連している
      expect(caseCount).toBeGreaterThan(0);
    }
  });

  test("裁判官リンクから詳細ページに遷移できる", async ({ page }) => {
    await page.goto("/judges");
    const firstLink = page.locator("table tbody tr a").first();
    await expect(firstLink).toBeVisible();
    const href = await firstLink.getAttribute("href");
    expect(href).toMatch(/^\/judges\/.+/);
    await firstLink.click();
    await expect(page).toHaveURL(/\/judges\/.+/);
  });
});

test.describe("裁判官詳細ページ (/judges/$judgeId)", () => {
  test("裁判官の詳細情報が表示される", async ({ page }) => {
    await page.goto("/judges");
    const firstLink = page.locator("table tbody tr a").first();
    const judgeName = await firstLink.textContent();
    await firstLink.click();
    // 裁判官名が表示される
    await expect(page.getByRole("heading", { name: judgeName! })).toBeVisible();
    // 「裁判官詳細」ラベルが表示される
    await expect(page.getByText("裁判官詳細")).toBeVisible();
  });

  test("関与事件一覧が表示される", async ({ page }) => {
    await page.goto("/judges");
    const firstLink = page.locator("table tbody tr a").first();
    await firstLink.click();
    // 関与事件セクションが表示される
    await expect(page.getByRole("heading", { name: "関与事件" })).toBeVisible();
    // 「全 X 件」のテキストが存在する
    await expect(page.getByText(/全\s*\d+\s*件/)).toBeVisible();
  });

  test("関与事件から判例詳細ページに遷移できる", async ({ page }) => {
    await page.goto("/judges");
    const firstJudgeLink = page.locator("table tbody tr a").first();
    await firstJudgeLink.click();
    // 関与事件の最初のリンクをクリック
    const caseLink = page.locator("a[href^='/cases/']").first();
    await expect(caseLink).toBeVisible();
    await caseLink.click();
    await expect(page).toHaveURL(/\/cases\/.+/);
  });

  test("学歴・経歴セクションが表示される", async ({ page }) => {
    // 山田太郎（judge-001）にはeducation/careerが設定されている
    await page.goto("/judges/judge-001");
    await expect(page.getByRole("heading", { name: "学歴" })).toBeVisible();
    await expect(page.getByText("東京大学法学部卒業")).toBeVisible();
    await expect(page.getByRole("heading", { name: "経歴" })).toBeVisible();
    await expect(page.getByText("最高裁判所裁判官", { exact: false })).toBeVisible();
  });

  test("引用元リンクが表示される", async ({ page }) => {
    // 山田太郎（judge-001）にはsources_jsonが設定されている
    await page.goto("/judges/judge-001");
    await expect(page.getByRole("heading", { name: "引用元" })).toBeVisible();
    const sourceLink = page.getByRole("link", { name: "最高裁判所HP" });
    await expect(sourceLink).toBeVisible();
    await expect(sourceLink).toHaveAttribute("href", "https://www.courts.go.jp/");
    await expect(sourceLink).toHaveAttribute("target", "_blank");
  });

  test("学歴・経歴がない裁判官ではセクションが非表示", async ({ page }) => {
    // 鈴木一郎（judge-003）にはeducation/careerが設定されていない
    await page.goto("/judges/judge-003");
    await expect(page.getByRole("heading", { name: "鈴木一郎" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "学歴" })).not.toBeVisible();
    await expect(page.getByRole("heading", { name: "経歴" })).not.toBeVisible();
    await expect(page.getByRole("heading", { name: "引用元" })).not.toBeVisible();
  });
});
