import { defineConfig, devices } from "@playwright/test";

/**
 * 端到端测试跑在真实的 Next 服务 + 真实 SQLite 上，不打桩。
 * 每次开跑前 globalSetup 会重灌演示数据，保证可重复。
 */
export default defineConfig({
  testDir: "./tests",
  globalSetup: "./tests/global-setup.ts",
  fullyParallel: false, // 多条用例共用同一个数据库，串行跑避免互相干扰
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1600, height: 1000 } } },
  ],
  // 必须跑生产构建，不能用 dev server：
  // dev 是按需编译的，用例会随机撞上编译延迟；更要命的是 dev 下的 Server Action
  // 会把客户端 router.replace 加上去的查询串丢掉（筛选条件自己复位），
  // 生产构建没有这个问题。构建由 `npm test` 脚本先做掉，这里只负责启动。
  //
  // 默认不复用已在跑的服务：复用会让测试跑在上一次构建的旧代码上，
  // 表现是改了代码测试却没反应，很难查。快速迭代时显式设 PW_REUSE_SERVER=1。
  webServer: {
    command: "npm start",
    url: "http://localhost:3000/follow-ups",
    reuseExistingServer: Boolean(process.env.PW_REUSE_SERVER),
    timeout: 120_000,
  },
});
