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
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

  /* ── 这个脚本只碰三样东西 ──
     `ftms/`（整个替换）、`.nojekyll`、根目录的 `robots.txt`（没有才建）。
     根目录的 index.html / 404.html 是**站点主页**，属于仓库主人，
     这里一个字都不改 —— 部署一个子项目顺手把人家首页覆盖掉，
     是这类脚本最容易犯、也最难查的错。 */

  // 只清自己那一格
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  cpSync(join(root, "dist"), dest, { recursive: true });

  // GitHub Pages 默认走 Jekyll，下划线开头的目录会被吞掉。这个标记是全仓库级的
  writeFileSync(join(work, ".nojekyll"), "");

  /* robots.txt 只有在**站点根目录**才会被爬虫读到，子目录那份没人看 ——
     所以 sitemap 的登记只能落在根上。但根目录那几个文件归首页仓库
     （decli/githubBlogHomePage）管，这里只查不写：两个仓库都往同一个文件里
     写字，迟早互相覆盖，而覆盖掉的那次没人会发现。 */
  const robots = join(work, "robots.txt");
  const sitemapLine = `Sitemap: https://decli.github.io/${SUBDIR}/sitemap.xml`;
  if (!existsSync(robots) || !readFileSync(robots, "utf8").includes(sitemapLine)) {
    console.log(
      `\n⚠️  站点根目录的 robots.txt 里没有这一行，搜索引擎发现不了本站的 sitemap：\n` +
        `   ${sitemapLine}\n` +
        `   它归首页仓库管，去 decli/githubBlogHomePage 的 robots.txt 里补上。\n`,
    );
  }

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
