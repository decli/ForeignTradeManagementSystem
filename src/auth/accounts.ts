/**
 * 本地账号：账密校验、注册、改口令。
 *
 * 数据落在浏览器的 IndexedDB 里，跟账套同一份存储。换台电脑就是一套新的账号，
 * 这是纯静态站的必然结果，登录页会把这件事直说，不做「像是云端」的假象。
 */

import { mutate, pushAudit, snapshot } from "@/data/db";
import type { Role, Scope, User } from "@/data/types";
import { hashPassword, passwordIssue, verifyPassword } from "./password";

export type SignInResult = { ok: true; user: User } | { ok: false; error: string };

const norm = (s: string) => s.trim().toLowerCase();

export async function signInWithPassword(username: string, password: string): Promise<SignInResult> {
  const db = snapshot();
  const name = norm(username);
  if (!name || !password) return { ok: false, error: "账号和口令都要填" };

  const cred = db.credentials.find((c) => c.username.toLowerCase() === name);
  // 账号不存在时也走一次校验，避免用响应快慢反推出「哪些账号存在」
  const stored = cred?.hash ?? "pbkdf2$120000$00$00";
  const good = await verifyPassword(password, stored);
  if (!cred || !good) return { ok: false, error: "账号或口令不对" };

  const user = db.users.find((u) => u.id === cred.userId);
  if (!user || !user.active) return { ok: false, error: "这个账号已停用" };

  mutate((draft) => {
    draft.credentials = draft.credentials.map((c) =>
      c.username === cred.username ? { ...c, lastLoginAt: new Date().toISOString() } : c,
    );
  });

  return { ok: true, user };
}

export type RegisterInput = { username: string; password: string; name: string; role: Role; scope: Scope; team: string | null };

export async function registerAccount(input: RegisterInput): Promise<SignInResult> {
  const db = snapshot();
  const username = norm(input.username);
  if (!/^[a-z0-9_.-]{3,24}$/.test(username)) return { ok: false, error: "账号用 3–24 位英文、数字、_ . -" };
  if (!input.name.trim()) return { ok: false, error: "填一个显示用的名字" };
  const pwIssue = passwordIssue(input.password);
  if (pwIssue) return { ok: false, error: pwIssue };
  if (db.credentials.some((c) => c.username.toLowerCase() === username)) return { ok: false, error: "这个账号已经有人用了" };

  const hash = await hashPassword(input.password);
  const at = new Date().toISOString();
  const user: User = {
    id: `usr_${Math.random().toString(36).slice(2, 10)}`,
    username,
    name: input.name.trim(),
    role: input.role,
    team: input.team,
    scope: input.scope,
    active: true,
    hue: Math.floor(Math.random() * 11),
    createdAt: at,
  };

  mutate((draft) => {
    draft.users = [...draft.users, user];
    draft.credentials = [...draft.credentials, { username, userId: user.id, hash, demo: false, createdAt: at, lastLoginAt: at }];
    pushAudit(draft, {
      actorId: user.id, actorName: user.name, entity: "User", entityId: user.id, entityLabel: user.name,
      action: "注册账号", before: null, after: JSON.stringify({ username, role: user.role, scope: user.scope }),
    });
  });

  return { ok: true, user };
}

export async function changePassword(userId: string, oldPw: string, newPw: string): Promise<{ ok: boolean; error?: string }> {
  const db = snapshot();
  const cred = db.credentials.find((c) => c.userId === userId);
  if (!cred) return { ok: false, error: "这个身份没有本地账号，先注册一个" };
  if (!(await verifyPassword(oldPw, cred.hash))) return { ok: false, error: "原口令不对" };
  const issue = passwordIssue(newPw);
  if (issue) return { ok: false, error: issue };

  const hash = await hashPassword(newPw);
  mutate((draft) => {
    draft.credentials = draft.credentials.map((c) => (c.userId === userId ? { ...c, hash, demo: false } : c));
    const u = draft.users.find((x) => x.id === userId);
    pushAudit(draft, {
      actorId: userId, actorName: u?.name ?? "—", entity: "User", entityId: userId, entityLabel: u?.name ?? "—",
      action: "修改口令", before: null, after: null,
    });
  });
  return { ok: true };
}

/** 登录页展示的演示账号 —— 只列有代表性的几个角色，全列反而挑不动 */
export const DEMO_ACCOUNTS = [
  { username: "admin", note: "管理员 · 看全部数据" },
  { username: "ada", note: "业务员 · 只看本人数据" },
  { username: "summer", note: "业务员 · 看本组数据" },
  { username: "finance", note: "财务 · 看全部数据" },
  { username: "viewer", note: "只读 · 不能改任何东西" },
] as const;
