import { execSync } from "node:child_process";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

/** 每条路由第一次被访问时要现加载模块、开数据库连接，比之后慢一大截。
 *  先各打一次，免得第一个用例撞上冷启动延迟。 */
const ROUTES = ["/follow-ups", "/orders", "/tax-refund", "/dashboard", "/customers", "/audit"];

async function waitForServer(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/follow-ups`);
      if (res.ok) return;
    } catch {
      // 服务还没起来，继续等
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`等不到服务：${BASE}`);
}

/**
 * 用例会真的写库（改动态、批量更新、关联发票），跑之前先把演示数据灌回去，
 * 这样无论上一轮跑成什么样，每次都是同一个起点。
 */
export default async function globalSetup() {
  execSync("npx prisma db seed", { stdio: "inherit" });
  await waitForServer();
  await Promise.all(ROUTES.map((r) => fetch(`${BASE}${r}`).catch(() => undefined)));
}
