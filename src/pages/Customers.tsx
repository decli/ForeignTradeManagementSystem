import { useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Ring } from "@/components/charts";
import { Bar, EmptyState, KV, Pill, SearchInput } from "@/components/ui/bits";
import { useAuth } from "@/auth/AuthProvider";
import { useDb } from "@/data/DataProvider";
import { listCustomers, listOrders } from "@/data/queries";
import { formatCompact, formatMoney, formatPct, localClock } from "@/lib/format";
import { useTick } from "@/lib/hooks";
import { CREDIT_TONE, PROFIT_WARN_PCT, SINOSURE_WARN, sinosureTone } from "@/lib/rules";

export default function Customers() {
  const db = useDb();
  const { viewer } = useAuth();
  const [params, setParams] = useSearchParams();
  useTick(60_000);

  const q = params.get("q") ?? "";
  const rows = useMemo(() => listCustomers(db, viewer, q), [db, viewer, q]);
  const activeId = params.get("id") ?? rows[0]?.id ?? null;
  const active = rows.find((r) => r.id === activeId) ?? rows[0] ?? null;

  // 搜索把当前选中的客户筛掉时，自动落到第一条，右侧不要留一片空白
  useEffect(() => {
    if (rows.length && activeId && !rows.some((r) => r.id === activeId)) {
      setParams((p) => {
        const next = new URLSearchParams(p);
        next.set("id", rows[0].id);
        return next;
      }, { replace: true });
    }
  }, [rows, activeId, setParams]);

  const orders = useMemo(() => (active ? listOrders(db, viewer, {}).filter((o) => o.customerName === active.name) : []), [db, viewer, active]);
  const clock = active ? localClock(active.timezone) : null;
  const overLimit = rows.filter((r) => r.limit > 0 && r.usedRatio > SINOSURE_WARN);

  const setQ = (v: string) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (v) next.set("q", v);
      else next.delete("q");
      return next;
    }, { replace: true });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>客户管理</h1>
          <p>
            客户主档、跟进记录与中信保额度占用 · 共 {rows.length} 家
            {overLimit.length ? ` · ${overLimit.length} 家额度占用超 ${Math.round(SINOSURE_WARN * 100)}%` : ""}
          </p>
        </div>
      </div>

      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="搜客户名 / 编号 / 国家 / 联系人…" />
        <span className="spacer" />
        <span className="muted" style={{ fontSize: "var(--fs-sm)" }}>按累计订单额排序</span>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState icon="users" title="没有匹配的客户" desc="换个关键词试试，或者清空搜索。" />
        </div>
      ) : (
        <div className="split">
          <div className="card">
            <div className="clist">
              {rows.map((c) => (
                <button
                  key={c.id}
                  className="citem"
                  aria-current={c.id === active?.id}
                  onClick={() =>
                    setParams((p) => {
                      const next = new URLSearchParams(p);
                      next.set("id", c.id);
                      return next;
                    }, { replace: true })
                  }
                >
                  <div className="citem-top">
                    <b className="truncate">{c.name}</b>
                    <Pill tone={CREDIT_TONE[c.creditLevel] ?? "mute"} dot={false}>
                      {c.creditLevel}
                    </Pill>
                    <span className="spacer" />
                    <span className="num" style={{ fontSize: "var(--fs-sm)" }}>{formatCompact(c.orderAmount)}</span>
                  </div>
                  <div className="cell-sub">
                    <span>
                      {c.country} · {c.salesName} · {c.orderCount} 单
                    </span>
                  </div>
                  <Bar value={c.used} max={c.limit} tone={sinosureTone(c.used, c.limit)} />
                </button>
              ))}
            </div>
          </div>

          {active ? (
            <div style={{ display: "grid", gap: 16 }}>
              <section className="card">
                <div className="card-head">
                  <h3>{active.name}</h3>
                  <Pill tone={CREDIT_TONE[active.creditLevel] ?? "mute"}>信用 {active.creditLevel}</Pill>
                  <span className="spacer" />
                  {clock ? (
                    <span className="clock" data-working={clock.working ? "1" : "0"} title={clock.working ? "对方在上班时间" : "对方多半不在"}>
                      <i />
                      当地 <b>{clock.time}</b> {clock.weekday}
                    </span>
                  ) : null}
                </div>
                <div className="card-body">
                  <div className="kv-grid">
                    <KV k="客户编号" v={active.code} mono />
                    <KV k="国家" v={active.country} />
                    <KV k="联系人" v={active.contact ?? "—"} />
                    <KV k="业务员" v={active.salesName} />
                    <KV k="累计订单" v={`${active.orderCount} 单 · ${formatMoney(active.orderAmount)}`} mono />
                    <KV k="最近签约" v={active.lastOrderOn ?? "—"} mono />
                  </div>
                  {active.note ? (
                    <div style={{ marginTop: 14, padding: 12, background: "var(--surface-2)", borderRadius: "var(--r-md)", fontSize: "var(--fs-md)", lineHeight: 1.6 }}>
                      <div className="row" style={{ marginBottom: 4, color: "var(--text-3)", fontSize: "var(--fs-sm)" }}>
                        <Icon name="info" size={13} />
                        跟进备注
                      </div>
                      {active.note}
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="card">
                <div className="card-head">
                  <h3>中信保额度</h3>
                  <span className="spacer" />
                  {active.usedRatio > SINOSURE_WARN ? <Pill tone="coral">接近上限，再下单前需先回款</Pill> : null}
                </div>
                <div className="card-body">
                  <div className="row" style={{ gap: 20, alignItems: "center", flexWrap: "wrap" }}>
                    <Ring value={active.used} max={active.limit} tone={sinosureTone(active.used, active.limit)} size={72} label="额度占用" />
                    <div style={{ flex: 1, minWidth: 200, display: "grid", gap: 8 }}>
                      <div className="row">
                        <span className="muted" style={{ fontSize: "var(--fs-sm)" }}>已用</span>
                        <span className="spacer" />
                        <b className="num">{formatMoney(active.used)}</b>
                      </div>
                      <Bar value={active.used} max={active.limit} tone={sinosureTone(active.used, active.limit)} />
                      <div className="row">
                        <span className="muted" style={{ fontSize: "var(--fs-sm)" }}>额度</span>
                        <span className="spacer" />
                        <span className="num muted">{formatMoney(active.limit)}</span>
                      </div>
                      <div className="row">
                        <span className="muted" style={{ fontSize: "var(--fs-sm)" }}>剩余可用</span>
                        <span className="spacer" />
                        <b className="num" style={{ color: active.limit - active.used > 0 ? "var(--jade)" : "var(--coral)" }}>
                          {formatMoney(Math.max(0, active.limit - active.used))}
                        </b>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="card">
                <div className="card-head">
                  <h3>这家客户的订单</h3>
                  <span className="spacer" />
                  <Link className="btn btn-sm" to={`/orders?q=${encodeURIComponent(active.name)}`}>
                    在订单核算里打开
                    <Icon name="chevronRight" />
                  </Link>
                </div>
                <div className="card-body" style={{ paddingTop: 6, paddingBottom: 6 }}>
                  {orders.length === 0 ? (
                    <p className="muted" style={{ fontSize: "var(--fs-md)" }}>这家客户还没有在跟订单。</p>
                  ) : (
                    <div style={{ display: "grid", gap: 0 }}>
                      {orders.slice(0, 8).map((o) => (
                        <Link
                          key={o.id}
                          to={`/orders?id=${o.id}`}
                          className="row"
                          style={{ padding: "9px 0", borderBottom: "1px solid var(--line-2)", color: "inherit" }}
                        >
                          <b className="num">{o.piNo}</b>
                          <span className="muted truncate" style={{ fontSize: "var(--fs-sm)", flex: 1 }}>
                            {o.product ?? "—"}
                          </span>
                          <span className="num">{formatMoney(o.amount, o.currency === "CNY" ? "¥" : "$")}</span>
                          <Pill tone={o.profitRate < 0 ? "coral" : o.profitRate < PROFIT_WARN_PCT ? "amber" : "jade"} dot={false}>
                            {formatPct(o.profitRate, 1)}
                          </Pill>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
