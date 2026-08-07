/** 业务判定规则集中在这里，页面和查询都从这取，避免同一条线在两处写成不同的数。 */

/** 利润率低于这个数进预警队列 */
export const PROFIT_WARN_PCT = 11;
/** 超过这么多天没有新动态算停滞 */
export const STALL_DAYS = 7;
/** 中信保额度占用超过这个比例要提示 */
export const SINOSURE_WARN = 0.85;

export type Tone = "jade" | "amber" | "coral" | "accent" | "violet" | "mute";

export const RELEASE_TONE: Record<string, Tone> = {
  已放行: "jade",
  未放行: "amber",
  待报关: "accent",
};

export const CREDIT_TONE: Record<string, Tone> = { A: "jade", B: "accent", C: "amber" };

export const REVIEW_LABEL: Record<string, string> = {
  draft: "草稿",
  pending_review: "待复核",
  confirmed: "已确认",
};

/** 利润率语义色：亏损红、预警琥珀、正常按高低分蓝 / 绿 */
export function profitTone(pct: number): Tone {
  if (pct < 0) return "coral";
  if (pct < PROFIT_WARN_PCT) return "amber";
  if (pct < 18) return "accent";
  return "jade";
}

export function sinosureTone(used: number, limit: number): Tone {
  if (limit <= 0) return "mute";
  const r = used / limit;
  if (r > 1) return "coral";
  if (r > SINOSURE_WARN) return "amber";
  if (r > 0.6) return "accent";
  return "jade";
}

/** 跟单表里常按的几句话，一键填入省得每次手打 */
export const PHRASES = [
  "已订舱，等截关时间",
  "待客户付尾款",
  "已放单 / 电放完成",
  "已交单证，等正本",
  "已催工厂交期",
  "等货代回签",
] as const;

export const MODES = ["海运", "空运", "陆运", "快递"] as const;
export const RELEASE_STATES = ["已放行", "未放行", "待报关"] as const;
