import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

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

export default defineConfig({
  // 默认按用户站点（decli.github.io 根路径）构建；
  // 项目站点用 `npm run build:project` 覆盖成 /ForeignTradeManagementSystem/
  base: "/",
  plugins: [react(), spaFallback()],
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
