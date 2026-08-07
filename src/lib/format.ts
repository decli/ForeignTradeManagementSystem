/**
 * 金额一律以「分」为单位的整数在库里流转，只有这里才把它变成人看的字符串。
 * 汇率以 E6（× 1_000_000）存整数。
 */

export const centsToYuan = (cents: number) => cents / 100;

export const formatMoney = (yuan: number, symbol = "$") =>
  symbol + yuan.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 大额人民币在汇总表里不带小数更好扫读 */
export const formatCny = (yuan: number, decimals = 0) =>
  "¥" + yuan.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export const formatInt = (n: number) => n.toLocaleString("en-US");

/** KPI 卡上用，1_284_500 → 1.28M；表格里不要用，财务要看清每一位 */
export function formatCompact(n: number, symbol = "$") {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${symbol}${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${symbol}${(n / 1000).toFixed(1)}K`;
  return symbol + Math.round(n).toLocaleString("en-US");
}

/** 基点 → 百分比字符串。2104 → "21.04%" */
export const formatBp = (bp: number) => (bp / 100).toFixed(2) + "%";
export const formatPct = (pct: number, digits = 2) => pct.toFixed(digits) + "%";

export const rateFromE6 = (e6: number) => e6 / 1_000_000;

const DAY = 86_400_000;
const utcOf = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

export function parseDate(d: string | Date | null | undefined): Date | null {
  if (!d) return null;
  const x = typeof d === "string" ? new Date(d.length === 10 ? `${d}T00:00:00.000Z` : d) : d;
  return Number.isNaN(x.getTime()) ? null : x;
}

/** 里程碑用的紧凑日期：2026-08-21 → 8.21 */
export function shortDate(d: string | Date | null | undefined) {
  const x = parseDate(d);
  if (!x) return "—";
  return `${x.getUTCMonth() + 1}.${x.getUTCDate()}`;
}

/** 表格用的完整日期：2026-08-21 */
export function isoDate(d: string | Date | null | undefined) {
  const x = parseDate(d);
  return x ? x.toISOString().slice(0, 10) : "";
}

/** 「今天 / 昨天 / 08-04」这种口语化时间 */
export function humanDate(d: string | Date | null | undefined, today = new Date()) {
  const x = parseDate(d);
  if (!x) return "";
  const days = Math.round((utcOf(today) - utcOf(x)) / DAY);
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  if (days === -1) return "明天";
  if (days > 1 && days < 7) return `${days} 天前`;
  return isoDate(x).slice(5);
}

/** 审计日志用：「3 分钟前 / 2 小时前 / 08-04 15:20」 */
export function relativeTime(iso: string, now = Date.now()) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const mins = Math.round((now - t) / 60_000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} 天前`;
  const dt = new Date(iso);
  const p = (v: number) => String(v).padStart(2, "0");
  return `${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

export function daysBetween(a: string | Date, b: string | Date) {
  const x = parseDate(a);
  const y = parseDate(b);
  if (!x || !y) return 0;
  return Math.floor((utcOf(x) - utcOf(y)) / DAY);
}

export const todayIso = () => {
  const n = new Date();
  const p = (v: number) => String(v).padStart(2, "0");
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
};

/** 客户所在地此刻几点，以及对方是不是在上班 */
export function localClock(timezone: string | null | undefined, now = new Date()) {
  if (!timezone) return null;
  try {
    const fmt = new Intl.DateTimeFormat("zh-CN", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      weekday: "short",
    });
    const parts = fmt.formatToParts(now);
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
    const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
    const weekend = weekday.includes("六") || weekday.includes("日");
    return {
      time: `${String(hour).padStart(2, "0")}:${minute}`,
      weekday,
      /** 当地 9:00–18:30 且非周末，才算「对方在上班」 */
      working: !weekend && hour >= 9 && hour < 19,
    };
  } catch {
    return null;
  }
}
