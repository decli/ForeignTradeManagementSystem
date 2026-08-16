/**
 * Google Analytics 4。
 *
 * 目的很具体：看清楚**演示站的访客走到哪一步就走了**。
 * 是登录页就关掉，还是进去点了两个模块？有没有人真的走到「导出」和
 * 「开始用我的账套」？这两个问题的答案决定下一版先做什么。
 *
 * ── 四条硬约定 ──
 *
 * **1. 不该统计的场合一行脚本都不下载。** 不是「加载了但不发」。
 *    内置 ID 只在官方域名上生效，所以 fork 的人不会替别人收数据，
 *    本地开发也不会往线上打脏数据 —— 细节见下面那段。
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

/**
 * ── 衡量 ID 与它的适用范围 ──
 *
 * GA 的衡量 ID 不是密钥 —— 它明文写在每个页面的 HTML 里，任何访客按 F12 都看得到。
 * 所以直接写在源码里，而不是塞进 secret：塞进 secret 只会让「本机 deploy」和
 * 「CI 构建」各配一次，然后有一天忘了配，数据就悄悄断了。
 *
 * 但写死会带来另一个问题：fork 这个仓库的人一构建就在替别人收数据。
 * 所以内置这个 ID **只在官方域名上生效**。别人 fork 到自己的 github.io、
 * 或者在 localhost 上跑，一行统计脚本都不会加载。
 * 真想统计的人配自己的 `VITE_GA_ID`，那是显式选择，就不再受域名限制。
 *
 * ── 为什么 decli.github.io 下的几个站共用同一个 ID ──
 * /ftms/、/ems/、/wxformat3/ 在**同一个域名**下。GA4 靠域名级的 _ga cookie
 * 认人，同一个 property 才能把「从门户点进 ftms、退出来又去了 ems」
 * 看成一次会话、一条路径。拆成三个 property 的话，同一个人会被算成三个访客，
 * 跨站流向彻底看不到 —— 而那恰恰是做门户首页最想知道的事。
 * 分站数据靠 page_path 的前缀和 `site` 参数切开，见 trackPage()。
 */
const BUILTIN_GA_ID = "G-Y7H2JMNX74";
const OFFICIAL_HOSTS = ["decli.github.io"];
const ENV_GA_ID = (import.meta.env.VITE_GA_ID ?? "").trim();
const GA_ID = ENV_GA_ID || BUILTIN_GA_ID;

/** 这个站点该不该用上面那个 ID */
const idApplies = () =>
  typeof location !== "undefined" && (!!ENV_GA_ID || OFFICIAL_HOSTS.includes(location.hostname));

/** 报表里用来区分同域下几个站的标签。跟着部署的 base 走，不用手写 */
const SITE = (import.meta.env.BASE_URL || "/").replace(/^\/|\/$/g, "") || "root";

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
  configured: !!GA_ID && idApplies(),
  enabled: ready,
  reason: !GA_ID
    ? ("未配置 GA ID" as const)
    : !idApplies()
      ? ("非官方部署，内置 ID 不生效" as const)
      : optedOut()
        ? ("浏览器要求不被追踪" as const)
        : null,
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
  if (ready || !GA_ID || !idApplies() || optedOut()) return;

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
    // 同域下几个站共用一个 property，靠这个参数在报表里分开
    site: SITE,
  });

  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(s);
  ready = true;
}

/**
 * 一次页面浏览。
 *
 * ⚠️ 传进来的 path 是 **react-router 的 pathname，它剥掉了 basename** ——
 * 站点部署在 /ftms/ 下时，/ftms/follow-ups 到这儿只剩 /follow-ups。
 * 直接上报的话，同域下的 /ftms/ 和 /ems/ 在 GA 报表里会挤成同一批路径，
 * 而这几个站共用一个 property，正是靠路径前缀区分的 —— 所以这里补回 base。
 *
 * page_location 必须是**真实地址**（location.href），不能拿 origin 拼 path：
 * 拼出来的 https://decli.github.io/follow-ups 是个根本不存在的 URL，
 * GA 里点进去 404，报表也就没法拿去核对了。
 *
 * 不带查询串：筛选条件、抽屉里打开的是哪一单，都不是「页面」，
 * 也不该把单据号送进 GA（见文件头第 3 条）。
 */
export function trackPage(path: string, title: string) {
  if (!ready) return;
  const full = (import.meta.env.BASE_URL || "/").replace(/\/$/, "") + path;
  window.gtag?.("event", "page_view", {
    page_path: full,
    page_title: title,
    page_location: location.origin + full,
    site: SITE,
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
  window.gtag?.("event", event, { site: SITE, ...params });
}
