import { listCustomers, getCustomerOrders } from "@/server/customers";
import { CustomerList } from "@/components/customers/customer-list";
import { limitTone } from "@/lib/customer-rules";
import { LocalTime } from "@/components/customers/local-time";
import { formatMoney, formatInt } from "@/lib/format";
import { rateTone } from "@/lib/order-rules";

export const metadata = { title: "客户管理 · MT 通商" };
export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const rows = await listCustomers(one("q"));
  const selected = rows.find((c) => c.id === one("id")) ?? rows[0] ?? null;
  const orders = selected ? await getCustomerOrders(selected.id) : [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>客户管理</h1>
          <p>客户主档 · 跟进记录 · 中信保额度</p>
        </div>
      </div>

      <div className="split">
        <CustomerList rows={rows} selectedId={selected?.id ?? null} />

        <div>
          {!selected ? (
            <div className="card">
              <div className="card-b empty">左边还没有客户。换个搜索词，或先新增一个客户。</div>
            </div>
          ) : (
            <>
              <div className="kpis" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                <div className="kpi" data-tone="accent">
                  <span className="k">累计订单额</span>
                  <span className="v num" style={{ fontSize: 22 }}>
                    {formatMoney(selected.orderAmount).replace(/\.00$/, "")}
                  </span>
                  <span className="f">
                    {selected.orderCount} 单 · 自 {selected.since}
                  </span>
                </div>
                <div className="kpi" data-tone={limitTone(selected.usedPct) === "coral" ? "coral" : "jade"}>
                  <span className="k">中信保额度占用</span>
                  <span className="v num" style={{ fontSize: 22 }}>
                    {selected.usedPct}%
                  </span>
                  <span className="f">
                    {formatMoney(selected.used).replace(/\.00$/, "")} /{" "}
                    {formatMoney(selected.limit).replace(/\.00$/, "")}
                  </span>
                </div>
                <div className="kpi">
                  <span className="k">当地时间</span>
                  <span className="v" style={{ fontSize: 22 }}>
                    <LocalTime timezone={selected.timezone} />
                  </span>
                  <span className="f">发邮件前先看一眼</span>
                </div>
                <div className="kpi">
                  <span className="k">信用等级</span>
                  <span className="v" style={{ fontSize: 22 }}>
                    {selected.creditLevel} 级
                  </span>
                  <span className="f">业务员 {selected.salesName}</span>
                </div>
              </div>

              <div className="card" style={{ marginTop: 16 }}>
                <div className="card-h">
                  <h3>{selected.name}</h3>
                  <span className="sub">
                    {selected.code} · {selected.country}
                    {selected.contact ? ` · 联系人 ${selected.contact}` : ""}
                  </span>
                </div>
                <div className="card-b">
                  {selected.note ? (
                    <div
                      style={{
                        borderLeft: "3px solid var(--accent)",
                        background: "var(--accent-soft)",
                        padding: "11px 14px",
                        borderRadius: "0 9px 9px 0",
                        fontSize: 13,
                        color: "var(--text-2)",
                        marginBottom: 16,
                      }}
                    >
                      {selected.note}
                    </div>
                  ) : null}

                  <h3 style={{ fontSize: 13.5, margin: "0 0 8px" }}>近期订单</h3>
                  {orders.length === 0 ? (
                    <p style={{ color: "var(--text-3)", fontSize: 12.5 }}>这个客户还没有下过单。</p>
                  ) : (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>PI 号</th>
                            <th>签约</th>
                            <th style={{ minWidth: 180 }}>产品</th>
                            <th className="td-r">订单额</th>
                            <th className="td-r">利润率</th>
                            <th>状态</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orders.map((o) => (
                            <tr key={o.id}>
                              <td className="cell-main" style={{ color: "var(--accent-ink)" }}>
                                {o.piNo}
                              </td>
                              <td className="mono" style={{ fontSize: 12.5 }}>
                                {o.signedOn}
                              </td>
                              <td style={{ maxWidth: 220 }}>
                                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {o.product ?? "—"}
                                </div>
                              </td>
                              <td className="td-r num">
                                {formatMoney(o.amount, o.currency === "CNY" ? "¥" : "$")}
                              </td>
                              <td
                                className="td-r num"
                                style={{ fontWeight: 600, color: `var(--${rateTone(o.profitRate)})` }}
                              >
                                {o.profitRate.toFixed(2)}%
                              </td>
                              <td>
                                <span className={`pill ${o.settleState === "已完结" ? "mute" : "accent"}`}>
                                  {o.settleState}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 12 }}>
                    共 {formatInt(selected.orderCount)} 单，这里显示最近 10 单。
                    跟进记录与联系人管理属于 M1 范围。
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
