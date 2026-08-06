/**
 * 金额一律以「分」为单位的整数在库里流转，只有这里才把它变成人看的字符串。
 * 汇率以 E6（× 1_000_000）存整数。
 */

/** BigInt 分 → 数字元。用于跨 server/client 边界（BigInt 不能被序列化）。 */
export const centsToYuan = (cents: bigint | number) => Number(cents) / 100;

export const formatMoney = (yuan: number, symbol = "$") =>
  symbol +
  yuan.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 大额人民币在汇总表里不带小数更好扫读 */
export const formatCny = (yuan: number, decimals = 0) =>
  "¥" +
  yuan.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

export const formatInt = (n: number) => n.toLocaleString("en-US");

/** 基点 → 百分比字符串。2104 → "21.04%" */
export const formatBp = (bp: number) => (bp / 100).toFixed(2) + "%";

export const rateFromE6 = (e6: number) => e6 / 1_000_000;

/** 里程碑用的紧凑日期：2026-08-21 → 8.21 */
export function shortDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const x = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(x.getTime())) return "—";
  return `${x.getUTCMonth() + 1}.${x.getUTCDate()}`;
}

/** 表格用的完整日期：2026-08-21 */
export function isoDate(d: Date | string | null | undefined) {
  if (!d) return "";
  const x = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(x.getTime())) return "";
  return x.toISOString().slice(0, 10);
}

/** 「今天 / 昨天 / 08-04」这种口语化时间 */
export function humanDate(d: Date | string | null | undefined, today = new Date()) {
  if (!d) return "";
  const x = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(x.getTime())) return "";
  const days = Math.round(
    (Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) -
      Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate())) /
      86_400_000,
  );
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  return isoDate(x).slice(5);
}
