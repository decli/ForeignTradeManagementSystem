/**
 * 品牌。名字、标识、口号只在这里定义一次，其余地方引用。
 *
 * **信风 · Tradewind** —— 信风是「贸易风」的中文正名，大航海时代整个欧亚
 * 贸易靠它跑；「信」又是信用证的信。中英文指向同一个典故，不用解释。
 *
 * 标记是一张被风鼓满的帆：一根桅杆 + 一片弧形帆面 + 一条水平线。
 * 三笔画完，16px 下也认得出来。
 */

export const BRAND = {
  zh: "信风",
  en: "Tradewind",
  wordmark: "TRADEWIND",
  taglineZh: "每一票货，都看得见",
  taglineEn: "Every shipment, in plain sight.",
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
        <linearGradient id="tw-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3B5BD6" />
          <stop offset="1" stopColor="#7F9BFF" />
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

/** 侧栏 / 登录页用的完整标识 */
export function Wordmark({ size = 30, subtitle = true }: { size?: number; subtitle?: boolean }) {
  return (
    <>
      <Logomark size={size} />
      <span className="rail-name">
        <b>{BRAND.zh}</b>
        {subtitle ? <span>{BRAND.wordmark}</span> : null}
      </span>
    </>
  );
}
