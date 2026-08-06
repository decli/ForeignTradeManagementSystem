import { test, expect } from "@playwright/test";
import { waitHydrated } from "./helpers";

test.describe("跟单表", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/follow-ups");
    await waitHydrated(page);
  });

  test("渲染出运批次与里程碑航程线", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "跟单表" })).toBeVisible();
    await expect(page.locator("tbody tr:not(.empty-row)")).not.toHaveCount(0);

    // 每一行都该有一条里程碑轨道，且节点带状态
    const firstRail = page.locator("tbody tr").first().locator(".mrail");
    await expect(firstRail).toBeVisible();
    await expect(firstRail.locator(".mnode")).not.toHaveCount(0);

    // 进度填充宽度应当是个百分比，而不是空
    const fillWidth = await firstRail.locator(".mrail-fill").evaluate((el) => (el as HTMLElement).style.width);
    expect(fillWidth).toMatch(/%$/);
  });

  test("点动态可就地修改并落库", async ({ page }) => {
    const stamp = `E2E 动态 ${Date.now()}`;

    await page.locator(".note-btn").first().click();
    await expect(page.locator(".pop")).toBeVisible();
    await page.locator(".pop textarea").fill(stamp);
    await page.locator(".pop").getByRole("button", { name: "保存" }).click();

    await expect(page.getByText(stamp)).toBeVisible();

    // 刷新后仍在，说明写进了数据库而不只是改了内存
    await page.reload();
    await expect(page.getByText(stamp)).toBeVisible();
  });

  test("常用短语可一键填入", async ({ page }) => {
    await page.locator(".note-btn").first().click();
    const textarea = page.locator(".pop textarea");
    await textarea.fill("");
    await page.locator(".pop .phrase", { hasText: "待电放" }).click();
    await expect(textarea).toHaveValue("待电放");
    await page.keyboard.press("Escape");
    await expect(page.locator(".pop")).toHaveCount(0);
  });

  test("勾选多行弹出批量条，可批量更新并撤销", async ({ page }) => {
    const stamp = `E2E 批量 ${Date.now()}`;
    const bulkbar = page.locator(".bulkbar");

    await expect(bulkbar).not.toHaveClass(/is-on/);
    await page.locator("tbody input[type=checkbox]").nth(0).check();
    await page.locator("tbody input[type=checkbox]").nth(1).check();
    await expect(bulkbar).toHaveClass(/is-on/);
    await expect(bulkbar.locator(".bb-n b")).toHaveText("2");

    await bulkbar.locator("input.grow").fill(stamp);
    await bulkbar.getByLabel("批量设置放行状态").selectOption("待报关");
    await bulkbar.getByRole("button", { name: "应用到所选" }).click();

    await expect(page.getByText(stamp)).toHaveCount(2);
    await expect(page.locator(".pill", { hasText: "待报关" })).not.toHaveCount(0);

    // 撤销要把动态和放行状态一起还原
    await page.locator(".toast").getByRole("button", { name: "撤销" }).click();
    await expect(page.getByText(stamp)).toHaveCount(0);
  });

  test("批量条不遮挡表格：提示条会让位", async ({ page }) => {
    await page.locator("tbody input[type=checkbox]").nth(0).check();
    // bottom 带 0.26s 过渡，要等它走完再量
    await expect
      .poll(async () =>
        parseInt(
          await page.locator(".toasts").evaluate((el) => getComputedStyle(el).bottom),
          10,
        ),
      )
      .toBeGreaterThan(100);
  });

  test("筛选写进 URL，刷新后仍然生效", async ({ page }) => {
    const rows = page.locator("tbody tr:not(.empty-row)");
    const before = await rows.count();

    await page.getByLabel("按放行状态筛选").selectOption("已放行");
    // router.replace 是在 transition 里提交的，等地址真的落定再刷新
    await expect(page).toHaveURL(/state=%E5%B7%B2%E6%94%BE%E8%A1%8C/);
    await expect(rows).not.toHaveCount(before);
    const after = await rows.count();

    await page.reload();
    await expect(page.getByLabel("按放行状态筛选")).toHaveValue("已放行");
    await expect(rows).toHaveCount(after);
  });

  test("搜索无结果时给出可操作的空态", async ({ page }) => {
    await page.getByLabel("搜索批次").fill("绝不存在的批次号ZZZ");
    await expect(page.locator("tbody .empty")).toContainText("仅进行中");
  });

  test("详情抽屉展示三个标签页并可用 Esc 关闭", async ({ page }) => {
    await page.locator(".row-acts .icon-btn").first().click();
    const drawer = page.locator(".drawer");
    await expect(drawer).toHaveClass(/is-on/);
    await expect(drawer.locator('[role="tab"]')).toHaveCount(3);

    await drawer.getByRole("tab", { name: "动态流水" }).click();
    await expect(drawer.locator(".tl li")).not.toHaveCount(0);

    await drawer.getByRole("tab", { name: "单证齐套" }).click();
    await expect(drawer.getByText("商业发票")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(drawer).not.toHaveClass(/is-on/);
  });

  test("删除是软删除且可撤销", async ({ page }) => {
    const rows = page.locator("tbody tr:not(.empty-row)");
    const firstBatch = await page.locator("tbody tr .cell-main").first().textContent();
    const before = await rows.count();

    await page.locator("tbody tr").first().locator(".row-acts .icon-btn").nth(2).click();
    await expect(rows).toHaveCount(before - 1);

    await page.locator(".toast").getByRole("button", { name: "撤销" }).click();
    await expect(rows).toHaveCount(before);
    await expect(page.getByText(firstBatch!.trim())).toBeVisible();
  });
});
