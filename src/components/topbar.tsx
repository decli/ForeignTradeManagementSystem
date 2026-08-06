"use client";

import { useEffect, useState } from "react";

/** 客户所在地时区。绿灯 = 对方在上班时间，发邮件 / 打电话前扫一眼。 */
const CLOCKS = [
  { label: "厦门", tz: "Asia/Shanghai", home: true },
  { label: "利马", tz: "America/Lima" },
  { label: "纽约", tz: "America/New_York" },
  { label: "布宜诺斯艾利斯", tz: "America/Argentina/Buenos_Aires" },
  { label: "伦敦", tz: "Europe/London" },
  { label: "迪拜", tz: "Asia/Dubai" },
];

function readClocks(now: Date) {
  return CLOCKS.map((c) => {
    let time = "--:--";
    let hour = 0;
    try {
      time = new Intl.DateTimeFormat("zh-CN", {
        timeZone: c.tz, hour: "2-digit", minute: "2-digit", hour12: false,
      }).format(now);
      hour = Number(
        new Intl.DateTimeFormat("en-US", { timeZone: c.tz, hour: "2-digit", hour12: false }).format(now),
      );
    } catch {
      /* 环境缺时区数据时退回占位 */
    }
    return { ...c, time, open: hour >= 9 && hour < 18 };
  });
}

export function Topbar({ fx }: { fx: { market: number; custom: number; asOf: string } }) {
  // 服务端和客户端的「现在」必然不同，先渲染占位，挂载后再填真实时间，避免 hydration 不一致
  const [clocks, setClocks] = useState(() => CLOCKS.map((c) => ({ ...c, time: "--:--", open: false })));
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    const tick = () => setClocks(readClocks(new Date()));
    tick();
    const id = setInterval(tick, 20_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("tf-theme");
    if (saved === "light" || saved === "dark") {
      document.documentElement.dataset.theme = saved;
      setTheme(saved);
    }
  }, []);

  const toggleTheme = () => {
    const current =
      theme ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("tf-theme", next);
    setTheme(next);
  };

  return (
    <header className="topbar">
      <div className="fx" title="市场汇率与自定汇率">
        <span className="live" aria-hidden="true" />
        <span className="k">市场</span>
        <span className="v num">{fx.market.toFixed(4)}</span>
        <span className="sep" aria-hidden="true" />
        <span className="k">自定</span>
        <span className="v num">{fx.custom.toFixed(4)}</span>
        <span className="k num" style={{ opacity: 0.7 }}>{fx.asOf}</span>
      </div>

      <div className="clocks" aria-label="客户所在地时间">
        {clocks.map((c) => (
          <span
            key={c.label}
            className="clock"
            data-open={c.open ? "1" : "0"}
            data-home={c.home ? "1" : "0"}
            title={`${c.label}｜${c.open ? "对方在上班时间" : "对方非工作时间"}`}
          >
            <span className="bulb" aria-hidden="true" />
            {c.label} <span className="t num">{c.time}</span>
          </span>
        ))}
      </div>

      <div className="topbar-right">
        <button className="icon-btn" onClick={toggleTheme} title="切换浅色 / 深色" aria-label="切换浅色 / 深色">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
        </button>
      </div>
    </header>
  );
}
