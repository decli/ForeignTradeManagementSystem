import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { EN } from "./en";

/**
 * 轻量 i18n。
 *
 * **用中文原文当 key**，而不是 `page.followups.title` 这种符号。理由：
 *  1. 漏翻的降级结果是显示中文 —— 跟现在一模一样，不会出现 `page.foo.title`
 *     这种事故字符串出现在生产页面上；
 *  2. 代码里读得懂 —— `t("停滞 / 超期")` 一眼知道在说什么，
 *     符号 key 要跳到词条表才看得出；
 *  3. 加一个中文页面时不需要先想 key 名，写完中文再补英文即可。
 *
 * 代价是中文文案改动会失配一次翻译。对一个中文优先的产品，这个交换划算。
 */

export type Lang = "zh" | "en";
const KEY = "tw.lang";

type Vars = Record<string, string | number>;

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggle: () => void;
  t: (zh: string, vars?: Vars) => string;
  /** 双语并列的场合：t2("跟单表", "Follow-ups") 会挑当前语言那个 */
  pick: <T>(zh: T, en: T) => T;
  locale: string;
};

const LangCtx = createContext<Ctx | null>(null);

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    /* 隐私模式 */
  }
  return navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

const interpolate = (s: string, vars?: Vars) =>
  vars ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : s;

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detect);

  // 组件外的 tr() 读模块级变量，这里保持同步
  primeLang(lang);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      /* 隐私模式 */
    }
  }, [lang]);

  const setLang = useCallback((l: Lang) => setLangState(l), []);

  const value = useMemo<Ctx>(() => {
    const t = (zh: string, vars?: Vars) => {
      if (lang === "zh") return interpolate(zh, vars);
      const en = EN[zh];
      // 漏翻就退回中文 —— 页面永远不会显示一个原始 key
      return interpolate(en ?? zh, vars);
    };
    return {
      lang,
      setLang,
      toggle: () => setLangState((l) => (l === "zh" ? "en" : "zh")),
      t,
      pick: <T,>(zh: T, en: T) => (lang === "zh" ? zh : en),
      locale: lang === "zh" ? "zh-CN" : "en-US",
    };
  }, [lang, setLang]);

  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export function useT() {
  const v = useContext(LangCtx);
  if (!v) throw new Error("useT 必须在 LangProvider 内使用");
  return v;
}

/** 组件外（比如 toast 工具函数）也要能翻译，这里留一个读当前语言的出口 */
let current: Lang = "zh";
export function primeLang(l: Lang) {
  current = l;
}
export function tr(zh: string, vars?: Vars) {
  if (current === "zh") return interpolate(zh, vars);
  return interpolate(EN[zh] ?? zh, vars);
}

/** 人名的显示：英文界面优先英文名，没有就退回中文 */
export const personName = (u: { name: string; nameEn?: string } | null | undefined, lang: Lang) =>
  !u ? "—" : lang === "en" ? (u.nameEn ?? u.name) : u.name;
