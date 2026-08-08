/**
 * 字段级权限。
 *
 * ── 为什么行级权限不够 ──
 * 站内原有的 `scope`（self / team / all）解决的是"能看到**哪几行**"。
 * 但外贸公司最常提的一条要求是另一个维度：
 *
 *   "同一张订单，业务员看得见售价，看不见我从工厂拿的底价。"
 *
 * 这是行级权限做不到的 —— 那张单子他必须看得见，否则活没法干。
 * 要挡的是**同一行里的某几列**。
 *
 * ── 挡不住技术手段，但挡得住日常 ──
 * 数据在浏览器里，懂技术的人翻 IndexedDB 就能看到。这一点必须说清楚，
 * 不能让老板以为这是加密。它挡的是"同事凑过来看一眼屏幕"和
 * "业务员顺手导出一份成本表带走"这两件真实会发生的事 ——
 * 而这两件事恰恰是老板真正担心的。接了后端之后，同一个判断挪到服务端，
 * 敏感字段根本不下发，那时才是真的挡住。
 */

import type { Role, User } from "@/data/types";

/** 能看采购成本的角色。业务员和只读账号不在其中 */
const COST_ROLES: Role[] = ["admin", "finance", "purchaser", "merchandiser"];

export type Actorish = Pick<User, "role"> | null | undefined;

/**
 * 能不能看采购成本 / 毛利。
 *
 * 跟单员（merchandiser）能看 —— 他要跟工厂对账。
 * 业务员（sales）不能 —— 这正是这条规则存在的原因。
 */
export const canSeeCost = (u: Actorish) => !!u && COST_ROLES.includes(u.role);

/** 能不能改审批规则、用户、账套这类系统设置 */
export const canAdmin = (u: Actorish) => u?.role === "admin";

/** 能不能审批。规则里点名的人才行，这里只挡掉明显不该有入口的角色 */
export const canApprove = (u: Actorish) => !!u && (u.role === "admin" || u.role === "finance");

/** 只读账号：所有写操作的入口都不给 */
export const isReadOnly = (u: Actorish) => u?.role === "viewer";

/**
 * 成本被挡住时显示什么。
 *
 * 用 `••••` 而不是 `—`：破折号会被读成"这个单子没有成本"，
 * 而实际上是"有，但不给你看"。这两件事在核对账目时天差地别。
 */
export const MASK = "••••";

export const maskCost = <T,>(u: Actorish, value: T): T | string => (canSeeCost(u) ? value : MASK);
