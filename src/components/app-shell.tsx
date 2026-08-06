"use client";

import { useEffect, useState, type ReactNode } from "react";
import { NavRail } from "./nav-rail";
import { Topbar } from "./topbar";
import { Toaster } from "./toast";

export function AppShell({
  children,
  fx,
  user,
}: {
  children: ReactNode;
  fx: { market: number; custom: number; asOf: string };
  user: { name: string; role: string; scope: string };
}) {
  const [collapsed, setCollapsed] = useState(false);

  // 水合完成的标记：给端到端测试一个「现在可以交互了」的信号
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  return (
    <div className="app" data-collapsed={collapsed ? "1" : "0"} data-hydrated={hydrated ? "1" : "0"}>
      <NavRail collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} user={user} />
      <div className="main">
        <Topbar fx={fx} />
        <div className="canvas">{children}</div>
      </div>
      <Toaster />
    </div>
  );
}
