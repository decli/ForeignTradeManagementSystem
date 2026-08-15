/**
 * Google Analytics 4。
 *
 * 目的很具体：看清楚**演示站的访客走到哪一步就走了**。
 * 是登录页就关掉，还是进去点了两个模块？有没有人真的走到「导出」和
 * 「开始用我的账套」？这两个问题的答案决定下一版先做什么。
 *
 * ── 四条硬约定 ──
 *
 * **1. 没配 ID 就什么都不做。** 不是「加载了但不发」，是**一行脚本都不下载**。
 *    fork 这个仓库的人不该莫名其妙替别人收数据，本地开发也不该往线上打点。
 *
 * **2. 尊重 Do Not Track。** GA 默认不管这个信号，这里主动管。
 *    一个卖「你的数据只存在你自己浏览器里」的产品，如果转头无视用户明说的
 *    拒绝追踪，那句宣传就是空的。
 *
 * **3. 不上报任何业务数据。** 事件参数里只允许出现模块名、动作名这类
 *    界面元信息。客户名、PI 号、金额、邮箱一律不进 GA —— 那是访客的数据，
 *    不是我们的。演示账套里的是假数据，但用户自己建的账套里的不是。
 *
 * **4. SPA 必须手动报 page_view。** gtag 只在脚本加载那一刻自动报一次，
 *    之后换 33 个模块它一无所知，看板上会显示「平均每次会话 1 个页面」。
 *    所以关掉自动上报，改成跟着路由走。
 */

/** 构建时注入。`VITE_GA_ID=G-XXXXXXXXXX npm run build:site` */
const GA_ID = (import.meta.env.VITE_GA_ID ?? "").trim();

/** 浏览器明说了不要被追踪就不追踪。三个字段是不同浏览器/年代的写法 */
function optedOut(): boolean {
  if (typeof navigator === "undefined") return true;
  const nav = navigator as Navigator & { msDoNotTrack?: string };
  const win = window as Window & { doNotTrack?: string };
  const dnt = nav.doNotTrack ?? win.doNotTrack ?? nav.msDoNotTrack;
  return dnt === "1" || dnt === "yes";
}

let ready = false;

/** 装没装上。给设置页显示状态用 —— 埋点是否生效不该只有开发者知道 */
export const analyticsState = () => ({
  configured: !!GA_ID,
  enabled: ready,
  reason: !GA_ID ? ("未配置 GA ID" as const) : optedOut() ? ("浏览器要求不被追踪" as const) : null,
});

type Params = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * 装载 gtag.js。在 main.tsx 里调一次。
 *
 * 脚本走 async，且不参与首屏 —— 统计代码拖慢的是产品本身，
 * 而拖慢产品会让统计出来的跳出率变难看，得不偿失。
 */
export function initAnalytics() {
  if (ready || !GA_ID || optedOut()) return;

  window.dataLayer = window.dataLayer || [];
  // 必须是 arguments 而不是数组：gtag.js 读的是 arguments 对象本身
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", GA_ID, {
    // SPA 的 page_view 由 trackPage() 手动发，见文件头第 4 条
    send_page_view: false,
    anonymize_ip: true,
    // 演示站不需要跨站广告受众，关掉信号能少一类同意书要求
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    app_version: __APP_VERSION__,
  });

  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(s);
  ready = true;
}

/** 一次页面浏览。path 用应用内路由（/follow-ups），不带查询串 —— 筛选条件不是页面 */
export function trackPage(path: string, title: string) {
  if (!ready) return;
  window.gtag?.("event", "page_view", {
    page_path: path,
    page_title: title,
    page_location: location.origin + path,
  });
}

/**
 * 一个业务动作。
 *
 * 只传界面元信息，见文件头第 3 条 —— 调用点写 `track("export", { module: "orders" })`，
 * 不要写 `track("export", { customer: row.customerName })`。
 */
export function track(event: string, params: Params = {}) {
  if (!ready) return;
  window.gtag?.("event", event, params);
}
