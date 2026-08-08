import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";
export type Density = "compact" | "default" | "cozy";
export type Accent = "harbor" | "cerulean" | "teal" | "dusk" | "graphite";

const THEME_KEY = "mt.theme";
const DENSITY_KEY = "mt.density";
const ACCENT_KEY = "mt.accent";

/**
 * 可选主色。色值在 tokens.css 的调色板层，这里只负责「有哪几套、叫什么」。
 *
 * 每套给两个色：浅色主题下的主色和深色主题下的主色。色板圆点画成两者的斜切，
 * 一来色板本身就说明了「这套色明暗两边各长什么样」，二来不管弹层此刻是白底
 * 还是黑底，总有一半是立得住的 —— 只画一个色的话，墨石在白底上、松石绿在黑底上
 * 都会糊掉。
 */
export const ACCENTS: { value: Accent; label: string; desc: string; sw: string; swDark: string }[] = [
  { value: "harbor", label: "航线蓝", desc: "默认", sw: "#3b5bd6", swDark: "#7f9bff" },
  { value: "cerulean", label: "远洋蓝", desc: "更冷一档", sw: "#0170a6", swDark: "#2eacf5" },
  { value: "teal", label: "松石绿", desc: "沉一点", sw: "#017976", swDark: "#30b8b4" },
  { value: "dusk", label: "暮山紫", desc: "重一点", sw: "#8149b2", swDark: "#b68ce1" },
  { value: "graphite", label: "墨石", desc: "只留状态色", sw: "#61697a", swDark: "#9ba2b1" },
];

function apply(theme: Theme) {
  const el = document.documentElement;
  if (theme === "system") delete el.dataset.theme;
  else el.dataset.theme = theme;
}

function applyDensity(d: Density) {
  const el = document.documentElement;
  if (d === "default") delete el.dataset.density;
  else el.dataset.density = d;
}

const read = <T,>(key: string, fallback: T) => {
  try {
    return (localStorage.getItem(key) as T | null) ?? fallback;
  } catch {
    return fallback;
  }
};

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => read<Theme>(THEME_KEY, "system"));

  useEffect(() => {
    apply(theme);
    try {
      if (theme === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* 隐私模式 */
    }
  }, [theme]);

  /** 当前实际生效的是深还是浅 —— Google 登录按钮要按这个选主题 */
  const resolved: "light" | "dark" =
    theme === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : theme;

  return { theme, setTheme, resolved };
}

export function useAccent() {
  const [accent, setAccent] = useState<Accent>(() => read<Accent>(ACCENT_KEY, "harbor"));
  useEffect(() => {
    const el = document.documentElement;
    // 默认那套本来就是 :root 上的值，不写属性，省得 DOM 上多一个没用的标记
    if (accent === "harbor") delete el.dataset.accent;
    else el.dataset.accent = accent;
    try {
      if (accent === "harbor") localStorage.removeItem(ACCENT_KEY);
      else localStorage.setItem(ACCENT_KEY, accent);
    } catch {
      /* 隐私模式 */
    }
  }, [accent]);
  return [accent, setAccent] as const;
}

export function useDensity() {
  const [density, setDensity] = useState<Density>(() => read<Density>(DENSITY_KEY, "default"));
  useEffect(() => {
    applyDensity(density);
    try {
      if (density === "default") localStorage.removeItem(DENSITY_KEY);
      else localStorage.setItem(DENSITY_KEY, density);
    } catch {
      /* 隐私模式 */
    }
  }, [density]);
  return [density, setDensity] as const;
}

/** 顶栏那个按钮：浅 → 深 → 跟随系统，转一圈 */
export function useThemeCycle() {
  const { theme, setTheme, resolved } = useTheme();
  const cycle = useCallback(() => {
    setTheme(theme === "light" ? "dark" : theme === "dark" ? "system" : "light");
  }, [theme, setTheme]);
  return { theme, resolved, cycle, setTheme };
}
