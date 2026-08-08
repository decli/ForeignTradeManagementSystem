/**
 * 汇率牌价。
 *
 * ── 数据从哪来 ──
 * 这一版是纯前端，没有服务端也不联网（整个产品的承诺就是「不上传任何内容」），
 * 所以牌价是**算出来的，不是抓来的**：以账套里那条市场汇率（USD→CNY）为锚，
 * 按一张固定的美元交叉汇率表推出其余币种，再叠一层小幅游走让它会动。
 *
 * 为什么要让它动：用户可以配「多久刷一次」。如果刷新之后数字纹丝不动，
 * 这个设置项就是假的 —— 与其做一个骗人的开关，不如把游走做出来并标明是演示行情。
 *
 * ── 接真行情从哪改 ──
 * 只有 `quote()` 一个出口。接后端时把它换成一次请求即可，
 * 上层（芯片、面板、刷新节奏、涨跌箭头）一行都不用动：
 *
 *   export async function quote(codes, usdCny) {
 *     const r = await fetch(`/api/fx?codes=${codes.join(",")}`);
 *     return (await r.json()) as Record<string, { cny: number; prev: number }>;
 *   }
 */

export type Currency = {
  code: string;
  zh: string;
  en: string;
  /**
   * **一个报价单位**（见 per）值多少美元。人民币牌价 = 它 × USD→CNY。
   * 注意是报价单位不是 1 单位：越南盾这里写的 0.3937 是 10000 盾的美元价。
   * 早先按「1 单位」理解，公式里又乘了一次 per，越南盾报成了 26533 —— 差 10000 倍。
   */
  usd: number;
  /**
   * 报价单位。日元、韩元这类小面值币种按 100（越南盾、印尼盾按 10000）报，
   * 跟银行牌价一个口径 —— 「1 越南盾 = 0.00027 元」在屏幕上没法读。
   */
  per?: number;
};

/**
 * 币种表。挑的是这家公司真会碰到的：结算用的美元欧元，
 * 加上客户所在国的货币（越南、南非、墨西哥、波兰、秘鲁、阿根廷、韩国、智利…）。
 * 交叉汇率是 2026 年中的量级，用来演示，不是实时行情。
 */
export const CURRENCIES: Currency[] = [
  { code: "USD", zh: "美元", en: "US dollar", usd: 1 },
  { code: "EUR", zh: "欧元", en: "Euro", usd: 1.086 },
  { code: "GBP", zh: "英镑", en: "Pound sterling", usd: 1.272 },
  { code: "JPY", zh: "日元", en: "Japanese yen", usd: 0.6562, per: 100 },
  { code: "HKD", zh: "港币", en: "Hong Kong dollar", usd: 0.1281 },
  { code: "KRW", zh: "韩元", en: "Korean won", usd: 0.0734, per: 100 },
  { code: "AUD", zh: "澳元", en: "Australian dollar", usd: 0.662 },
  { code: "CAD", zh: "加元", en: "Canadian dollar", usd: 0.731 },
  { code: "SGD", zh: "新加坡元", en: "Singapore dollar", usd: 0.746 },
  { code: "CHF", zh: "瑞士法郎", en: "Swiss franc", usd: 1.126 },
  { code: "AED", zh: "阿联酋迪拉姆", en: "UAE dirham", usd: 0.2723 },
  { code: "SAR", zh: "沙特里亚尔", en: "Saudi riyal", usd: 0.2666 },
  { code: "INR", zh: "印度卢比", en: "Indian rupee", usd: 1.199, per: 100 },
  { code: "VND", zh: "越南盾", en: "Vietnamese dong", usd: 0.3937, per: 10_000 },
  { code: "THB", zh: "泰铢", en: "Thai baht", usd: 0.0277 },
  { code: "MYR", zh: "马来西亚林吉特", en: "Malaysian ringgit", usd: 0.213 },
  { code: "PHP", zh: "菲律宾比索", en: "Philippine peso", usd: 1.75, per: 100 },
  { code: "IDR", zh: "印尼盾", en: "Indonesian rupiah", usd: 0.625, per: 10_000 },
  { code: "ZAR", zh: "南非兰特", en: "South African rand", usd: 0.0537 },
  { code: "MXN", zh: "墨西哥比索", en: "Mexican peso", usd: 0.0555 },
  { code: "BRL", zh: "巴西雷亚尔", en: "Brazilian real", usd: 0.184 },
  { code: "PEN", zh: "秘鲁索尔", en: "Peruvian sol", usd: 0.268 },
  { code: "CLP", zh: "智利比索", en: "Chilean peso", usd: 0.105, per: 100 },
  { code: "ARS", zh: "阿根廷比索", en: "Argentine peso", usd: 0.101, per: 100 },
  { code: "PLN", zh: "波兰兹罗提", en: "Polish zloty", usd: 0.251 },
  { code: "TRY", zh: "土耳其里拉", en: "Turkish lira", usd: 3.077, per: 100 },
  { code: "RUB", zh: "俄罗斯卢布", en: "Russian ruble", usd: 1.087, per: 100 },
  { code: "SEK", zh: "瑞典克朗", en: "Swedish krona", usd: 0.0935 },
  { code: "NOK", zh: "挪威克朗", en: "Norwegian krone", usd: 0.0925 },
  { code: "DKK", zh: "丹麦克朗", en: "Danish krone", usd: 0.1456 },
  { code: "NZD", zh: "新西兰元", en: "New Zealand dollar", usd: 0.601 },
];

export const findCurrency = (code: string) => CURRENCIES.find((c) => c.code === code);

/** 默认盯的就是账上真在用的两种结算货币 —— PI 只开 USD / EUR / CNY */
export const DEFAULT_WATCH = ["USD", "EUR"];

/** 刷新节奏。0 = 只手动刷 */
export const FX_INTERVALS = [
  { value: 30, label: "30 秒" },
  { value: 60, label: "1 分钟" },
  { value: 300, label: "5 分钟" },
  { value: 900, label: "15 分钟" },
  { value: 0, label: "手动" },
];

/**
 * 小幅游走。两条不同周期的正弦叠加，是为了两件事：
 *  · **确定性** —— 同一个 tick 反复渲染结果一样，不会因为父组件重渲染就跳一下；
 *  · **连续** —— 相邻 tick 的差是小的。纯随机数每次刷新都在 ±0.35% 之间弹，
 *    看着像行情崩了；正弦叠加走出来的线才像一条盘中曲线。
 * 幅度压在 ±0.33% 以内，一天之内的正常波动就是这个量级。
 */
function drift(code: string, tick: number) {
  let seed = 0;
  for (let i = 0; i < code.length; i++) seed = (seed * 31 + code.charCodeAt(i)) % 997;
  const p = seed / 997;
  return 0.0022 * Math.sin(tick / 6.7 + p * 6.283) + 0.0011 * Math.sin(tick / 2.3 + p * 12.566);
}

export type Quote = { code: string; cny: number; prev: number; per: number };

/**
 * 取一批币种的人民币牌价。`tick` 是刷新计数，第 N 次刷新给第 N 组数。
 * 同时给出上一 tick 的值，涨跌箭头用它算，不用在组件里存历史。
 */
export function quote(codes: string[], usdCny: number, tick: number): Quote[] {
  return codes.flatMap((code) => {
    const c = findCurrency(code);
    if (!c) return [];
    const base = c.usd * usdCny;
    return [{ code, per: c.per ?? 1, cny: base * (1 + drift(code, tick)), prev: base * (1 + drift(code, tick - 1)) }];
  });
}

/** 牌价的小数位：数越小越要多给几位，不然 0.04 和 0.05 之间什么都看不出来 */
export function fxDigits(v: number) {
  return v >= 100 ? 2 : v >= 1 ? 4 : 6;
}
