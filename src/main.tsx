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
 * 用户站点（decli.github.io）是 `/`，项目站点是 `/ForeignTradeManagementSystem/`。
 * 路由 basename 跟着走，两种部署共用一套代码。
 */
const basename = import.meta.env.BASE_URL.replace(/\/$/, "");

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
