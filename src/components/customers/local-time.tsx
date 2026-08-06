"use client";

import { useEffect, useState } from "react";

/**
 * 客户当地时间。服务端渲染不出「现在」，先给占位再在客户端补，
 * 避免 hydration 前后不一致。
 */
export function LocalTime({ timezone }: { timezone: string | null }) {
  const [time, setTime] = useState("--:--");

  useEffect(() => {
    if (!timezone) return;
    const tick = () => {
      try {
        setTime(
          new Intl.DateTimeFormat("zh-CN", {
            timeZone: timezone,
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }).format(new Date()),
        );
      } catch {
        setTime("—");
      }
    };
    tick();
    const id = setInterval(tick, 20_000);
    return () => clearInterval(id);
  }, [timezone]);

  if (!timezone) return <span className="num">—</span>;
  return <span className="num">{time}</span>;
}
