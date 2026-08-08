/**
 * 审批中心。
 *
 * ── 为什么默认落在「待我审」 ──
 * 审批系统只有两种用户：等着别人批的，和别人等着他批的。
 * 后者打开这一页只想干一件事 —— 把挂在自己名下的清掉。
 * 默认给"全部"，他要先点一次筛选才能开始干活。
 *
 * ── 为什么摘要要写全 ──
 * 每张审批单顶上那句话（"MT26X06188 · Andes Trading 利润率 −2.41%"）
 * 是刻意写满的：老板在手机上批一屏能看六条，看完就能判断，
 * 不用逐条点进去。要求点进去才能判断的审批系统，最后都变成一路"同意"。
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Page, Kpi, Panel, useParam } from "@/components/ui/PageKit";
import { Avatar, EmptyState, Pill, SearchInput, Segmented } from "@/components/ui/bits";
import { toast, toastError } from "@/components/ui/Toast";
import { ROLE_LABEL, useAuth } from "@/auth/AuthProvider";
import { useDb } from "@/data/DataProvider";
import { viewerOf } from "@/data/queries";
import { approvalKpis, listApprovals, type ApprovalRow } from "@/data/flow-queries";
import { decideApproval, patchRule, withdrawApproval } from "@/data/flow-mutations";
import { APPROVAL_KINDS, APPROVAL_STATUS } from "@/data/flow-types";
import { useTextField } from "@/lib/hooks";
import { canAdmin } from "@/lib/perms";
import { relativeTime, shortDate } from "@/lib/format";
import { useT } from "@/i18n";

/** 阈值的单位随类型而变，展示时得说人话，不能只给一个裸数字 */
function ruleValue(kind: string, v: number) {
  if (kind === "low_margin" || kind === "discount") return `${(v / 100).toFixed(1)}%`;
  if (kind === "credit") return `${(v / 100).toFixed(0)}%`;
  return `¥${(v / 100).toLocaleString("zh-CN")}`;
}

/** 审批单上那个触发数值。利润率是基点，金额是分 */
function amountText(r: ApprovalRow) {
  if (r.kind === "low_margin" || r.kind === "discount") return `${(r.amount / 100).toFixed(2)}%`;
  if (r.kind === "credit") return `${(r.amount / 100).toFixed(1)}%`;
  return `¥${(r.amount / 100).toLocaleString("zh-CN")}`;
}

const hrefOf = (r: ApprovalRow) =>
  r.entity === "pi"
    ? `/orders?q=${r.entityLabel}`
    : r.entity === "quote"
      ? `/quotes?q=${r.entityLabel.split(" ")[0]}`
      : r.entity === "customer"
        ? `/sinosure?q=${encodeURIComponent(r.entityLabel)}`
        : `/payments?q=${r.entityLabel}`;

function Comment({ onSubmit, busy }: { onSubmit: (ok: boolean, text: string) => void; busy: boolean }) {
  const [text, setText] = useState("");
  const f = useTextField(text, setText);
  const { t } = useT();
  return (
    <div className="ap-act">
      <input
        className="input"
        value={f.value}
        onChange={f.onChange}
        onCompositionStart={f.onCompositionStart}
        onCompositionEnd={f.onCompositionEnd}
        placeholder={t("批语（驳回时必填 —— 不写理由等于把球踢回去）")}
        aria-label={t("批语")}
      />
      <button className="btn btn-danger" disabled={busy} onClick={() => onSubmit(false, text)}>
        <Icon name="x" size={13} />
        {t("驳回")}
      </button>
      <button className="btn btn-primary" disabled={busy} onClick={() => onSubmit(true, text)}>
        <Icon name="check" size={13} />
        {t("通过")}
      </button>
    </div>
  );
}

function Card({ row, viewerId }: { row: ApprovalRow; viewerId: string | null }) {
  const db = useDb();
  const { user } = useAuth();
  const { t } = useT();
  const actor = { id: user?.id ?? null, name: user?.name ?? "—" };
  const kind = APPROVAL_KINDS[row.kind];

  return (
    <article className="apc" data-status={row.status} data-mine={row.mine ? "1" : undefined} id={`ap-${row.id}`}>
      <header className="apc-head">
        <Pill tone={row.kind === "payment" ? "violet" : row.kind === "credit" ? "coral" : "amber"} dot={false}>
          {t(kind?.zh ?? row.kind)}
        </Pill>
        <b className="apc-sum">{row.summary}</b>
        <span className="spacer" />
        <span className="apc-amt num">{amountText(row)}</span>
        <Pill tone={row.status === "approved" ? "jade" : row.status === "rejected" ? "coral" : row.status === "withdrawn" ? "mute" : "accent"}>
          {t(APPROVAL_STATUS[row.status] ?? row.status)}
        </Pill>
      </header>

      <div className="apc-meta">
        <span className="num">{row.requestNo}</span>
        <span>·</span>
        <Link to={hrefOf(row)}>{row.entityLabel}</Link>
        <span>·</span>
        <span>
          {t("由")} {row.requesterName} {t("发起")}
        </span>
        <span>·</span>
        <span>{relativeTime(row.createdAt)}</span>
        {row.status === "pending" && row.waitHours > 48 ? <Pill tone="coral">{t("挂了 {n} 天没人处理", { n: Math.floor(row.waitHours / 24) })}</Pill> : null}
      </div>

      {row.reason ? (
        <p className="apc-reason">
          <Icon name="info" size={13} />
          {row.reason}
        </p>
      ) : null}

      <ol className="apc-steps">
        {row.steps.map((s, i) => (
          <li key={s.approverId + i} data-state={s.state} data-cur={row.status === "pending" && i === row.cursor ? "1" : undefined}>
            <Avatar name={s.approverName} hue={db.users.find((x) => x.id === s.approverId)?.hue ?? 0} size="sm" />
            <div>
              <b>{s.approverName}</b>
              <span className="apc-st">
                {s.state === "approved" ? t("已通过") : s.state === "rejected" ? t("已驳回") : row.status === "pending" && i === row.cursor ? t("待处理") : t("等前一级")}
                {s.at ? ` · ${shortDate(s.at)}` : ""}
              </span>
              {s.comment ? <p className="apc-cmt">{s.comment}</p> : null}
            </div>
          </li>
        ))}
      </ol>

      {row.mine ? (
        <Comment
          busy={false}
          onSubmit={(ok, text) => {
            if (!ok && !text.trim()) {
              toastError(t("驳回要写清楚为什么"));
              return;
            }
            const r = decideApproval(actor, row.id, ok, text);
            if (!r.ok) toastError(r.error);
            else toast(ok ? t("已通过") : t("已驳回"));
          }}
        />
      ) : row.status === "pending" && row.requesterId === viewerId ? (
        <div className="ap-act">
          <span className="muted">{t("等 {who} 处理", { who: row.currentName ?? "—" })}</span>
          <span className="spacer" />
          <button className="btn btn-sm" onClick={() => withdrawApproval(actor, row.id)}>
            {t("撤回")}
          </button>
        </div>
      ) : null}
    </article>
  );
}

export default function ApprovalsPage() {
  const db = useDb();
  const { user } = useAuth();
  const { t } = useT();
  const { get, set } = useParam();
  const viewer = viewerOf(user);
  const q = get("q");
  const view = get("view", "mine");
  const kind = get("kind");

  const all = useMemo(() => listApprovals(db, viewer), [db, viewer]);
  const rows = useMemo(
    () =>
      listApprovals(db, viewer, {
        q,
        kind,
        mine: view === "mine" ? true : undefined,
        status: view === "pending" ? "pending" : view === "done" ? undefined : undefined,
      }).filter((r) => (view === "done" ? r.status !== "pending" : view === "pending" ? r.status === "pending" : true)),
    [db, viewer, q, kind, view],
  );
  const k = approvalKpis(all, viewer);
  const admin = canAdmin(user);

  return (
    <Page
      title={t("审批中心")}
      desc={t("低价单、特价报价、超额度放账、大额付款 · 谁批的、批语是什么都留痕，审计里查得到")}
      kpis={
        <>
          <Kpi icon="check" k={t("待我审")} v={String(k.mine)} s={t("轮到我这一级的")} tone={k.mine ? "amber" : undefined} />
          <Kpi icon="inbox" k={t("全部待审")} v={String(k.pending)} s={t("含还没轮到我的")} />
          <Kpi icon="alert" k={t("挂超 48 小时")} v={String(k.stuck)} s={t("审批最怕的不是慢，是没人看见")} tone={k.stuck ? "coral" : undefined} />
          <Kpi icon="clock" k={t("平均处理")} v={k.avgHours ? `${k.avgHours.toFixed(1)}h` : "—"} s={t("从提交到结案")} />
        </>
      }
      toolbar={
        <>
          <SearchInput value={q} onChange={(v) => set({ q: v })} placeholder={t("搜单号 / 单据 / 发起人…")} />
          <Segmented
            value={view}
            onChange={(v) => set({ view: v })}
            options={[
              { value: "mine", label: t("待我审"), count: k.mine },
              { value: "pending", label: t("全部待审"), count: k.pending },
              { value: "done", label: t("已结案"), count: all.filter((r) => r.status !== "pending").length },
              { value: "all", label: t("全部"), count: all.length },
            ]}
            label={t("视图")}
          />
          <select className="select select-sm" value={kind} onChange={(e) => set({ kind: e.target.value })} aria-label={t("审批类型")}>
            <option value="">{t("全部类型")}</option>
            {Object.entries(APPROVAL_KINDS).map(([k2, v]) => (
              <option key={k2} value={k2}>
                {t(v.zh)}
              </option>
            ))}
          </select>
        </>
      }
    >
      <div className="ap-split">
        <div className="ap-list">
          {rows.length === 0 ? (
            <EmptyState
              icon="check"
              title={view === "mine" ? t("没有等你的审批") : t("没有符合条件的审批")}
              desc={view === "mine" ? t("清空了。别人发起的审批轮到你时，右上角铃铛会响。") : t("换个筛选试试。")}
            />
          ) : (
            rows.map((r) => <Card key={r.id} row={r} viewerId={viewer.id} />)
          )}
        </div>

        <aside className="ap-side">
          <Panel title={t("审批规则")} sub={admin ? t("什么情况下要审、谁来审") : t("只有管理员能改")}>
            <ul className="rules">
              {db.flow.approvalRules.map((r) => {
                const meta = APPROVAL_KINDS[r.kind];
                return (
                  <li key={r.id}>
                    <div className="rule-h">
                      <b>{t(meta?.zh ?? r.kind)}</b>
                      <span className="spacer" />
                      <label className="switch" data-tip={r.enabled ? t("已启用") : t("已停用")}>
                        <input type="checkbox" checked={r.enabled} disabled={!admin} onChange={(e) => patchRule(r.id, { enabled: e.target.checked })} aria-label={t("启用 {name}", { name: t(meta?.zh ?? r.kind) })} />
                        <i />
                      </label>
                    </div>
                    {/* 每条规则自带一句人话说明 —— 阈值的单位随类型而变，
                        不写清楚用户会以为「1100」是一千一百块 */}
                    <p className="rule-why">{t(meta?.why ?? "")}</p>
                    <div className="rule-b">
                      <span className="muted">{t("触发线")}</span>
                      <b className="num">{ruleValue(r.kind, r.threshold)}</b>
                      <span className="spacer" />
                      <span className="muted">{t("审批人")}</span>
                      {/* 头像必须带 hue 和 tooltip：
                          不给 hue 的话所有人都是同一个颜色，两个审批人看着像同一个人；
                          中文名头像只取最后两个字（"陈曦"→陈曦、"魏巍"→魏巍），
                          同姓的人光看头像分不出来，所以悬停出全名 */}
                      <span className="rule-who">
                        {r.approverIds.map((uid) => {
                          const u = db.users.find((x) => x.id === uid);
                          return (
                            <span key={uid} className="who-1" data-tip={`${u?.name ?? "?"} · ${t(ROLE_LABEL[u?.role ?? "viewer"] ?? "")}`}>
                              <Avatar name={u?.name ?? "?"} hue={u?.hue ?? 0} size="sm" />
                            </span>
                          );
                        })}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>
          <Panel title={t("我发起的")} sub={t("{n} 笔", { n: k.byMe })}>
            {k.byMe === 0 ? (
              <p className="muted">{t("还没发起过审批。利润率低于红线的单子在保存时会提示送审。")}</p>
            ) : (
              <ul className="mini-list">
                {all
                  .filter((r) => r.requesterId === viewer.id)
                  .slice(0, 8)
                  .map((r) => (
                    <li key={r.id}>
                      <span className="num">{r.requestNo}</span>
                      <span className="truncate">{r.entityLabel}</span>
                      <span className="spacer" />
                      <Pill tone={r.status === "approved" ? "jade" : r.status === "rejected" ? "coral" : "accent"} dot={false}>
                        {t(APPROVAL_STATUS[r.status] ?? r.status)}
                      </Pill>
                    </li>
                  ))}
              </ul>
            )}
          </Panel>
        </aside>
      </div>
    </Page>
  );
}
