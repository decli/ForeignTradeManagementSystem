import { test, expect } from "@playwright/test";
import { waitHydrated } from "./helpers";

test.describe("订单核算跟踪", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/orders");
    await waitHydrated(page);
  });

  test("KPI 与表格来自同一份数据", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "订单核算跟踪" })).toBeVisible();
    await expect(page.locator(".kpi")).toHaveCount(5);

    const total = await page.locator(".kpi").first().locator(".v").textContent();
    const rows = await page.locator("tbody tr:not(.empty-row)").count();
    expect(Number(total!.replace(/[^\d]/g, ""))).toBe(rows);
  });

  test("利润率按语义色区分，负毛利标红", async ({ page }) => {
    const loss = page.locator("tbody tr", { hasText: "亏损" }).first();
    await expect(loss).toBeVisible();
    const rate = await loss.locator("td.td-r.num").last().textContent();
    expect(parseFloat(rate!)).toBeLessThan(0);
  });

  test("只看利润率预警会缩小结果集", async ({ page }) => {
    const rows = page.locator("tbody tr:not(.empty-row)");
    const before = await rows.count();
    await page.getByText("只看利润率预警").click();
    await expect(page).toHaveURL(/risk=1/);
    await expect(rows).not.toHaveCount(before);
    expect(await rows.count()).toBeLessThan(before);
  });

  test("按利润率排序把最差的排在最前", async ({ page }) => {
    await page.getByRole("button", { name: /利润率/ }).click();
    await expect(page).toHaveURL(/sort=profit/);
    const rates = await page.locator("tbody tr td.td-r.num:nth-last-child(3)").allTextContents();
    const nums = rates.map((r) => parseFloat(r));
    const sorted = [...nums].sort((a, b) => a - b);
    expect(nums).toEqual(sorted);
  });

  test("点行打开成本构成与收付款进度", async ({ page }) => {
    await page.locator("tbody tr").first().click();
    const drawer = page.locator(".drawer");
    await expect(drawer).toHaveClass(/is-on/);
    await expect(drawer.getByText("成本构成")).toBeVisible();
    await expect(drawer.getByText("收付款进度")).toBeVisible();
    await expect(drawer.locator(".kpi")).toHaveCount(3);
    await page.keyboard.press("Escape");
  });

  test("结算状态分段筛选生效", async ({ page }) => {
    await page.getByRole("button", { name: "已完结", exact: true }).click();
    await expect(page).toHaveURL(/settle=/);
    const pills = await page.locator("tbody .pill").allTextContents();
    expect(pills.every((p) => p.includes("已完结"))).toBe(true);
  });
});

test.describe("退税管理", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/tax-refund");
    await waitHydrated(page);
  });

  test("KPI 随公司段联动重算", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "退税管理" })).toBeVisible();
    const allLines = await page.locator(".kpi").nth(2).locator(".v").textContent();

    await page.getByRole("button", { name: "晓行天下" }).click();
    await expect(page).toHaveURL(/entity=/);
    const segLines = await page.locator(".kpi").nth(2).locator(".v").textContent();

    expect(Number(segLines!.replace(/[^\d]/g, ""))).toBeLessThan(Number(allLines!.replace(/[^\d]/g, "")));
  });

  test("只看未关联订单会筛出标红的行", async ({ page }) => {
    await page.getByText("只看未关联订单").click();
    await expect(page).toHaveURL(/unlinked=1/);
    const rows = page.locator("tbody tr:not(.empty-row)");
    await expect(rows).not.toHaveCount(0);
    await expect(page.locator("tbody .pill.coral").first()).toContainText("未关联");
  });

  test("关联向导可把发票挂到 PI 上，并可撤销", async ({ page }) => {
    // 空态本身也是一个 <tr>，只数真实数据行才准
    const rows = page.locator("tbody tr:not(.empty-row)");
    const unfiltered = await rows.count();
    await page.getByText("只看未关联订单").click();
    await expect(page).toHaveURL(/unlinked=1/);
    // 等服务端筛选回来，否则取到的基数还是没筛之前的
    await expect(rows).not.toHaveCount(unfiltered);
    const before = await rows.count();
    expect(before).toBeGreaterThan(0);

    await page.locator("tbody").getByRole("button", { name: "关联" }).first().click();
    const drawer = page.locator(".drawer");
    await expect(drawer).toHaveClass(/is-on/);
    await expect(drawer.locator(".crow")).not.toHaveCount(0);

    await drawer.locator(".crow").first().click();
    // 挂上之后这一行就不该出现在「只看未关联」里了
    await expect(rows).toHaveCount(before - 1);

    await page.locator(".toast").getByRole("button", { name: "撤销" }).click();
    await expect(rows).toHaveCount(before);
  });

  test("税额合计随筛选实时重算", async ({ page }) => {
    const totalEl = page.locator(".table-bar .num").last();
    const readTotal = async () => Number((await totalEl.textContent())!.replace(/[^\d.]/g, ""));

    const all = await readTotal();
    await page.getByRole("button", { name: "供应链" }).click();
    // 等服务端筛选回来再读，否则读到的还是上一次的合计
    await expect(page).toHaveURL(/entity=/);
    await expect.poll(readTotal).toBeLessThan(all);
    expect(await readTotal()).toBeGreaterThan(0);
  });
});
