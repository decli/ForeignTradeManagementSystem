import { db } from "@/lib/db";
import { formatInt } from "@/lib/format";

export const metadata = { title: "审计日志 · MT 通商" };
export const dynamic = "force-dynamic";

const ENTITY_LABEL: Record<string, string> = {
  Shipment: "出运批次",
  TaxInvoice: "退税发票",
  Pi: "订单",
  Customer: "客户",
};

const ACTION_LABEL: Record<string, { text: string; tone: string }> = {
  "note.update": { text: "改动态", tone: "accent" },
  "bulk.update": { text: "批量更新", tone: "accent" },
  "bulk.revert": { text: "撤销批量", tone: "amber" },
  archive: { text: "删除", tone: "coral" },
  restore: { text: "恢复", tone: "jade" },
  "todo.toggle": { text: "待办", tone: "amber" },
  link: { text: "关联订单", tone: "jade" },
  unlink: { text: "取消关联", tone: "amber" },
};

/** 只挑出真正变了的字段，整段 JSON 对人没用 */
function diff(beforeRaw: string | null, afterRaw: string | null) {
  const parse = (s: string | null) => {
    if (!s) return {} as Record<string, unknown>;
    try {
      const v = JSON.parse(s);
      return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  };
  const before = parse(beforeRaw);
  const after = parse(afterRaw);
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => k !== "id");

  const show = (v: unknown) => {
    if (v === null || v === undefined || v === "") return "（空）";
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return v.slice(0, 10);
    return String(v);
  };

  return keys
    .filter((k) => k in after && show(before[k]) !== show(after[k]))
    .map((k) => ({ key: k, from: show(before[k]), to: show(after[k]) }));
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const entity = Array.isArray(sp.entity) ? sp.entity[0] : sp.entity;

  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where: entity ? { entity } : {},
      include: { actor: { select: { name: true } } },
      orderBy: { at: "desc" },
      take: 100,
    }),
    db.auditLog.count({ where: entity ? { entity } : {} }),
  ]);

  const entities = await db.auditLog.findMany({ select: { entity: true }, distinct: ["entity"] });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>审计日志</h1>
          <p>所有写操作留痕 · 可回查改动前后值</p>
        </div>
      </div>

      <div className="filters">
        <div className="segment" role="group" aria-label="单据类型">
          <a className="" href="/audit" aria-current={!entity}>
            全部
          </a>
          {entities.map((e) => (
            <a key={e.entity} href={`/audit?entity=${e.entity}`} aria-current={entity === e.entity}>
              {ENTITY_LABEL[e.entity] ?? e.entity}
            </a>
          ))}
        </div>
      </div>

      <div className="table-wrap">
        <div className="table-bar">
          <span>
            共 <b className="num">{formatInt(total)}</b> 条 · 显示最近 100 条
          </span>
          <span className="hint">跟单表与退税页的每一次写入都会落在这里</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th style={{ minWidth: 150 }}>时间</th>
                <th>操作人</th>
                <th>单据</th>
                <th>动作</th>
                <th style={{ minWidth: 320 }}>改动内容</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty">
                    还没有操作记录。去跟单表改一条动态，这里就会出现第一行。
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const changes = diff(r.before, r.after);
                  const act = ACTION_LABEL[r.action] ?? { text: r.action, tone: "mute" };
                  return (
                    <tr key={r.id}>
                      <td className="mono" style={{ fontSize: 12.5 }}>
                        {r.at.toISOString().replace("T", " ").slice(0, 19)}
                      </td>
                      <td className="nw">{r.actor?.name ?? "系统"}</td>
                      <td className="nw">{ENTITY_LABEL[r.entity] ?? r.entity}</td>
                      <td>
                        <span className={`pill ${act.tone}`}>{act.text}</span>
                      </td>
                      <td>
                        {changes.length === 0 ? (
                          <span style={{ color: "var(--text-3)" }}>—</span>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {changes.map((c) => (
                              <div key={c.key} style={{ fontSize: 12.5 }}>
                                <span style={{ color: "var(--text-3)" }}>{c.key}：</span>
                                <span style={{ color: "var(--text-3)", textDecoration: "line-through" }}>
                                  {c.from}
                                </span>
                                <span style={{ margin: "0 6px", color: "var(--text-3)" }}>→</span>
                                <span>{c.to}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
