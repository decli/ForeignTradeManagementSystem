/**
 * 客户相关判定规则。与 order-rules 同理放在 lib 下：
 * 服务端页面和客户端组件都要用，从 "use client" 模块里 import 函数会在服务端直接报错。
 */

/** 中信保额度占用越高越危险：超 85% 转红，是「再下单前先催回款」的信号 */
export function limitTone(pct: number) {
  if (pct > 85) return "coral";
  if (pct > 60) return "amber";
  return "jade";
}
