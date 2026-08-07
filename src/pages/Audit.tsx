import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { DataGrid, type Column } from "@/components/grid/DataGrid";
import { EmptyState, Pill, SearchInput } from "@/components/ui/bits";
import { useDb } from "@/data/DataProvider";
import { useT } from "@/i18n";
import { listAudit } from "@/data/queries";
import type { AuditLog } from "@/data/types";
import { relativeTime } from "@/lib/format";
import { exportXlsx, stampName } from "@/lib/xlsx";
import { toast } from "@/components/ui/Toast";

const ENTITY_LABEL: Record<string, string> = {
  Shipment: "出运批次",
  ShipmentMilestone: "里程碑",
  TaxInvoice: "退税发票",
  OrderCosting: "订单核算",
  Pi: "PI",
  User: "账号",
  FxRate: "汇率",
};

export default function Audit() {
  const { t } = useT();
  const db = useDb();
  const [q, setQ] = useState("");
  const [entity, setEntity] = useState("");
  const [actor, setActor] = useState("");

  const rows = useMemo(() => listAudit(db, { q, entity, actor }), [db, q, entity, actor]);
  const actors = useMemo(() => [...new Set(db.auditLogs.map((a) => a.actorName))].sort(), [db.auditLogs]);
  const entities = useMemo(() => [...new Set(db.auditLogs.map((a) => a.entity))].sort(), [db.auditLogs]);

  const columns: Column<AuditLog>[] = useMemo(
    () => [
      {
        key: "at",
        title: t("时间"),
        width: 152,
        freeze: true,
        hideable: false,
        sort: (a, b) => a.at.localeCompare(b.at),
        render: (r) => (
          <>
            <div className="num" style={{ fontSize: "var(--fs-sm)" }}>{r.at.slice(0, 16).replace("T", " ")}</div>
            <div className="cell-sub">
              <span>{relativeTime(r.at)}</span>
            </div>
          </>
        ),
      },
      { key: "actor", title: t("操作人"), width: 100, sort: (a, b) => a.actorName.localeCompare(b.actorName), render: (r) => r.actorName },
      { key: "action", title: t("动作"), width: 120, render: (r) => <Pill tone={r.action.includes("删除") ? "coral" : r.action.includes("批量") ? "violet" : "accent"}>{r.action}</Pill> },
      { key: "entity", title: t("对象类型"), width: 106, render: (r) => ENTITY_LABEL[r.entity] ?? r.entity },
      { key: "label", title: t("单据"), width: 200, render: (r) => <span className="num truncate" style={{ display: "block" }}>{r.entityLabel}</span> },
      {
        key: "diff",
        title: t("改动前 → 改动后"),
        width: 400,
        minWidth: 220,
        render: (r) => (
          <div className="row" style={{ gap: 8, fontSize: "var(--fs-sm)" }}>
            <code className="num truncate" style={{ color: "var(--text-3)", flex: 1, minWidth: 0 }} title={r.before ?? ""}>
              {r.before ?? "—"}
            </code>
            <Icon name="arrowRight" size={13} style={{ color: "var(--text-4)", flex: "none" }} />
            <code className="num truncate" style={{ flex: 1, minWidth: 0 }} title={r.after ?? ""}>
              {r.after ?? "—"}
            </code>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t("审计日志")}</h1>
          <p>{t("所有写操作留痕 · 按人 / 单据 / 时间回查改动前后值 · 保留最近 800 条")}</p>
        </div>
        <div className="page-acts">
          <button
            className="btn"
            onClick={async () => {
              await exportXlsx<AuditLog>(
                stampName("审计日志"),
                [
                  { header: t("时间"), width: 20, value: (r) => r.at },
                  { header: t("操作人"), width: 12, value: (r) => r.actorName },
                  { header: t("动作"), width: 14, value: (r) => r.action },
                  { header: t("对象类型"), width: 14, value: (r) => ENTITY_LABEL[r.entity] ?? r.entity },
                  { header: t("单据"), width: 24, value: (r) => r.entityLabel },
                  { header: t("改动前"), width: 40, value: (r) => r.before },
                  { header: t("改动后"), width: 40, value: (r) => r.after },
                ],
                rows,
              );
              toast(`已导出 ${rows.length} 条留痕`);
            }}
          >
            <Icon name="download" />
            {t("导出 Excel")}
          </button>
        </div>
      </div>

      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder={t("搜单据号 / 动作 / 操作人…")} />
        <span className="toolbar-sep" />
        <select className="select" value={entity} onChange={(e) => setEntity(e.target.value)} aria-label={t("对象类型")}>
          <option value="">{t("对象：全部")}</option>
          {entities.map((e) => (
            <option key={e} value={e}>
              {ENTITY_LABEL[e] ?? e}
            </option>
          ))}
        </select>
        <select className="select" value={actor} onChange={(e) => setActor(e.target.value)} aria-label={t("操作人")}>
          <option value="">{t("操作人：全部")}</option>
          {actors.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <span className="spacer" />
        <span className="muted" style={{ fontSize: "var(--fs-sm)" }}>{rows.length} 条留痕</span>
      </div>

      <DataGrid<AuditLog>
        gridId="audit"
        rows={rows}
        columns={columns}
        pageSize={50}
        empty={<EmptyState icon="shield" title={t("没有匹配的留痕")} desc={t("改一条动态、批量更新一次、关联一张发票，这里就会出现记录。")} />}
        renderCard={(r) => (
          <div className="rcard" key={r.id}>
            <div className="rcard-top">
              <Pill tone={r.action.includes("删除") ? "coral" : "accent"}>{r.action}</Pill>
              <span className="num truncate">{r.entityLabel}</span>
            </div>
            <div className="rcard-meta">
              <span>{r.actorName}</span>
              <span>{relativeTime(r.at)}</span>
              <span>{ENTITY_LABEL[r.entity] ?? r.entity}</span>
            </div>
          </div>
        )}
      />
    </div>
  );
}
