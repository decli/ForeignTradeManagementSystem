import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useDb } from "@/data/DataProvider";
import { viewerOf, type Viewer } from "@/data/queries";
import type { Role, Scope, User } from "@/data/types";
import { googleSignOut, type GoogleProfile } from "./google";
import { personName, useT } from "@/i18n";

const KEY = "mt.session";

export type Session = {
  /** password = 账密登录；google = Google 账号；demo = 一键体验挑的身份 */
  kind: "demo" | "google" | "password";
  /** 对应账套里的 User.id。Google 用户会绑到一个演示身份上，好让角色 / 数据范围有意义 */
  userId: string;
  email?: string;
  picture?: string;
  /** Google 用户显示自己的名字，而不是被绑定的那个演示身份的名字 */
  displayName?: string;
  at: string;
};

type AuthValue = {
  session: Session | null;
  user: User | null;
  viewer: Viewer;
  /** 顶栏和审计留痕用的显示名 */
  displayName: string;
  picture: string | null;
  signInDemo: (userId: string) => void;
  signInPassword: (userId: string) => void;
  signInGoogle: (profile: GoogleProfile, boundUserId: string) => void;
  signOut: () => void;
  /** 切换「以谁的身份查看」—— 管理员用来验证数据范围 */
  impersonate: (userId: string) => void;
  can: (perm: Perm) => boolean;
};

/** 权限点。角色决定能不能做，数据范围决定看得到哪些行（在 queries 里处理）。 */
export type Perm = "write" | "finance" | "admin";

const ROLE_PERMS: Record<Role, Perm[]> = {
  admin: ["write", "finance", "admin"],
  finance: ["write", "finance"],
  merchandiser: ["write"],
  sales: ["write"],
  purchaser: ["write"],
  viewer: [],
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "管理员",
  sales: "业务员",
  merchandiser: "跟单",
  purchaser: "采购",
  finance: "财务",
  viewer: "只读",
};

export const SCOPE_LABEL: Record<Scope, string> = { self: "本人数据", team: "本组数据", all: "全部数据" };

const Ctx = createContext<AuthValue | null>(null);

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const db = useDb();
  const { lang } = useT();
  const [session, setSession] = useState<Session | null>(readSession);

  useEffect(() => {
    try {
      if (session) localStorage.setItem(KEY, JSON.stringify(session));
      else localStorage.removeItem(KEY);
    } catch {
      /* 隐私模式下写不进去也不影响这次会话 */
    }
  }, [session]);

  const user = useMemo(() => db.users.find((u) => u.id === session?.userId) ?? null, [db.users, session]);

  const signInDemo = useCallback((userId: string) => {
    setSession({ kind: "demo", userId, at: new Date().toISOString() });
  }, []);

  const signInPassword = useCallback((userId: string) => {
    setSession({ kind: "password", userId, at: new Date().toISOString() });
  }, []);

  const signInGoogle = useCallback((profile: GoogleProfile, boundUserId: string) => {
    setSession({
      kind: "google",
      userId: boundUserId,
      email: profile.email,
      picture: profile.picture,
      displayName: profile.name,
      at: new Date().toISOString(),
    });
  }, []);

  const signOut = useCallback(() => {
    googleSignOut();
    setSession(null);
  }, []);

  const impersonate = useCallback((userId: string) => {
    setSession((s) => (s ? { ...s, userId } : { kind: "demo", userId, at: new Date().toISOString() }));
  }, []);

  const value = useMemo<AuthValue>(() => {
    const viewer = viewerOf(user);
    const perms = user ? ROLE_PERMS[user.role] : [];
    return {
      session,
      user,
      viewer,
      displayName: session?.displayName ?? personName(user, lang),
      picture: session?.picture ?? null,
      signInDemo,
      signInPassword,
      signInGoogle,
      signOut,
      impersonate,
      can: (p) => perms.includes(p),
    };
  }, [session, user, lang, signInDemo, signInPassword, signInGoogle, signOut, impersonate]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth 必须在 AuthProvider 内使用");
  return v;
}
