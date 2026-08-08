import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { DataGrid, type Column } from "@/components/grid/DataGrid";
import { Modal } from "@/components/ui/Modal";
import { toast, toastError } from "@/components/ui/Toast";
import { EmptyState, Field, Pill, SearchInput } from "@/components/ui/bits";
import { useAuth } from "@/auth/AuthProvider";
import { useDb } from "@/data/DataProvider";
import { useT } from "@/i18n";
import { listOrders, type OrderRow } from "@/data/queries";
import { createPi, nextPiNo } from "@/data/mutations";
import { formatMoney, todayIso } from "@/lib/format";
import { PiDrawer } from "@/components/PiDrawer";

/**
 * PI 取号。号段规则 `MT + 两位年 + X + 五位流水`，取号即建档 ——
 * 后续跟单 / 核算 / 退税全靠这个号串联，所以这一步必须挡住重号。
 */
export default function PiRegistry() {
  const { t } = useT();
  const db = useDb();
  const { viewer, user, can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(params.get("new") === "1");
  const q = params.get("q") ?? "";
  const readOnly = !can("write");

  const rows = useMemo(() => listOrders(db, viewer, { q }).slice(0, 400), [db, viewer, q]);
  const lineCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of db.piLines) m.set(l.piId, (m.get(l.piId) ?? 0) + 1);
    return (id: string) => m.get(id) ?? 0;
  }, [db.piLines]);
  const openId = params.get("id");
  const thisYear = String(new Date().getFullYear());
  const yearCount = rows.filter((r) => r.signedOn.startsWith(thisYear)).length;

  const columns: Column<OrderRow>[] = useMemo(
    () => [
      {
        key: "pi",
        title: t("PI 号"),
        width: 156,
        freeze: true,
        hideable: false,
        sort: (a, b) => a.piNo.localeCompare(b.piNo),
        render: (r) => <span className="cell-main">{r.piNo}</span>,
      },
      { key: "signed", title: t("签约日"), width: 110, sort: (a, b) => a.signedOn.localeCompare(b.signedOn), render: (r) => <span className="num">{r.signedOn}</span> },
      { key: "customer", title: t("客户"), width: 180, sort: (a, b) => a.customerName.localeCompare(b.customerName), render: (r) => <span className="truncate" style={{ display: "block" }}>{r.customerName}</span> },
      { key: "product", title: t("产品"), width: 240, render: (r) => <span className="truncate" style={{ display: "block" }} title={r.product ?? ""}>{r.product ?? "—"}</span> },
      {
        key: "lines",
        title: t("明细行"),
        width: 96,
        align: "right",
        sort: (a, b) => lineCount(a.id) - lineCount(b.id),
        /* 没有明细行的 PI 开不出发票和装箱单。把它做成一列而不是藏在详情里，
           是因为"哪几张单还没补明细"是跟单员每天要扫一遍的事 */
        tip: t("没有明细行就生成不了发票和装箱单"),
        render: (r) => {
          const n = lineCount(r.id);
          return n ? <span className="cell-num">{n}</span> : <Pill tone="amber">{t("待补")}</Pill>;
        },
      },
      { key: "amount", title: t("金额"), width: 128, align: "right", sort: (a, b) => a.amount - b.amount, render: (r) => <span className="cell-num">{formatMoney(r.amount, r.currency === "CNY" ? "¥" : "$")}</span> },
      { key: "sales", title: t("取号人"), width: 92, render: (r) => r.salesName },
      { key: "entity", title: t("开票主体"), width: 110, render: (r) => <Pill tone={r.sellerEntity === "供应链" ? "violet" : "accent"}>{r.sellerEntity ?? "—"}</Pill> },
      { key: "status", title: t("状态"), width: 96, render: (r) => <Pill tone={r.status === "closed" ? "jade" : r.status === "archived" ? "mute" : "accent"}>{r.status === "closed" ? t("已完结") : r.status === "archived" ? t("已归档") : t("进行中")}</Pill> },
      { key: "ship", title: t("出运批次"), width: 92, align: "right", sort: (a, b) => a.shipmentCount - b.shipmentCount, render: (r) => <span className="cell-num">{r.shipmentCount || "—"}</span> },
    ],
    [t, lineCount],
  );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t("PI 取号")}</h1>
          <p>
            {t("号段规则")} <code className="num">MT{thisYear.slice(2)}X#####</code>
            {t(" · 取号即建档 · {y} 年已取 {n} 号", { y: thisYear, n: yearCount })}
          </p>
        </div>
        <div className="page-acts">
          <button className="btn btn-primary" onClick={() => setOpen(true)} disabled={readOnly}>
            <Icon name="plus" />
            {t("取下一个号")}
          </button>
        </div>
      </div>

      <div className="toolbar">
        <SearchInput
          value={q}
          onChange={(v) =>
            setParams((p) => {
              const next = new URLSearchParams(p);
              if (v) next.set("q", v);
              else next.delete("q");
              return next;
            }, { replace: true })
          }
          placeholder={t("搜 PI 号 / 客户 / 产品…")}
        />
        <span className="spacer" />
        <span className="muted" style={{ fontSize: "var(--fs-sm)" }}>
          {t("下一个可用号：")}<b className="num">{nextPiNo(db)}</b>
        </span>
      </div>

      <DataGrid<OrderRow>
        gridId="pi"
        exportName={t("PI 取号")}
        rows={rows}
        columns={columns}
        empty={<EmptyState icon="tag" title={t("还没有取过号")} desc={t("点右上角「取下一个号」建第一张 PI。")} />}
        onRowOpen={(r) => setParams((p) => { const n = new URLSearchParams(p); n.set("id", r.id); return n; }, { replace: true })}
        renderCard={(r) => (
          <button className="rcard" key={r.id} onClick={() => setParams((p) => { const n = new URLSearchParams(p); n.set("id", r.id); return n; }, { replace: true })}>
            <div className="rcard-top">
              <span className="cell-main">{r.piNo}</span>
              <span className="spacer" />
              <span className="num">{formatMoney(r.amount, r.currency === "CNY" ? "¥" : "$")}</span>
            </div>
            <div className="rcard-meta">
              <span>{r.customerName}</span>
              <span className="num">{r.signedOn}</span>
              <span>{r.salesName}</span>
            </div>
            <div className="rcard-note clamp-2">{r.product ?? "—"}</div>
          </button>
        )}
      />

      <PiDrawer
        piId={openId}
        onClose={() => setParams((p) => { const n = new URLSearchParams(p); n.delete("id"); return n; }, { replace: true })}
      />

      {open ? (
        <NewPiModal
          onClose={() => {
            setOpen(false);
            setParams((p) => {
              const next = new URLSearchParams(p);
              next.delete("new");
              return next;
            }, { replace: true });
          }}
          defaultSalesId={user?.id ?? null}
        />
      ) : null}
    </div>
  );
}

function NewPiModal({ onClose, defaultSalesId }: { onClose: () => void; defaultSalesId: string | null }) {
  const { t } = useT();
  const db = useDb();
  const { user } = useAuth();
  const [piNo, setPiNo] = useState(() => nextPiNo(db));
  const [customerId, setCustomerId] = useState(db.customers[0]?.id ?? "");
  const [salesId, setSalesId] = useState(defaultSalesId ?? db.users.find((u) => u.role === "sales")?.id ?? "");
  const [entityId, setEntityId] = useState(db.sellerEntities[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [product, setProduct] = useState("");
  const [signedOn, setSignedOn] = useState(todayIso);

  const dup = db.pis.some((p) => p.piNo === piNo.trim());
  // 选了客户就把跟这家的业务员带出来 —— 取号时最常见的错就是挂错业务员
  useEffect(() => {
    const c = db.customers.find((x) => x.id === customerId);
    if (c?.salesId) setSalesId(c.salesId);
  }, [customerId, db.customers]);

  const submit = () => {
    const res = createPi(
      { id: user?.id ?? null, name: user?.name ?? "—" },
      { piNo, customerId, salesId, sellerEntityId: entityId, amount: Number(amount) || 0, currency, product, signedOn },
    );
    if (!res.ok) {
      toastError(res.error);
      return;
    }
    toast(t("已取号 {no}，同时建了一张空核算", { no: piNo }));
    onClose();
  };

  return (
    <Modal
      open
      title={t("PI 取号")}
      onClose={onClose}
      width={540}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t("取消")}
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={dup || !piNo.trim() || !customerId}>
            {t("取号并建档")}
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 12, paddingBottom: 6 }}>
        <Field label={t("PI 号")} hint={dup ? "" : t("按号段规则自动生成，也可以手改")}>
          <input className="input num" value={piNo} onChange={(e) => setPiNo(e.target.value)} />
        </Field>
        {dup ? (
          <div className="login-err">
            <Icon name="alert" />
            {t("{no} 已经存在，换一个号", { no: piNo })}
          </div>
        ) : null}

        <Field label={t("客户")}>
          <select className="select" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            {db.customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.country}
              </option>
            ))}
          </select>
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label={t("业务员")}>
            <select className="select" value={salesId} onChange={(e) => setSalesId(e.target.value)}>
              {db.users.filter((u) => u.active).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("开票主体")}>
            <select className="select" value={entityId} onChange={(e) => setEntityId(e.target.value)}>
              {db.sellerEntities.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.8fr 1fr", gap: 10 }}>
          <Field label={t("订单金额")}>
            <input className="input num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="19224.00" />
          </Field>
          <Field label={t("币种")}>
            <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="USD">USD</option>
              <option value="CNY">CNY</option>
              <option value="EUR">EUR</option>
            </select>
          </Field>
          <Field label={t("签约日")}>
            <input type="date" className="input num" value={signedOn} onChange={(e) => setSignedOn(e.target.value)} />
          </Field>
        </div>

        <Field label={t("产品")}>
          <input className="input" value={product} onChange={(e) => setProduct(e.target.value)} placeholder={t("一次性防护服（L 码）")} />
        </Field>
      </div>
    </Modal>
  );
}
