/**
 * 演示账套 / 真实账套。
 *
 * ── 为什么是「切换」而不是「清空演示数据」──
 * 买家打开系统看到的是 63 张假 PI。要让他开始录自己的单，最直觉的做法是
 * 给一个「清空演示数据」按钮 —— 但那是个**不可逆的破坏性动作**，
 * 而且人是要回来看演示的：忘了报价核算器怎么用、想给同事演示一遍，
 * 都得有个完整的样例账套在。
 *
 * 所以两套数据各存各的键，随时来回切，谁也不覆盖谁。
 * 破坏性操作就这样变成了零风险动作。
 *
 * ── 键名为什么不对称 ──
 * 演示账套沿用老键 `db`。所有现存用户的数据都在这个键上，
 * 而他们至今为止用的就是演示账套 —— 不搬家就不会搬丢。
 * 真实账套用新键 `db:live`，第一次进去是空的。
 *
 * ── 为什么切换要整页重载 ──
 * 账套一换，内存里的 `current`、订阅者、跨标签页广播、各页面 useMemo
 * 缓存的派生数据全都得跟着换。手工拆一遍这些状态，漏一个就是
 * "看着是新账套、数据却是老的"这种最难查的错。
 * 重载一次几百毫秒，换来的是绝不串账 —— 这个交换很划算。
 */

export type ProfileId = "demo" | "live";

const LS_KEY = "mt.profile";

/** 演示账套沿用老键，一个字节都不用搬 */
export const dbKeyFor = (p: ProfileId) => (p === "demo" ? "db" : "db:live");

export function activeProfile(): ProfileId {
  try {
    return localStorage.getItem(LS_KEY) === "live" ? "live" : "demo";
  } catch {
    return "demo";
  }
}

export const isDemo = () => activeProfile() === "demo";

/** 只写标记，重载由调用方发起 —— 它得先把当前账套落盘 */
export function setActiveProfile(p: ProfileId) {
  try {
    localStorage.setItem(LS_KEY, p);
  } catch {
    /* 隐私模式下存不下，这次切换只在本次会话有效 */
  }
}
