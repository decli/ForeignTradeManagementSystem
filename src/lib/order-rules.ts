/**
 * 订单相关的判定规则。放在 lib 而不是 server 下，是因为客户端组件也要用；
 * 从 server/* 里 import 值会把 Prisma 和 better-sqlite3 一起拖进浏览器包。
 */

/** 利润率低于这个百分比要财务复核 */
export const PROFIT_WARN_PCT = 11;

/** 利润率 → 语义色：负毛利红，低于阈值琥珀，正常绿 */
export function rateTone(rate: number) {
  if (rate < 0) return "coral";
  if (rate < PROFIT_WARN_PCT) return "amber";
  return "jade";
}
