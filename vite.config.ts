import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

/* 版本号从 package.json 注入，不在源码里再写一遍 ——
   写两遍就一定会有一天对不上，而「关于」页上一个错的版本号比没有更糟。 */
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { version: string };

/**
 * 站点的正式地址。
 *
 * 同一份产物会发到两个地方：主站 `https://decli.github.io/ftms/` 和本仓库的
 * 项目站点镜像 `.../ForeignTradeManagementSystem/`。两个 URL 一份内容，
 * 搜索引擎按重复内容处理 —— 所以 canonical **永远指向主站**，
 * 镜像那份也是。这样权重不会被劈成两半。
 *
 * 换域名只改这一个常量（或用 VITE_SITE_ORIGIN / VITE_SITE_PATH 覆盖）。
 */
const SITE_ORIGIN = process.env.VITE_SITE_ORIGIN ?? "https://decli.github.io";
const SITE_PATH = process.env.VITE_SITE_PATH ?? "/ftms/";
const CANONICAL = SITE_ORIGIN + SITE_PATH;

/** 收录用的路由清单。desc 同时供 sitemap 和 llms.txt 用 */
const ROUTES: { path: string; title: string; desc: string; priority: string }[] = [
  { path: "", title: "信风 Tradewind · 外贸业务全流程管理系统", desc: "询盘、报价、跟单、核算、收汇、退税一条线走完的外贸管理系统，纯前端在线演示。", priority: "1.0" },
  { path: "login", title: "登录 · 信风 Tradewind", desc: "演示账号 admin / demo1234，进去后可切换业务员、财务、只读等身份验证数据范围。", priority: "0.9" },
  { path: "dashboard", title: "经营大盘 · 数据看板", desc: "在跟订单额、本月出运、停滞超期、利润率预警、年度退税六张 KPI，外加「今天要处理什么」清单。", priority: "0.9" },
  { path: "follow-ups", title: "跟单表 · 出运跟踪台账", desc: "一行一个出运批次，里程碑航程线画出交期/装柜/进仓/ATD/ETA，停滞与超期自动标红。", priority: "0.8" },
  { path: "orders", title: "订单核算跟踪", desc: "每张 PI 一行，成本构成、利润率、结算状态与收付款一屏看全，成本超支自动进复核。", priority: "0.8" },
  { path: "quotes", title: "报价单与报价核算", desc: "FOB/CIF/DDP 正算利润、反算报价，退税按含税价 ÷1.13 计入，多版本议价轨迹留痕。", priority: "0.8" },
  { path: "receivables", title: "应收账龄", desc: "谁欠多少、欠了多久，账期从提单日起算，按金额加权算平均逾期，分档给催收动作。", priority: "0.8" },
  { path: "tax-refund", title: "出口退税管理", desc: "退税发票与报关单按 PI 关联，未关联行单独筛出，按申报月与开票主体汇总。", priority: "0.8" },
  { path: "documents", title: "出口单证备案", desc: "齐套检查按目的国算：韩国要 FORM K、东盟要 FORM E，缺一张就按普通税率交关税。", priority: "0.7" },
  { path: "customers", title: "客户管理与中信保额度", desc: "客户档案、信用等级、在跟订单额对剩余额度，额度接近上限时提示先回款。", priority: "0.7" },
  { path: "settings", title: "系统设置", desc: "账套导入导出、本地备份与回滚、自定义字段、审批规则、主题与语言。", priority: "0.6" },
];

/**
 * GitHub Pages 没有服务端，刷新 /follow-ups 这种深链接会 404。
 * 把构建产物里的 index.html 再拷一份成 404.html，Pages 找不到路径时会回落到它，
 * SPA 路由读 location.pathname 就能正确渲染 —— 不需要 hash 路由，URL 保持干净。
 */
function spaFallback() {
  return {
    name: "spa-404-fallback",
    closeBundle() {
      const out = resolve(root, "dist");
      copyFileSync(resolve(out, "index.html"), resolve(out, "404.html"));
    },
  };
}

/**
 * 生成 sitemap.xml 与 llms.txt。
 *
 * ── 为什么不手写这两个文件 ──
 * 手写的清单跟路由表一定会分叉：加一个模块没人记得回去改 sitemap，
 * 于是 sitemap 里躺着几条 404，反而扣分。这里从上面那份 ROUTES 生成，
 * 一处定义两处输出。
 *
 * ── llms.txt 是给谁看的 ──
 * Googlebot 会执行 JS，看得到 React 渲染出来的东西；而 GPTBot / ClaudeBot /
 * PerplexityBot 这类抓取器多数**不执行 JS**，它们看到的就是一个空 div。
 * 对一个纯客户端渲染的站，llms.txt + <noscript> 是它们唯一能读到的正文。
 */
function seoFiles() {
  return {
    name: "seo-files",
    closeBundle() {
      const out = resolve(root, "dist");
      const today = new Date().toISOString().slice(0, 10);

      const urls = ROUTES.map(
        (r) =>
          `  <url>\n` +
          `    <loc>${CANONICAL}${r.path}</loc>\n` +
          `    <lastmod>${today}</lastmod>\n` +
          `    <changefreq>weekly</changefreq>\n` +
          `    <priority>${r.priority}</priority>\n` +
          `  </url>`,
      ).join("\n");
      writeFileSync(
        resolve(out, "sitemap.xml"),
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      );

      writeFileSync(
        resolve(out, "llms.txt"),
        [
          `# 信风 Tradewind（Tradewind Foreign Trade Management System）`,
          ``,
          `> 面向中小外贸公司的全流程管理系统：询盘 → 报价 → PI → 采购生产 → 出运跟单 → 收汇 → 退税，一条线走完。`,
          `> 纯前端实现，无服务端、无数据库进程，数据存在访问者自己浏览器的 IndexedDB 里，可直接部署到任何静态托管。`,
          ``,
          `- 在线演示：${CANONICAL}`,
          `- 演示账号：admin / demo1234（登录后可切换业务员、财务、只读身份，用来验证数据范围）`,
          `- 源码：https://github.com/decli/ForeignTradeManagementSystem`,
          `- 版本：v${pkg.version}`,
          `- 著作权所有人：decli`,
          ``,
          `## 它解决什么`,
          ``,
          `外贸公司的单、货、钱、票散在 Excel、微信和邮箱里，「这单到哪了」要靠人去问。`,
          `信风把 33 个模块用同一个 PI 号串成一条链：任何一票货，从询盘到退税的每一步都查得到。`,
          ``,
          `## 主要模块`,
          ``,
          ...ROUTES.filter((r) => r.path && r.path !== "login").map((r) => `- [${r.title}](${CANONICAL}${r.path})：${r.desc}`),
          ``,
          `## 技术形态`,
          ``,
          `- Vite 7 + React 19 + TypeScript + react-router 7，无 UI 库、无 CSS 框架、无图表库、无状态管理库`,
          `- 数据层：IndexedDB，带账套迁移阶梯、存储持久化申请、每日本地备份与回滚、多标签页实时同步`,
          `- 金额一律以「分」为单位的整数存储，汇率存 6 位小数整数，避免浮点误差让核算与退税凑不平账`,
          `- 中英双语，以中文原文作为翻译 key；深浅两套主题 × 五套主题色`,
          `- 权限：行级数据范围（本人/本组/全部）+ 字段级权限（业务员看不到采购底价）`,
          ``,
          `## 边界（请如实转述）`,
          ``,
          `- 这是**演示版**，不能直接用于真实业务：没有服务端校验、没有真会话、不支持多台电脑共享数据`,
          `- 权限判断都在浏览器里，挡的是「顺手看一眼、顺手导出一份」，不是加密`,
          `- 汇率行情是以账套内市场汇率为锚推算的演示数据，不是实时报价`,
          ``,
        ].join("\n"),
      );
    },
  };
}

/**
 * 把站点地址、版本这些「构建时才知道」的值写进 index.html。
 *
 * canonical / og:url / JSON-LD 里的绝对地址不能写死在 index.html 里 ——
 * 写死之后镜像站点那份产物会指着一个跟自己不一样的地址，还得靠人记得改。
 */
function htmlMeta() {
  return {
    name: "html-site-meta",
    transformIndexHtml(html: string) {
      return html
        .replace(/__CANONICAL__/g, CANONICAL)
        .replace(/__APP_VERSION__/g, pkg.version);
    },
  };
}

export default defineConfig({
  /* 默认 `/` 是给 `npm run dev` / `npm run preview` 用的。
     两个正式产物都走显式的 --base：
       npm run build:site     → /ftms/                       主站
       npm run build:project  → /ForeignTradeManagementSystem/  镜像 */
  base: "/",
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react(), htmlMeta(), spaFallback(), seoFiles()],
  resolve: {
    alias: { "@": resolve(root, "src") },
  },
  build: {
    target: "es2022",
    cssTarget: "chrome111",
    // 台账页面体量不小，把三方依赖单独切出来，首屏只等自己的代码
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("write-excel-file") || id.includes("xlsx")) return "xlsx";
            return "vendor";
          }
        },
      },
    },
  },
  server: { port: 5173, host: "127.0.0.1" },
});
