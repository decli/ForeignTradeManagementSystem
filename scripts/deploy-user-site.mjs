#!/usr/bin/env node
/**
 * 把构建产物推到用户站点仓库 decli/decli.github.io 的 `ftms/` 子目录。
 *
 * ── 为什么是子目录，不是根 ──
 * decli.github.io 是**个人主页**的地址，它的根路径应该留给主页本身。
 * 一个业务系统占着 `https://decli.github.io/` 这个主入口，等于把名片
 * 换成了一张产品说明书 —— 以后再放任何东西都没地方摆了。
 * 所以这个项目落在 `https://decli.github.io/ftms/`。
 *
 * ── 只动 ftms/，别碰别人的东西 ──
 * 这个仓库是**共享**的：根目录下还有主页和其它项目。所以清理这一步
 * 只清 `ftms/` 一个目录，其余一律不动。历史上这个脚本是「除了 .git 和
 * CNAME 全删」，那是在它独占整个仓库的前提下写的 —— 前提变了，
 * 那行代码就从「清理」变成了「删掉主页」。
 *
 *   npm run deploy
 *   npm run deploy -- --dry     只构建，不推
 */

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const TARGET = process.env.DEPLOY_REPO ?? "https://github.com/decli/decli.github.io.git";
const BRANCH = "main";
/** 站点在用户仓库里的落点。改这里就等于换 URL，同时要改 package.json 的 build:site */
const SUBDIR = "ftms";
const dry = process.argv.includes("--dry");

const run = (cmd, args, cwd = root) =>
  execFileSync(cmd, args, { cwd, stdio: "inherit", env: process.env });

console.log(`→ 构建（base=/${SUBDIR}/）`);
run("npm", ["run", "build:site"]);

if (dry) {
  console.log("→ --dry：跳过推送");
  process.exit(0);
}

const work = mkdtempSync(join(tmpdir(), "tradeflow-deploy-"));
try {
  console.log(`→ 克隆 ${TARGET}`);
  run("git", ["clone", "--depth", "1", "--branch", BRANCH, TARGET, work], root);

  const dest = join(work, SUBDIR);

  /* 旧版本曾经发布在仓库根目录。那批文件还躺在那儿的话，
     一是 `/` 仍然是这个系统（主入口没让出来），二是同一份内容出现在两个
     URL 上，搜索引擎会当重复内容处理。这里只提示，不自动删 ——
     根目录下有什么是这个脚本看不见的，删错了就是删掉别人的主页。 */
  const strays = ["index.html", "404.html", "assets", "favicon.svg", "robots.txt", "sitemap.xml", "llms.txt", "og.png"]
    .filter((n) => existsSync(join(work, n)));
  if (strays.length) {
    console.log(
      `\n⚠️  用户站点根目录下还留着上一版直接发布在 / 的产物：\n` +
        `   ${strays.join("  ")}\n` +
        `   它们会让 https://decli.github.io/ 仍然打开这个系统，并和 /${SUBDIR}/ 构成重复内容。\n` +
        `   确认根目录该放什么之后，在 decli.github.io 仓库里手动删掉这几项。\n`,
    );
  }

  // 只清自己那一格
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  cpSync(join(root, "dist"), dest, { recursive: true });

  // GitHub Pages 默认走 Jekyll，下划线开头的目录会被吞掉。这个标记是全仓库级的
  writeFileSync(join(work, ".nojekyll"), "");

  const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root }).toString().trim();
  run("git", ["add", "-A"], work);
  const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: work }).toString().trim();
  if (!dirty) {
    console.log("→ 产物与线上一致，无需推送");
    process.exit(0);
  }
  run("git", ["commit", "-m", `deploy: ForeignTradeManagementSystem@${sha} → /${SUBDIR}/`], work);
  run("git", ["push", "origin", BRANCH], work);
  console.log(`✓ 已发布 → https://decli.github.io/${SUBDIR}/`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
