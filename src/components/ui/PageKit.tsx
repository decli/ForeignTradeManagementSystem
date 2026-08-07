/**
 * 列表页的公共骨架。
 *
 * 站内二十来个模块长得是一样的：页头 + 一排 KPI + 工具条 + 表格。
 * 与其每个页面各写一遍，不如把这层抽出来 —— 页面文件里就只剩下
 * 「这一页有哪些列、哪些筛选」，也就是它真正跟别人不一样的地方。
 */

import { useSearchParams } from "react-router-dom";
import { Icon, type IconName } from "@/components/Icon";
import type { Tone } from "@/lib/rules";

export function Page({
  title,
  desc,
  kpis,
  toolbar,
  children,
  actions,
}: {
  title: string;
  desc: string;
  kpis?: React.ReactNode;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          <p>{desc}</p>
        </div>
        {actions ? <div className="page-acts">{actions}</div> : null}
      </div>
      {kpis ? <div className="kpis">{kpis}</div> : null}
      {toolbar ? <div className="toolbar">{toolbar}</div> : null}
      {children}
    </div>
  );
}

export function Kpi({
  icon,
  k,
  v,
  s,
  tone,
}: {
  icon: IconName;
  k: string;
  v: string;
  s: string;
  tone?: Tone | string;
}) {
  return (
    <div className="kpi" data-tone={tone}>
      <span className="kpi-k">
        <Icon name={icon} />
        {k}
      </span>
      <span className="kpi-v">{v}</span>
      <span className="kpi-s">{s}</span>
    </div>
  );
}

/**
 * 筛选条件写进地址栏。
 * 这样「筛完发给同事」这件事不需要产品经理设计一个分享功能 —— 复制地址即可，
 * 刷新也不丢，浏览器后退还能退回上一组筛选。
 */
export function useParam() {
  const [params, setParams] = useSearchParams();
  const get = (k: string, d = "") => params.get(k) ?? d;
  const set = (patch: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null || v === "") next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true },
    );
  return { get, set };
}

/** 一块带标题的卡片，用于非表格版面（资金池、科目树、报表中心…） */
export function Panel({
  title,
  sub,
  actions,
  children,
  bodyClass = "",
}: {
  title: string;
  sub?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  bodyClass?: string;
}) {
  return (
    <section className="card">
      <header className="card-head">
        <h3>{title}</h3>
        {sub ? <span className="card-sub">{sub}</span> : null}
        <span className="spacer" />
        {actions}
      </header>
      <div className={`card-body ${bodyClass}`}>{children}</div>
    </section>
  );
}
