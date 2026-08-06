import type { Page } from "@playwright/test";

/**
 * 等到筛选条真正可交互再操作。
 *
 * 水合之前 DOM 已经渲染，但 onChange / onClick 还没绑定，原生点击会静默失效——
 * 表现就是「明明点了，URL 却没变」。各客户端组件是各自独立水合的，
 * 所以这里等的是筛选条自己打出的标记，而不是外壳的。
 */
export async function waitHydrated(page: Page) {
  await page.locator('.filters[data-ready="1"]').first().waitFor({ state: "attached" });
}
