#!/usr/bin/env node
/**
 * 把构建产物推到用户站点仓库 decli/decli.github.io。
 *
 * 用户站点服务在根路径，所以必须用 base=/ 构建（`npm run build:root`）。
 * 那个仓库只放构建产物 —— 源码的唯一真相是本仓库，别在两个地方各留一份。
 *
 *   npm run deploy
 *   npm run deploy -- --dry     只构建，不推
 */

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const TARGET = process.env.DEPLOY_REPO ?? "https://github.com/decli/decli.github.io.git";
const BRANCH = "main";
const dry = process.argv.includes("--dry");

const run = (cmd, args, cwd = root) =>
  execFileSync(cmd, args, { cwd, stdio: "inherit", env: process.env });

console.log("→ 构建（base=/）");
run("npm", ["run", "build:root"]);

if (dry) {
  console.log("→ --dry：跳过推送");
  process.exit(0);
}

const work = mkdtempSync(join(tmpdir(), "tradeflow-deploy-"));
try {
  console.log(`→ 克隆 ${TARGET}`);
  run("git", ["clone", "--depth", "1", "--branch", BRANCH, TARGET, work], root);

  // 清掉旧产物，但留着 .git 和 CNAME（自定义域名配置不该被构建覆盖）
  for (const name of readdirSync(work)) {
    if (name === ".git" || name === "CNAME") continue;
    rmSync(join(work, name), { recursive: true, force: true });
  }

  cpSync(join(root, "dist"), work, { recursive: true });
  // GitHub Pages 默认会用 Jekyll 处理，下划线开头的目录会被吞掉
  writeFileSync(join(work, ".nojekyll"), "");

  const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root }).toString().trim();
  run("git", ["add", "-A"], work);
  const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: work }).toString().trim();
  if (!dirty) {
    console.log("→ 产物与线上一致，无需推送");
    process.exit(0);
  }
  run("git", ["commit", "-m", `deploy: ForeignTradeManagementSystem@${sha}`], work);
  run("git", ["push", "origin", BRANCH], work);
  console.log("✓ 已发布 → https://decli.github.io/");
} finally {
  rmSync(work, { recursive: true, force: true });
}
