import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { DataGrid, type Column } from "@/components/grid/DataGrid";
import { Modal } from "@/components/ui/Modal";
import { toast, toastError } from "@/components/ui/Toast";
import { EmptyState, Field, Pill, SearchInput } from "@/components/ui/bits";
import { useAuth } from "@/auth/AuthProvider";
import { useDb } from "@/data/DataProvider";
import { listOrders, type OrderRow } from "@/data/queries";
import { createPi, nextPiNo } from "@/data/mutations";
import { formatMoney, todayIso } from "@/lib/format";

/**
 * PI 取号。号段规则 `MT + 两位年 + X + 五位流水`，取号即建档 ——
 * 后续跟单 / 核算 / 退税全靠这个号串联，所以这一步必须挡住重号。
 */
export default function PiRegistry() {
  const db = useDb();
  const { viewer, user, can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(params.get("new") === "1");
  const q = params.get("q") ?? "";
  const readOnly = !can("write");

  const rows = useMemo(() => listOrders(db, viewer, { q }).slice(0, 400), [db, viewer, q]);
  const thisYear = String(new Date().getFullYear());
  const yearCount = rows.filter((r) => r.signedOn.startsWith(thisYear)).length;

  const columns: Column<OrderRow>[] = useMemo(
    () => [
      {
        key: "pi",
        title: "PI 号",
        width: 156,
        freeze: true,
        hideable: false,
        sort: (a, b) => a.piNo.localeCompare(b.piNo),
        render: (r) => <span className="cell-main">{r.piNo}</span>,
      },
      { key: "signed", title: "签约日", width: 110, sort: (a, b) => a.signedOn.localeCompare(b.signedOn), render: (r) => <span className="num">{r.signedOn}</span> },
      { key: "customer", title: "客户", width: 180, sort: (a, b) => a.customerName.localeCompare(b.customerName), render: (r) => <span className="truncate" style={{ display: "block" }}>{r.customerName}</span> },
      { key: "product", title: "产品", width: 260, render: (r) => <span className="truncate" style={{ display: "block" }} title={r.product ?? ""}>{r.product ?? "—"}</span> },
      { key: "amount", title: "金额", width: 128, align: "right", sort: (a, b) => a.amount - b.amount, render: (r) => <span className="cell-num">{formatMoney(r.amount, r.currency === "CNY" ? "¥" : "$")}</span> },
      { key: "sales", title: "取号人", width: 92, render: (r) => r.salesName },
      { key: "entity", title: "开票主体", width: 110, render: (r) => <Pill tone={r.sellerEntity === "供应链" ? "violet" : "accent"}>{r.sellerEntity ?? "—"}</Pill> },
      { key: "status", title: "状态", width: 96, render: (r) => <Pill tone={r.status === "closed" ? "jade" : r.status === "archived" ? "mute" : "accent"}>{r.status === "closed" ? "已完结" : r.status === "archived" ? "已归档" : "进行中"}</Pill> },
      { key: "ship", title: "出运批次", width: 92, align: "right", sort: (a, b) => a.shipmentCount - b.shipmentCount, render: (r) => <span className="cell-num">{r.shipmentCount || "—"}</span> },
    ],
    [],
  );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>PI 取号</h1>
          <p>
            号段规则 <code className="num">MT{thisYear.slice(2)}X#####</code> · 取号即建档 · {thisYear} 年已取 {yearCount} 号
          </p>
        </div>
        <div className="page-acts">
          <button className="btn btn-primary" onClick={() => setOpen(true)} disabled={readOnly}>
            <Icon name="plus" />
            取下一个号
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
          placeholder="搜 PI 号 / 客户 / 产品…"
        />
        <span className="spacer" />
        <span className="muted" style={{ fontSize: "var(--fs-sm)" }}>
          下一个可用号：<b className="num">{nextPiNo(db)}</b>
        </span>
      </div>

      <DataGrid<OrderRow>
        gridId="pi"
        rows={rows}
        columns={columns}
        empty={<EmptyState icon="tag" title="还没有取过号" desc="点右上角「取下一个号」建第一张 PI。" />}
        renderCard={(r) => (
          <div className="rcard" key={r.id}>
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
          </div>
        )}
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
    toast(`已取号 ${piNo}，同时建了一张空核算`);
    onClose();
  };

  return (
    <Modal
      open
      title="PI 取号"
      onClose={onClose}
      width={540}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={dup || !piNo.trim() || !customerId}>
            取号并建档
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 12, paddingBottom: 6 }}>
        <Field label="PI 号" hint={dup ? "" : "按号段规则自动生成，也可以手改"}>
          <input className="input num" value={piNo} onChange={(e) => setPiNo(e.target.value)} />
        </Field>
        {dup ? (
          <div className="login-err">
            <Icon name="alert" />
            {piNo} 已经存在，换一个号
          </div>
        ) : null}

        <Field label="客户">
          <select className="select" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            {db.customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.country}
              </option>
            ))}
          </select>
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="业务员">
            <select className="select" value={salesId} onChange={(e) => setSalesId(e.target.value)}>
              {db.users.filter((u) => u.active).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="开票主体">
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
          <Field label="订单金额">
            <input className="input num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="19224.00" />
          </Field>
          <Field label="币种">
            <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="USD">USD</option>
              <option value="CNY">CNY</option>
              <option value="EUR">EUR</option>
            </select>
          </Field>
          <Field label="签约日">
            <input type="date" className="input num" value={signedOn} onChange={(e) => setSignedOn(e.target.value)} />
          </Field>
        </div>

        <Field label="产品">
          <input className="input" value={product} onChange={(e) => setProduct(e.target.value)} placeholder="一次性防护服（L 码）" />
        </Field>
      </div>
    </Modal>
  );
}
