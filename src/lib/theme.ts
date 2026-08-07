import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";
export type Density = "compact" | "default" | "cozy";

const THEME_KEY = "mt.theme";
const DENSITY_KEY = "mt.density";

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
