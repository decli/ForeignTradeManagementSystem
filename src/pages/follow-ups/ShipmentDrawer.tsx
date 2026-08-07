import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { MilestoneRail } from "@/components/MilestoneRail";
import { Drawer } from "@/components/ui/Drawer";
import { toast } from "@/components/ui/Toast";
import { KV, Pill } from "@/components/ui/bits";
import { useAuth } from "@/auth/AuthProvider";
import { useDb } from "@/data/DataProvider";
import { tr, useT } from "@/i18n";
import { getShipmentDetail } from "@/data/queries";
import { setMilestone, setRelease, toggleTodo, updateNote } from "@/data/mutations";
import { formatMoney, humanDate, localClock, todayIso } from "@/lib/format";
import { PHRASES, RELEASE_STATES, RELEASE_TONE } from "@/lib/rules";

/** 单证齐套检查表：真实项目里应该来自「单证备案」模块，这里按批次特征推出来 */
function docChecklist(d: NonNullable<ReturnType<typeof getShipmentDetail>>) {
  const shipped = d.milestones.some((m) => m.kind === "ATD" && m.state === "done");
  const loaded = d.milestones.some((m) => m.kind === "装柜" && m.state === "done");
  return [
    { name: tr("商业发票 / 装箱单"), done: loaded, note: tr("装柜后出具") },
    { name: tr("提单 BL"), done: shipped, note: shipped ? tr("已出正本") : tr("开船后由货代签发") },
    { name: tr("报关单"), done: d.releaseState !== "未放行", note: d.releaseState === "未放行" ? tr("尚未报关") : tr("已报关放行") },
    { name: tr("原产地证 / FORM"), done: shipped && d.country !== "美国", note: d.country === "美国" ? tr("美国线不需要") : tr("随正本一起寄出") },
    { name: tr("熏蒸 / 检疫证明"), done: d.country === "澳大利亚" ? loaded : true, note: d.country === "澳大利亚" ? tr("澳洲木托必须处理") : tr("本线不强制") },
  ];
}

export function ShipmentDrawer({
  id,
  onClose,
  onPrev,
  onNext,
}: {
  id: string | null;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const { t } = useT();
  const db = useDb();
  const { user, can } = useAuth();
  const [tab, setTab] = useState("overview");
  const [draft, setDraft] = useState("");
  const detail = useMemo(() => (id ? getShipmentDetail(db, id) : null), [db, id]);
  const actor = { id: user?.id ?? null, name: user?.name ?? "—" };
  const readOnly = !can("write");

  if (!detail) return null;
  const clock = localClock(detail.customerTz);
  const docs = docChecklist(detail);

  const addNote = () => {
    const text = draft.trim();
    if (!text) return;
    updateNote(actor, detail.id, text, todayIso());
    setDraft("");
    toast(`已给 ${detail.batchNo} 记一条动态`);
  };

  return (
    <Drawer
      open
      onClose={onClose}
      onPrev={onPrev}
      onNext={onNext}
      title={
        <>
          <span className="num">{detail.batchNo}</span>
          {detail.batchLabel ? <span className="badge-batch">{detail.batchLabel}</span> : null}
          <Pill tone={RELEASE_TONE[detail.releaseState] ?? "mute"}>{detail.releaseState}</Pill>
          {detail.hasTodo ? <Pill tone="amber">{t("有待办")}</Pill> : null}
        </>
      }
      subtitle={
        <>
          <span>
            {detail.country} · {detail.term} · {detail.mode} · {detail.fcl ? t("整柜") : t("拼柜")}
          </span>
          {detail.customerName ? <span>· {detail.customerName}</span> : null}
          {clock ? (
            <span>
              · 客户当地 {clock.time}
              {clock.working ? t("（在上班）") : t("（多半不在）")}
            </span>
          ) : null}
        </>
      }
      tabs={[
        { key: "overview", label: t("概览") },
        { key: "notes", label: `动态流水 ${detail.notes.length}` },
        { key: "docs", label: t("单证齐套") },
      ]}
      tab={tab}
      onTab={setTab}
      footer={
        <>
          <button
            className="btn btn-sm"
            disabled={readOnly}
            onClick={() => {
              toggleTodo(actor, detail.id, !detail.hasTodo);
              toast(detail.hasTodo ? `已销掉 ${detail.batchNo} 的待办` : `已给 ${detail.batchNo} 加待办`);
            }}
          >
            <Icon name="flag" />
            {detail.hasTodo ? t("销掉待办") : t("标为待办")}
          </button>
          <select
            className="select"
            style={{ height: 24, fontSize: "var(--fs-sm)" }}
            value={detail.releaseState}
            disabled={readOnly}
            onChange={(e) => {
              setRelease(actor, detail.id, e.target.value as (typeof RELEASE_STATES)[number]);
              toast(`${detail.batchNo} 改为「${e.target.value}」`);
            }}
            aria-label={t("放行状态")}
          >
            {RELEASE_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <span className="spacer" />
          {detail.piId ? (
            <Link className="btn btn-sm" to={`/orders?id=${detail.piId}`}>
              {t("看这张 PI 的核算")}
              <Icon name="chevronRight" />
            </Link>
          ) : null}
        </>
      }
    >
      {tab === "overview" ? (
        <>
          <div className="sect">
            <div className="sect-h">
              <Icon name="ship" size={14} />
              {t("进度里程碑")}
              <span className="spacer" />
              <span className="muted" style={{ fontWeight: 400 }}>{t("点日期可以就地改")}</span>
            </div>
            <div style={{ padding: "6px 4px 14px" }}>
              <MilestoneRail milestones={detail.milestones} />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {detail.milestones.map((m) => (
                <div className="row" key={m.kind} style={{ gap: 10 }}>
                  <span style={{ width: 42, fontSize: "var(--fs-sm)", color: "var(--text-2)" }}>{m.kind}</span>
                  <label className="row" style={{ gap: 5 }}>
                    <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>{t("计划")}</span>
                    <input
                      type="date"
                      className="input num"
                      style={{ height: 26, width: 138, fontSize: "var(--fs-sm)" }}
                      value={m.planned ?? ""}
                      disabled={readOnly}
                      onChange={(e) => setMilestone(actor, detail.id, m.kind, "plannedOn", e.target.value || null)}
                      aria-label={`${m.kind} 计划日期`}
                    />
                  </label>
                  <label className="row" style={{ gap: 5 }}>
                    <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>{t("实际")}</span>
                    <input
                      type="date"
                      className="input num"
                      style={{ height: 26, width: 138, fontSize: "var(--fs-sm)" }}
                      value={m.actual ?? ""}
                      disabled={readOnly}
                      onChange={(e) => setMilestone(actor, detail.id, m.kind, "actualOn", e.target.value || null)}
                      aria-label={`${m.kind} 实际日期`}
                    />
                  </label>
                  {m.state === "late" ? <Pill tone="coral">{t("超期")}</Pill> : m.state === "now" ? <Pill tone="accent">{t("进行中")}</Pill> : null}
                </div>
              ))}
            </div>
          </div>

          <div className="sect">
            <div className="sect-h">
              <Icon name="info" size={14} />
              {t("批次信息")}
            </div>
            <div className="kv-grid">
              <KV k="柜号" v={detail.containerNo ?? "—"} mono />
              <KV k="船司" v={detail.carrier ?? "—"} />
              <KV k="目的港" v={detail.pod ?? "—"} />
              <KV k="贸易条款" v={detail.term} />
              <KV k="关联 PI" v={detail.piNo ?? t("未关联")} mono />
              <KV k="订单额" v={detail.amount ? formatMoney(detail.amount) : "—"} mono />
              <KV k="业务员" v={`${detail.salesName} · ${detail.team ?? "—"}`} />
              <KV k="产品" v={detail.product ?? "—"} />
            </div>
          </div>

          <div className="sect">
            <div className="sect-h">
              <Icon name="edit" size={14} />
              {t("记一条动态")}
            </div>
            <textarea
              className="input"
              rows={2}
              value={draft}
              disabled={readOnly}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addNote();
              }}
              placeholder={readOnly ? t("只读身份不能写入") : t("今天跟这票有关的进展… ⌘↵ 保存")}
              style={{ width: "100%" }}
            />
            <div className="row wrap" style={{ marginTop: 8 }}>
              <div className="phrase-wrap">
                {PHRASES.map((p) => (
                  <button key={p} className="phrase" disabled={readOnly} onClick={() => setDraft((d) => (d ? `${d}；${p}` : p))}>
                    {p}
                  </button>
                ))}
              </div>
              <span className="spacer" />
              <button className="btn btn-primary btn-sm" onClick={addNote} disabled={readOnly || !draft.trim()}>
                {t("保存")}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {tab === "notes" ? (
        <div className="feed">
          {detail.notes.length === 0 ? (
            <p className="muted">{t("这票还没有任何动态。回到「概览」写第一条。")}</p>
          ) : (
            detail.notes.map((n) => (
              <div className="feed-item" key={n.id}>
                <div className="feed-meta">
                  <b style={{ color: "var(--text-2)" }}>{n.author}</b>
                  <span>·</span>
                  <span className="num">{n.on}</span>
                  <span>·</span>
                  <span>{humanDate(n.on)}</span>
                </div>
                <div className="feed-body">{n.body}</div>
              </div>
            ))
          )}
        </div>
      ) : null}

      {tab === "docs" ? (
        <div>
          <p className="muted" style={{ fontSize: "var(--fs-md)", marginBottom: 12 }}>
            {t("按这票的目的国、贸易条款和当前进度推出来的应备单证。真实项目里这份清单来自「单证备案」模块。")}
          </p>
          <div style={{ display: "grid", gap: 2 }}>
            {docs.map((doc) => (
              <div className="row" key={doc.name} style={{ padding: "9px 0", borderBottom: "1px solid var(--line-2)" }}>
                <span
                  style={{
                    display: "grid",
                    placeItems: "center",
                    width: 20,
                    height: 20,
                    borderRadius: "var(--r-full)",
                    background: doc.done ? "var(--jade-soft)" : "var(--surface-3)",
                    color: doc.done ? "var(--jade)" : "var(--text-4)",
                    flex: "none",
                  }}
                >
                  <Icon name={doc.done ? "check" : "minus"} size={12} />
                </span>
                <b style={{ fontSize: "var(--fs-md)", fontWeight: 550 }}>{doc.name}</b>
                <span className="spacer" />
                <span className="muted" style={{ fontSize: "var(--fs-sm)" }}>{doc.note}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}
