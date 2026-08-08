/**
 * 客户的联系人与往来沟通。
 *
 * ── 老板掏钱买的其实是这一块 ──
 * "业务员离职，客户带不走"——靠的不是加密，是**往来记录在公司的库里**。
 * 只要报价、索赔、变更确认这几封关键的往来在系统里，接手的人就能接上。
 *
 * ── 为什么是手工归档，不是邮箱同步 ──
 * 真正的 IMAP 同步要常驻服务和 OAuth，纯静态站没有落脚点。
 * 但数据结构是**按同步设计的**（direction / at / externalId 都是邮件协议那套），
 * 将来接上 IMAP，这张表原样接收，这个界面一行都不用改。
 * 在那之前，"把最关键的那几封粘进来"覆盖的正是最该留下的部分。
 */

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/ui/Modal";
import { Field, Pill } from "@/components/ui/bits";
import { toast, toastError } from "@/components/ui/Toast";
import { useAuth } from "@/auth/AuthProvider";
import { useDb } from "@/data/DataProvider";
import { listMessages } from "@/data/flow-queries";
import { deleteMessage, logMessage } from "@/data/flow-mutations";
import { MSG_CHANNELS } from "@/data/flow-types";
import { useTextField } from "@/lib/hooks";
import { relativeTime, shortDate } from "@/lib/format";
import { useT } from "@/i18n";

function Text({ value, onChange, label, placeholder }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string }) {
  const f = useTextField(value, onChange);
  return <input className="input" value={f.value} onChange={f.onChange} onCompositionStart={f.onCompositionStart} onCompositionEnd={f.onCompositionEnd} aria-label={label} placeholder={placeholder} />;
}

function Area({ value, onChange, label, placeholder, rows = 7 }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string; rows?: number }) {
  const f = useTextField(value, onChange);
  return <textarea className="input" rows={rows} value={f.value} onChange={f.onChange} onCompositionStart={f.onCompositionStart} onCompositionEnd={f.onCompositionEnd} aria-label={label} placeholder={placeholder} />;
}

/** 邮件正文里第一行常常是主题行，粘进来时顺手抽出来当标题 */
function guessSubject(body: string) {
  const line = body.split(/\r?\n/).find((l) => l.trim());
  if (!line) return "";
  const m = /^(?:subject|主题)\s*[:：]\s*(.+)$/i.exec(line.trim());
  return (m ? m[1] : line).trim().slice(0, 90);
}

export function CustomerContacts({ customerId }: { customerId: string }) {
  const db = useDb();
  const { t } = useT();
  const rows = db.contacts.filter((c) => c.customerId === customerId);

  return (
    <section className="card">
      <div className="card-head">
        <h3>{t("联系人")}</h3>
        <span className="card-sub">{t("报价发给采购、对账发给财务、到货通知发给仓库")}</span>
      </div>
      <div className="card-body">
        {rows.length === 0 ? (
          <p className="muted">{t("还没有联系人。")}</p>
        ) : (
          <ul className="contacts">
            {rows.map((c) => (
              <li key={c.id}>
                <div className="ct-main">
                  <b>
                    {c.name}
                    {c.primary ? (
                      <Pill tone="accent" dot={false} className="ml4">
                        {t("主")}
                      </Pill>
                    ) : null}
                  </b>
                  <span className="cell-sub">
                    <span>{t(c.duty)}</span>
                    {c.title ? (
                      <>
                        <span>·</span>
                        <span>{c.title}</span>
                      </>
                    ) : null}
                  </span>
                  {c.note ? <span className="cell-sub">{c.note}</span> : null}
                </div>
                <div className="ct-reach">
                  {c.email ? (
                    <a href={`mailto:${c.email}`}>
                      <Icon name="mail" size={12} />
                      {c.email}
                    </a>
                  ) : null}
                  {c.im ? (
                    <span>
                      <Icon name="users" size={12} />
                      {c.im}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function CustomerMessages({ customerId, customerName }: { customerId: string; customerName: string }) {
  const db = useDb();
  const { user } = useAuth();
  const { t } = useT();
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ channel: "邮件", direction: "in" as "in" | "out", subject: "", body: "", party: "" });
  const rows = useMemo(() => listMessages(db, { customerId }), [db, customerId]);
  const actor = { id: user?.id ?? null, name: user?.name ?? "—" };

  return (
    <section className="card">
      <div className="card-head">
        <h3>{t("往来沟通")}</h3>
        <span className="card-sub">{t("{n} 条 · 人走了记录留下", { n: rows.length })}</span>
        <span className="spacer" />
        <button className="btn btn-sm" onClick={() => setAdding(true)}>
          <Icon name="plus" size={13} />
          {t("归档一封")}
        </button>
      </div>
      <div className="card-body">
        {rows.length === 0 ? (
          <p className="muted">{t("还没有往来记录。把关键的那几封（报价、索赔、变更确认）粘进来。")}</p>
        ) : (
          <ol className="msgs">
            {rows.map((m) => (
              <li key={m.id} data-dir={m.direction}>
                <span className="msg-dir" data-dir={m.direction} data-tip={m.direction === "in" ? t("客户发来") : t("我们发出")}>
                  <Icon name={m.direction === "in" ? "arrowDown" : "arrowUp"} size={12} />
                </span>
                <div className="msg-main">
                  <div className="msg-head">
                    <b className="truncate">{m.subject}</b>
                    <Pill tone="mute" dot={false}>
                      {t(m.channel)}
                    </Pill>
                    <span className="spacer" />
                    <span className="muted">{shortDate(m.at)}</span>
                    <button className="icon-btn danger" aria-label={t("删除这条")} data-tip={t("删除这条")} onClick={() => deleteMessage(m.id)}>
                      <Icon name="trash" size={12} />
                    </button>
                  </div>
                  <p className="msg-body">{m.body}</p>
                  <div className="cell-sub">
                    <span>{m.direction === "in" ? m.party : m.userName}</span>
                    <span>→</span>
                    <span>{m.direction === "in" ? m.userName : m.party}</span>
                    <span>·</span>
                    <span>{relativeTime(m.at)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <Modal
        open={adding}
        title={t("归档一封往来")}
        width={620}
        onClose={() => setAdding(false)}
        footer={
          <>
            <button className="btn" onClick={() => setAdding(false)}>
              {t("取消")}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                if (!f.body.trim()) {
                  toastError(t("正文不能为空"));
                  return;
                }
                logMessage(actor, {
                  customerId,
                  entity: null,
                  entityId: null,
                  channel: f.channel,
                  direction: f.direction,
                  subject: f.subject.trim() || guessSubject(f.body),
                  body: f.body.trim(),
                  party: f.party.trim() || customerName,
                  at: new Date().toISOString(),
                });
                setF({ channel: "邮件", direction: "in", subject: "", body: "", party: "" });
                setAdding(false);
                toast(t("已归档"));
              }}
            >
              {t("归档")}
            </button>
          </>
        }
      >
        {/* 说清楚为什么值得花这一分钟 —— 否则没人会去粘 */}
        <p className="modal-lead">{t("邮箱同步要服务端，这个版本还没有。但把关键的那几封粘进来，业务员离职时客户往来就不会跟着走 —— 那才是这件事的意义。")}</p>
        <div className="form-grid">
          <Field label={t("方向")}>
            <select className="select" value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value as "in" | "out" })}>
              <option value="in">{t("客户发来")}</option>
              <option value="out">{t("我们发出")}</option>
            </select>
          </Field>
          <Field label={t("渠道")}>
            <select className="select" value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}>
              {MSG_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {t(c)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("对方是谁")} hint={t("留空就用客户名")}>
            <Text value={f.party} onChange={(v) => setF({ ...f, party: v })} label={t("对方")} />
          </Field>
          <Field label={t("主题")} hint={t("留空就从正文第一行取")}>
            <Text value={f.subject} onChange={(v) => setF({ ...f, subject: v })} label={t("主题")} />
          </Field>
        </div>
        <Field label={t("正文")} hint={t("从邮箱里整段复制粘贴即可")}>
          <Area value={f.body} onChange={(v) => setF({ ...f, body: v })} label={t("正文")} />
        </Field>
      </Modal>
    </section>
  );
}
