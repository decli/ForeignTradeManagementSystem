import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { DataProvider } from "./data/DataProvider";
import { AuthProvider } from "./auth/AuthProvider";
import { LangProvider } from "./i18n";
import "./styles/index.css";

/**
 * BASE_URL 由构建时的 --base 决定：
 * 用户站点（decli.github.io）是 `/`，项目站点是 `/ForeignTradeManagementSystem/`。
 * 路由 basename 跟着走，两种部署共用一套代码。
 */
const basename = import.meta.env.BASE_URL.replace(/\/$/, "");

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
