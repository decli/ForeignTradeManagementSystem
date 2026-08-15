/** 构建时由 vite.config.ts 的 define 注入，取自 package.json 的 version */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Google 单点登录的客户端 ID。不配则登录页不出 Google 按钮 */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /** GA4 衡量 ID（G-XXXXXXXXXX）。不配则一行统计脚本都不加载，见 lib/analytics.ts */
  readonly VITE_GA_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
