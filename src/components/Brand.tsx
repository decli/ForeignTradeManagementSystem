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

export const BRAND = {
  zh: "信风",
  en: "Tradewind",
  wordmark: "TRADEWIND",
  taglineZh: "每一票货，都看得见",
  taglineEn: "Every shipment, in plain sight.",

  /* 大标题手动断行。
     交给浏览器断，「每一票货，都看得见」会在 44px 字号下折成
     「每一票货，都看 / 得见」—— 断在词中间，一眼就看得出没人排过版。
     口号只有一句，值得手动指定断点。第二行是重音，样式上也更亮。 */
  taglineZhLines: ["每一票货，", "都看得见"],
  taglineEnLines: ["Every shipment,", "in plain sight."],

  /* 名字的来历，一句话。不是营销文案，是词源 ——
     看完知道这产品为什么叫信风，比任何一句「赋能」都管用。 */
  loreZh: "大航海时代，整条欧亚航线都靠这股常年不改向的风。",
  /* 破折号是 .login-lore b::after 排出来的，所以正文里不能再有第二个 ——
     「Tradewind — The one wind … — and carried …」一行两个破折号，念不下去 */
  loreEn: "The one wind that never changed its mind, and it carried every ship of the Age of Sail.",
} as const;

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
