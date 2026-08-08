/**
 * 品牌。名字、标识、口号只在这里定义一次，其余地方引用。
 *
 * **信风 · Tradewind** —— 信风是「贸易风」的中文正名，大航海时代整个欧亚
 * 贸易靠它跑；「信」又是信用证的信。中英文指向同一个典故，不用解释。
 *
 * 标记是一张被风鼓满的帆：一根桅杆 + 一片弧形帆面 + 一条水平线。
 * 三笔画完，16px 下也认得出来。
 */

import { useT } from "@/i18n";

/**
 * ── 口号候选 ──
 *
 * 十句，十个切入角度。挑哪句不是文案偏好问题，是**先对谁说话**的问题：
 * 老板要的是结果（货出得去钱收得回），业务员要的是省事（不靠记性），
 * 财务要的是对得上（四条流），投资人要的是范围（从询盘到退税）。
 *
 * 断行是手写的。交给浏览器断，「每一票货，都看得见」在 44px 下会折成
 * 「每一票货，都看 / 得见」—— 断在词中间，一眼看得出没人排过版。
 * 第二行是重音（样式上更亮），所以落点要放在第二行。
 */
export const TAGLINES = [
  { zh: ["每一票货，", "都看得见"], en: ["Every shipment,", "in plain sight."], note: "可见性 · 现用" },
  { zh: ["货出得去，", "钱收得回"], en: ["Goods out.", "Money back."], note: "结果 · 老板" },
  { zh: ["货在哪，钱在哪，", "一屏之内"], en: ["Where the goods are,", "where the money is."], note: "双主线 · 老板" },
  { zh: ["一个 PI 号，", "串起一整趟外贸"], en: ["One PI number,", "the whole voyage."], note: "机制 · 业务" },
  { zh: ["从询盘到退税，", "一条线走完"], en: ["Inquiry to tax refund,", "one thread."], note: "范围 · 决策者" },
  { zh: ["让每一单，", "都有交代"], en: ["Every order,", "accounted for."], note: "责任 · 管理" },
  { zh: ["做外贸，", "不靠记性"], en: ["Run trade on records,", "not on memory."], note: "痛点 · 一线" },
  { zh: ["出海的每一步，", "都留得下航迹"], en: ["Every step overseas", "leaves a wake."], note: "品牌意象 · 留痕" },
  { zh: ["单、货、钱、票，", "四条流对得上"], en: ["Order, cargo, cash, invoice —", "all four reconcile."], note: "四流合一 · 财务" },
  { zh: ["把「我去问一下」，", "变成「我打开看看」"], en: ["Turn “let me go ask”", "into “let me go look.”"], note: "场景 · 最有画面感" },
] as const;

/**
 * ── 一句话定位候选 ──
 *
 * 原来这里是「外贸全流程管理」。它说的是**功能类目**，不是价值 ——
 * 读者读完只知道这是个什么品类的软件，不知道跟自己有什么关系。
 * 下面十句都在回答同一个问题：**我为什么要用它。**
 */
export const PITCHES = [
  { zh: "你的外贸全流程管理助手", en: "Your foreign-trade operations assistant" },
  { zh: "替你盯着每一票货、每一笔款、每一张退税单", en: "Watching every shipment, every payment, every refund claim" },
  { zh: "从询盘到退税，一条线管到底", en: "One thread from first inquiry to final tax refund" },
  { zh: "把散在 Excel 和微信里的外贸，收成一条线", en: "Pulls trade out of spreadsheets and chat threads, into one line" },
  { zh: "外贸公司的第二个跟单员 —— 只是它不下班", en: "A second merchandiser for your team, one that never clocks out" },
  { zh: "给老板一块仪表盘，给业务员一张待办清单", en: "A dashboard for the boss, a to-do list for the desk" },
  { zh: "一个 PI 号管到底：报价、采购、出运、收汇、退税", en: "One PI number carries it all: quote, purchase, ship, collect, refund" },
  { zh: "中小外贸团队的单、货、钱、票中枢", en: "Where orders, cargo, cash and invoices meet" },
  { zh: "让「这单到哪了」有个准信儿", en: "So “where is my order” always has an answer" },
  { zh: "询盘、报价、跟单、收汇、退税，一套做完", en: "Inquiries, quotes, follow-ups, collections, refunds — one system" },
] as const;

/* 选中哪一句。换一句就是改这两个数字 —— 文案是产品决策，不该散在页面里。 */
const TAGLINE = 1;
const PITCH = 1;

export const BRAND = {
  zh: "信风",
  en: "Tradewind",
  wordmark: "TRADEWIND",

  taglineZhLines: TAGLINES[TAGLINE].zh,
  taglineEnLines: TAGLINES[TAGLINE].en,
  taglineZh: TAGLINES[TAGLINE].zh.join(""),
  taglineEn: TAGLINES[TAGLINE].en.join(" "),

  pitchZh: PITCHES[PITCH].zh,
  pitchEn: PITCHES[PITCH].en,

  /* 名字的来历，一句话。不是营销文案，是词源 ——
     看完知道这产品为什么叫信风，比任何一句「赋能」都管用。 */
  loreZh: "大航海时代，整条欧亚航线都靠这股常年不改向的风。",
  /* 破折号是 .login-lore b::after 排出来的，所以正文里不能再有第二个 ——
     「Tradewind — The one wind … — and carried …」一行两个破折号，念不下去 */
  loreEn: "The one wind that never changed its mind, and it carried every ship of the Age of Sail.",

  /* 版权。作者与年份只在这里写一次，登录页页脚、设置页关于、
     index.html 的 meta 都引它 —— 三处各写一遍迟早会对不上。 */
  author: "decli",
  year: 2026,
} as const;

/** 「© 2026 decli」。年份和作者都在 BRAND 里，这里只负责排版 */
export const copyright = () => `© ${BRAND.year} ${BRAND.author}`;

export function Logomark({ size = 30, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={`${BRAND.zh} ${BRAND.en}`}
      style={{ borderRadius: size * 0.28, flex: "none" }}
    >
      <defs>
        {/* 跟着主题色走。写死过 #3B5BD6，换成松石绿主题后左上角还是一块蓝，
            整屏就这一处不对，比不换更显眼 */}
        <linearGradient id="tw-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--brand-1)" />
          <stop offset="1" stopColor="var(--brand-2)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#tw-g)" />
      {/* 帆面：从桅杆顶端被风吹鼓向右下 */}
      <path d="M16.4 6.6c5.4 3.2 8 7.6 8.4 13.4H16.4z" fill="#fff" fillOpacity="0.95" />
      {/* 前帆：小一号，做出层次，也就是「千帆」的意思 */}
      <path d="M14.2 10.4v9.6H8.2c1-4 3-7.2 6-9.6z" fill="#fff" fillOpacity="0.62" />
      {/* 水平线 */}
      <path d="M6 23.4h20" stroke="#fff" strokeOpacity="0.9" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * 名字本身是双语的，切语言时两行对调，而不是只换一行。
 *
 *   中文界面   **信风** / TRADEWIND
 *   英文界面   **Tradewind** / 信风
 *
 * 一开始只把主行换成 Tradewind，副行还是 TRADEWIND —— 同一个词写两遍。
 * 让副行始终摆「另一种写法」，两个方向都成立，也说明了这两个名字是一回事。
 */
export function brandLockup(lang: "zh" | "en") {
  return lang === "en" ? { name: BRAND.en, sub: BRAND.zh } : { name: BRAND.zh, sub: BRAND.wordmark };
}

/** 侧栏 / 登录页用的完整标识 */
export function Wordmark({ size = 30, subtitle = true }: { size?: number; subtitle?: boolean }) {
  const { lang } = useT();
  const mark = brandLockup(lang);
  return (
    <>
      <Logomark size={size} />
      <span className="rail-name" data-lang={lang}>
        <b>{mark.name}</b>
        {subtitle ? <span>{mark.sub}</span> : null}
      </span>
    </>
  );
}
