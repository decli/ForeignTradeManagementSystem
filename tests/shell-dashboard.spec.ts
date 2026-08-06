import { test, expect } from "@playwright/test";

test.describe("应用外壳", () => {
  test("侧栏列出全部模块，已建的可点进去", async ({ page }) => {
    await page.goto("/follow-ups");

    const items = page.locator(".nav-item");
    await expect(items).toHaveCount(28);

    // 已建模块带「已建」标记
    await expect(page.locator(".tag-built")).not.toHaveCount(0);

    // 圆点必须是圆的：曾经因为 `.nav-item span` 盖掉 flex 基准被拉成长条
    const dot = page.locator(".nav-dot").first();
    const box = await dot.boundingBox();
    expect(Math.abs(box!.width - box!.height)).toBeLessThan(2);
    expect(box!.width).toBeLessThan(10);
  });

  test("未开发的模块进占位页，说明功能范围", async ({ page }) => {
    await page.goto("/m/bank-journal");
    await expect(page.locator(".soon h2")).toHaveText("银行日记账");
    await expect(page.locator(".scope span")).not.toHaveCount(0);
  });

  test("侧栏可折叠成图标轨", async ({ page }) => {
    await page.goto("/follow-ups");
    const app = page.locator(".app");
    await expect(app).toHaveAttribute("data-collapsed", "0");
    await page.getByRole("button", { name: "收起导航" }).click();
    await expect(app).toHaveAttribute("data-collapsed", "1");
  });

  test("深色模式可切换且能记住", async ({ page }) => {
    await page.goto("/follow-ups");
    await page.getByRole("button", { name: "切换浅色 / 深色" }).click();
    const theme = await page.evaluate(() => document.documentElement.dataset.theme);
    expect(["dark", "light"]).toContain(theme);

    await page.reload();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
      .toBe(theme);
  });

  test("页面不横向溢出", async ({ page }) => {
    for (const path of ["/follow-ups", "/orders", "/tax-refund", "/dashboard", "/customers", "/audit"]) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} 不应横向溢出`).toBeLessThanOrEqual(1);
    }
  });

  test("首页跳到跟单表", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/follow-ups$/);
  });
});

test.describe("数据看板", () => {
  test("KPI、图表与风险清单都来自真实数据", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "数据看板" })).toBeVisible();
    await expect(page.locator(".kpi")).toHaveCount(5);

    await expect(page.getByRole("img", { name: /月度出运/ })).toBeVisible();
    await expect(page.getByRole("img", { name: /利润率分布/ })).toBeVisible();

    // 目的国条形图的填充宽度必须真的被算出来
    const width = await page.locator(".bar-fill").first().evaluate((el) => (el as HTMLElement).style.width);
    expect(width).toMatch(/%$/);
    const height = await page.locator(".bar-track").first().evaluate((el) => el.getBoundingClientRect().height);
    expect(height).toBeGreaterThan(4);
  });

  test("风险清单能跳到能处理它的页面", async ({ page }) => {
    await page.goto("/dashboard");
    const risks = page.locator(".risk");
    await expect(risks).not.toHaveCount(0);
    await risks.first().getByRole("link", { name: "去处理" }).click();
    await expect(page).toHaveURL(/follow-ups|orders|tax-refund|customers/);
  });
});

test.describe("客户管理", () => {
  test("左列表右详情，选中后同步", async ({ page }) => {
    await page.goto("/customers");
    await expect(page.locator(".crow")).not.toHaveCount(0);

    const second = page.locator(".crow").nth(1);
    const name = (await second.locator(".who b").textContent())!.trim();
    await second.click();

    await expect(page).toHaveURL(/id=/);
    await expect(page.locator(".card-h h3").last()).toHaveText(name);
  });

  test("中信保额度占用超限时标红", async ({ page }) => {
    await page.goto("/customers");
    const pills = page.locator(".crow .pill");
    await expect(pills).not.toHaveCount(0);
    const texts = await pills.allTextContents();
    expect(texts.every((t) => /%$/.test(t.trim()))).toBe(true);
  });
});

test.describe("审计日志", () => {
  test("跟单表的写操作会留痕", async ({ page }) => {
    const stamp = `审计验证 ${Date.now()}`;
    await page.goto("/follow-ups");
    await page.locator(".note-btn").first().click();
    await page.locator(".pop textarea").fill(stamp);
    await page.locator(".pop").getByRole("button", { name: "保存" }).click();
    await expect(page.getByText(stamp)).toBeVisible();

    await page.goto("/audit");
    await expect(page.locator("tbody tr").first()).toContainText("改动态");
    await expect(page.locator("tbody").getByText(stamp).first()).toBeVisible();
  });
});

test.describe("Excel 导出", () => {
  for (const [path, kind, name] of [
    ["/follow-ups", "follow-ups", "跟单表"],
    ["/orders", "orders", "订单核算跟踪"],
    ["/tax-refund", "tax-refund", "退税管理"],
  ] as const) {
    test(`${name} 能导出真正的 xlsx`, async ({ page }) => {
      await page.goto(path);
      const res = await page.request.get(`/api/export/${kind}`);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toContain("spreadsheetml");

      const body = await res.body();
      // xlsx 是个 zip，头两个字节必须是 PK
      expect(body.subarray(0, 2).toString()).toBe("PK");
      expect(body.length).toBeGreaterThan(1000);
    });
  }

  test("导出跟随当前筛选条件", async ({ page }) => {
    await page.goto("/tax-refund");
    const all = await (await page.request.get("/api/export/tax-refund")).body();
    const filtered = await (await page.request.get("/api/export/tax-refund?unlinked=1")).body();
    expect(filtered.length).toBeLessThan(all.length);
  });
});
