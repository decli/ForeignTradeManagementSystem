/**
 * Google 登录（Google Identity Services）。
 *
 * 纯静态站没有后端，拿不到「服务端验签」这一步 —— 所以这里解出来的身份
 * 只用于**认人**（头像、名字、邮箱），不用于**授权**。真正的数据都在用户
 * 自己的浏览器里，越权也越不到别人的数据。要接真后端时，把 credential
 * 原样 POST 给服务端验签即可，这个模块不用改。
 *
 * 没有配 VITE_GOOGLE_CLIENT_ID 时整个模块会安静地不可用，
 * 页面自动退回演示账号登录 —— 这样 fork 下来的人不配任何东西也能跑起来。
 */

export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "").trim();
export const googleConfigured = () => GOOGLE_CLIENT_ID.length > 0;

const SRC = "https://accounts.google.com/gsi/client";
let loading: Promise<void> | null = null;

type GsiButtonOptions = { theme?: string; size?: string; width?: number; text?: string; shape?: string; logo_alignment?: string; locale?: string };
type Gsi = {
  accounts: {
    id: {
      initialize(cfg: { client_id: string; callback: (r: { credential: string }) => void; auto_select?: boolean; cancel_on_tap_outside?: boolean; use_fedcm_for_prompt?: boolean }): void;
      renderButton(el: HTMLElement, opts: GsiButtonOptions): void;
      disableAutoSelect(): void;
    };
  };
};

function gsi(): Gsi | null {
  return (window as unknown as { google?: Gsi }).google ?? null;
}

export function loadGoogleScript(): Promise<void> {
  if (!googleConfigured()) return Promise.reject(new Error("未配置 Google Client ID"));
  if (gsi()) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = SRC;
    el.async = true;
    el.defer = true;
    el.onload = () => resolve();
    el.onerror = () => {
      loading = null;
      reject(new Error("Google 登录脚本加载失败，检查网络或改用演示账号"));
    };
    document.head.appendChild(el);
  });
  return loading;
}

export type GoogleProfile = { sub: string; email: string; name: string; picture: string };

/** 解 JWT 的 payload。只取展示字段 —— 前面说过，这不是验签。 */
export function decodeCredential(credential: string): GoogleProfile | null {
  try {
    const payload = credential.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const data = JSON.parse(decodeURIComponent(escape(json))) as Record<string, string>;
    if (!data.sub) return null;
    return {
      sub: data.sub,
      email: data.email ?? "",
      name: data.name || data.email?.split("@")[0] || "Google 用户",
      picture: data.picture ?? "",
    };
  } catch {
    return null;
  }
}

/** 在指定容器里渲染官方登录按钮。返回一个取消订阅函数。 */
export async function renderGoogleButton(el: HTMLElement, onCredential: (p: GoogleProfile) => void, dark: boolean) {
  await loadGoogleScript();
  const g = gsi();
  if (!g) throw new Error("Google 登录不可用");
  g.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: (res) => {
      const profile = decodeCredential(res.credential);
      if (profile) onCredential(profile);
    },
    auto_select: false,
    cancel_on_tap_outside: true,
    use_fedcm_for_prompt: true,
  });
  el.innerHTML = "";
  g.accounts.id.renderButton(el, {
    theme: dark ? "filled_black" : "outline",
    size: "large",
    width: Math.min(360, el.clientWidth || 320),
    text: "signin_with",
    shape: "rectangular",
    logo_alignment: "center",
    locale: "zh_CN",
  });
}

export function googleSignOut() {
  try {
    gsi()?.accounts.id.disableAutoSelect();
  } catch {
    /* 没加载过脚本就没什么好清的 */
  }
}
