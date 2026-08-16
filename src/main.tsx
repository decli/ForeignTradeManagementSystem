import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { DataProvider } from "./data/DataProvider";
import { AuthProvider } from "./auth/AuthProvider";
import { LangProvider } from "./i18n";
import { isDemo } from "./data/profile";
import { initAnalytics } from "./lib/analytics";
import { initSpotlight } from "./lib/spotlight";
import "./styles/index.css";

/**
 * BASE_URL 由构建时的 --base 决定：
 * 主站是 `/ftms/`，项目站点镜像是 `/ForeignTradeManagementSystem/`，
 * 本地开发是 `/`。路由 basename 跟着走，三种部署共用一套代码。
 */
const basename = import.meta.env.BASE_URL.replace(/\/$/, "");

/**
 * 深链接兜底。
 *
 * GitHub Pages 没有服务端，刷新 `/ftms/follow-ups` 会走 404 流程。正常情况下
 * Pages 会回落到同目录的 `ftms/404.html`（构建时由 index.html 拷贝而来），
 * 路由读 pathname 就能正确渲染 —— 这条路走通时下面这段根本不会执行。
 *
 * 但「Pages 会不会为子目录找最近的那个 404.html」这件事，官方文档说得并不硬，
 * 而它错了的后果是**所有深链接刷新后全 404**。所以站点根目录那份 404.html 里
 * 留了一小段脚本：遇到 /ftms/ 开头的路径，把原始路径记进 sessionStorage
 * 再跳回 /ftms/。这里把它取回来，用 replaceState 还原成原来的地址 ——
 * 用户看到的 URL 和刷新前一模一样，历史记录里也不会多出一条。
 *
 * 用 sessionStorage 而不是查询串：查询串会在地址栏里留下 `?p=/ftms/follow-ups`
 * 这种一看就是补丁的东西，而这个产品的路由是刻意保持干净的。
 */
const RESCUE_KEY = "ftms:deeplink";
try {
  const saved = sessionStorage.getItem(RESCUE_KEY);
  if (saved) {
    sessionStorage.removeItem(RESCUE_KEY);
    // 只认本站路径，"//evil.com" 这种协议相对写法会被当成外站地址
    if (saved.startsWith(basename + "/") && !saved.startsWith("//")) {
      history.replaceState(null, "", saved);
    }
  }
} catch {
  /* 隐私模式下没有 sessionStorage，那就退回 404.html 已经跳到的首页 */
}

// 卡片光晕跟随鼠标。委托一次就覆盖全站的 .kpi，页面里不用管
initSpotlight();

/* 访问统计。没配 VITE_GA_ID 或浏览器要求不被追踪时，这一行什么都不做，
   连脚本都不会下载 —— 见 lib/analytics.ts 的四条约定 */
initAnalytics();

/* 演示账套在 body 上打标记，打印时给单据盖水印（见 print.css）。
   账套只在重载时才会变，所以在这里设一次就够，不用跟着 React 走。 */
document.body.dataset.demo = isDemo() ? "1" : "0";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={basename || undefined}>
      <LangProvider>
        <DataProvider
          fallback={
            <div className="boot">
              <div className="boot-mark" aria-hidden="true" />
              <p>正在装载账套…</p>
            </div>
          }
        >
          <AuthProvider>
            <App />
          </AuthProvider>
        </DataProvider>
      </LangProvider>
    </BrowserRouter>
  </StrictMode>,
);
