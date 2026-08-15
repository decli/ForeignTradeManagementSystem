/**
 * 设置页的三块：备份与回滚 / 协同状态 / 自定义字段。
 *
 * 单独一个文件，Settings.tsx 已经够长了。
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/ui/Modal";
import { Field, Pill } from "@/components/ui/bits";
import { toast, toastError } from "@/components/ui/Toast";
import { ImportWizard } from "@/components/ImportWizard";
import { useDb } from "@/data/DataProvider";
import { restoreSnapshot, snapshot, switchProfile } from "@/data/db";
import { track } from "@/lib/analytics";
import { isDemo } from "@/data/profile";
import { dropSnapshot, listSnapshots, readSnapshot, storageEstimate, takeSnapshot, type SnapshotMeta } from "@/data/backup";
import { requestPersist } from "@/data/idb";
import { syncStatus, watchSync } from "@/data/sync";
import { EXPORT_STALE_DAYS, QUOTA_WARN, readStorageHealth, type StorageHealth } from "@/lib/storage-health";
import { addCustomField, patchCustomField, removeCustomField } from "@/data/flow-mutations";
import { CF_ENTITIES, CF_TYPES } from "@/data/flow-types";
import { canAdmin } from "@/lib/perms";
import { useTextField } from "@/lib/hooks";
import { relativeTime } from "@/lib/format";
import { formatBytes } from "@/data/files";
import { useAuth } from "@/auth/AuthProvider";
import { useT } from "@/i18n";

/**
 * 备份在列表里怎么称呼。
 *
 * 迁移备份的键带时间戳（`snap_migrate-2026-...`），直接剥掉前缀会露出一串
 * 机器码。而它恰恰是最需要被认出来的一份 —— 用户来找的就是"升级之前那个样子"。
 */
function snapLabel(m: SnapshotMeta) {
  if (m.by === "migrate") return m.at.slice(0, 16).replace("T", " ");
  return m.key.replace("snap_", "");
}

const SNAP_BY: Record<string, string> = { auto: "自动", manual: "手动", migrate: "升级前" };

function Text({ value, onChange, label, placeholder }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string }) {
  const f = useTextField(value, onChange);
  return (
    <input className="input" value={f.value} onChange={f.onChange} onCompositionStart={f.onCompositionStart} onCompositionEnd={f.onCompositionEnd} aria-label={label} placeholder={placeholder} />
  );
}

/* ═══════════════════ 账套切换 ═══════════════════ */

/**
 * 演示账套 ↔ 我的账套。
 *
 * 刻意**不做**「清空演示数据」那种一次性的破坏动作 —— 两套各存各的，
 * 随时来回，谁也不覆盖谁。用户第一次点「我的账套」时心里是打鼓的，
 * 所以这里要明确写出"演示数据原样留着，随时切回来"。
 */
export function ProfileSection() {
  const { t } = useT();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const demo = isDemo();

  const go = async (next: "demo" | "live") => {
    if (next === (demo ? "demo" : "live")) return;
    setBusy(true);
    /* 从演示切到「我的账套」＝ 访客决定拿它录真数据。
       这是这个站上最接近「转化」的一个动作，值得单独一个事件。 */
    track("switch_profile", { to: next });
    await switchProfile(next, user?.id ?? null);
  };

  return (
    <section className="card">
      <div className="card-head">
        <h3>{t("账套")}</h3>
        <span className="card-sub">{t("演示和真实数据分开存，互不覆盖")}</span>
        <span className="spacer" />
        <Pill tone={demo ? "amber" : "jade"} dot={false}>
          {demo ? t("正在用：演示数据") : t("正在用：我的账套")}
        </Pill>
      </div>
      <div className="card-body">
        <p className="setting-note">
          {t("两套数据存在不同的地方。切换不会删任何东西 —— 想回来看样例、给同事演示，随时切回演示账套。")}
        </p>

        <div className="setting">
          <div className="setting-t">
            <b>{t("演示账套")}</b>
            <small>{t("24 个客户、63 张 PI 的完整样例，用来摸清流程和试功能。改坏了也不要紧，随时可以重灌。")}</small>
          </div>
          <button className="btn" disabled={busy || demo} onClick={() => void go("demo")}>
            {demo ? t("使用中") : t("切过去")}
          </button>
        </div>

        <div className="setting">
          <div className="setting-t">
            <b>{t("我的账套")}</b>
            <small>
              {t("从空白开始录真实业务。第一次进去会带上你这个账号（管理员）和汇率设置，其余全空 —— 看板上会有四步引导。")}
            </small>
          </div>
          <button className="btn btn-primary" disabled={busy || !demo} onClick={() => void go("live")}>
            {demo ? t("开始用我的账套") : t("使用中")}
          </button>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════ 存储健康 ═══════════════════ */

/**
 * 账套存在浏览器里这件事，用户有权知道它有多脆。
 *
 * 三行都是**实测值**，不是承诺：持久化到底给没给、配额用了多少、
 * 上次导出是什么时候。尤其是持久化 —— 各家浏览器给不给、什么条件给
 * 都不一样，与其解释一堆，不如把真实结果摆出来。
 */
export function StorageSection() {
  const { t } = useT();
  const db = useDb();
  const [health, setHealth] = useState<StorageHealth | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => setHealth(await readStorageHealth(db.lastExportAt ?? null));
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.lastExportAt]);

  const persistLabel =
    health?.persisted === true
      ? t("已授予")
      : health?.persisted === false
        ? t("未授予")
        : t("此浏览器不支持");
  const persistTone = health?.persisted === true ? "jade" : health?.persisted === false ? "amber" : "mute";

  return (
    <section className="card">
      <div className="card-head">
        <h3>{t("存储健康")}</h3>
        <span className="card-sub">{t("账套存在这台机器的浏览器里")}</span>
        <span className="spacer" />
        {health?.atRisk ? (
          <Pill tone="amber" dot={false}>
            {t("需要注意")}
          </Pill>
        ) : null}
      </div>
      <div className="card-body">
        <div className="setting">
          <div className="setting-t">
            <b>{t("持久化存储")}</b>
            <small>
              {health?.persisted === true
                ? t("浏览器不会在空间紧张时自动清掉这个站点的数据。但手动清除站点数据、换电脑、硬盘坏依然会丢 —— 导出文件才是真正的保险。")
                : health?.persisted === false
                  ? t("浏览器可以在空间紧张时随时清掉本站数据；Safari 更是 7 天不访问就清。点右边申请一次，通过与否由浏览器决定。")
                  : t("这个浏览器没有提供持久化存储的开关，只能靠定期导出来兜底。")}
            </small>
          </div>
          <Pill tone={persistTone} dot={false}>
            {persistLabel}
          </Pill>
          {health?.persisted === false ? (
            <button
              className="btn"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const ok = await requestPersist();
                await refresh();
                setBusy(false);
                // 申请被拒不是错误，是浏览器的正常判断，别用红色报错吓人
                if (ok) toast(t("已获得持久化存储"));
                else toast(t("浏览器暂时没有授予。多用几次、或把本站加入书签后再试"));
              }}
            >
              {t("申请")}
            </button>
          ) : null}
        </div>

        <div className="setting">
          <div className="setting-t">
            <b>{t("已用空间")}</b>
            <small>{t("附件本体和备份快照都占这里的配额，写满之后备份会静默失败")}</small>
          </div>
          <Pill tone={health && health.usedRatio != null && health.usedRatio > QUOTA_WARN ? "amber" : "mute"} dot={false}>
            {health
              ? health.quota
                ? t("{u} / {q}", { u: formatBytes(health.used), q: formatBytes(health.quota) })
                : formatBytes(health.used)
              : "—"}
          </Pill>
        </div>

        <div className="setting">
          <div className="setting-t">
            <b>{t("上次导出")}</b>
            <small>{t("本地备份挡不住换电脑和清空站点数据，导出的 JSON 文件才挡得住。建议每周一次存到网盘。")}</small>
          </div>
          <Pill tone={health?.lastExportAt ? ((health.daysSinceExport ?? 0) > EXPORT_STALE_DAYS ? "amber" : "jade") : "coral"} dot={false}>
            {health?.lastExportAt ? relativeTime(health.lastExportAt) : t("从未导出")}
          </Pill>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════ 备份与回滚 ═══════════════════ */

export function BackupSection() {
  const { t } = useT();
  const [snaps, setSnaps] = useState<SnapshotMeta[]>([]);
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<SnapshotMeta | null>(null);

  const refresh = async () => {
    setSnaps(await listSnapshots());
    setUsage(await storageEstimate());
  };
  useEffect(() => {
    void refresh();
  }, []);

  return (
    <section className="card">
      <div className="card-head">
        <h3>{t("本地备份")}</h3>
        <span className="card-sub">{t("每天自动留一份，最多 7 份")}</span>
        <span className="spacer" />
        {usage ? (
          <Pill tone={usage.quota && usage.used / usage.quota > 0.8 ? "amber" : "mute"} dot={false}>
            {t("已用 {u} / {q}", { u: formatBytes(usage.used), q: formatBytes(usage.quota) })}
          </Pill>
        ) : null}
      </div>
      <div className="card-body">
        {/* 这一段不是免责声明，是操作建议。本地备份挡不住换电脑和清数据 */}
        <p className="setting-note">
          {t("备份存在这台机器的浏览器里，挡得住误删和导错；挡不住换电脑、清空站点数据、硬盘坏。重要账套请定期「导出 JSON」存到网盘。")}
        </p>

        <div className="setting">
          <div className="setting-t">
            <b>{t("立即备份一份")}</b>
            <small>{t("同一天重复点会覆盖当天那份 —— 保留的是 7 个不同的日子，不是最近 7 次操作")}</small>
          </div>
          <button
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await takeSnapshot(snapshot(), "manual");
                await refresh();
                toast(t("已备份"));
              } catch {
                toastError(t("备份失败，可能是浏览器存储空间不够"));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Icon name="database" size={14} />
            {t("备份")}
          </button>
        </div>

        {snaps.length === 0 ? (
          <p className="muted">{t("还没有备份。下次打开系统时会自动备一份。")}</p>
        ) : (
          <ul className="snaps">
            {snaps.map((s) => (
              <li key={s.key}>
                <span className="snap-when">
                  <b>{snapLabel(s)}</b>
                  <i>{relativeTime(s.at)}</i>
                </span>
                <span className="snap-n">
                  {t("{p} 张 PI · {s} 个批次 · {c} 个客户", { p: s.counts.pis, s: s.counts.shipments, c: s.counts.customers })}
                </span>
                {/* 「升级前」要醒目：用户来翻备份列表，多半就是为了找它 */}
                <Pill tone={s.by === "migrate" ? "amber" : "mute"} dot={false}>
                  {t(SNAP_BY[s.by] ?? s.by)}
                  {s.by === "migrate" && s.fromVersion != null ? ` v${s.fromVersion}` : ""}
                </Pill>
                <span className="spacer" />
                <span className="muted num">{formatBytes(s.bytes)}</span>
                <button className="btn btn-sm" onClick={() => setConfirming(s)}>
                  {t("回滚到这里")}
                </button>
                <button
                  className="icon-btn danger"
                  aria-label={t("删除这份备份")}
                  data-tip={t("删除这份备份")}
                  onClick={async () => {
                    await dropSnapshot(s.key);
                    await refresh();
                  }}
                >
                  <Icon name="trash" size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={!!confirming}
        title={t("回滚账套")}
        onClose={() => setConfirming(null)}
        footer={
          <>
            <button className="btn" onClick={() => setConfirming(null)}>
              {t("取消")}
            </button>
            <button
              className="btn btn-danger"
              onClick={async () => {
                if (!confirming) return;
                const db = await readSnapshot(confirming.key);
                if (!db) {
                  toastError(t("这份备份读不出来了"));
                  return;
                }
                await restoreSnapshot(db);
                setConfirming(null);
                await refresh();
                toast(t("已回滚到 {d}，当前状态也备了一份", { d: snapLabel(confirming) }));
              }}
            >
              {t("确认回滚")}
            </button>
          </>
        }
      >
        <p className="modal-lead">
          {t("会把整个账套换成 {d} 那一份。之后所有的改动都会消失。", { d: confirming ? snapLabel(confirming) : "" })}
        </p>
        {/* 回滚前自动再备一份 —— 用户点回滚往往是慌的，回错了还得能回来 */}
        <p className="modal-lead">{t("放心：回滚之前系统会先把**当前状态**也备一份，回错了还能再回来。")}</p>
      </Modal>
    </section>
  );
}

/* ═══════════════════ 协同 ═══════════════════ */

export function SyncSection() {
  const { t } = useT();
  const [, bump] = useState(0);
  useEffect(() => {
    const off = watchSync(() => bump((n) => n + 1));
    return () => {
      off();
    };
  }, []);
  const st = syncStatus();

  return (
    <section className="card">
      <div className="card-head">
        <h3>{t("协同")}</h3>
        <span className="spacer" />
        <Pill tone={st.peers > 0 ? "jade" : "mute"}>
          {st.mode === "tabs" ? t("本机多标签页") : st.mode === "remote" ? t("已接后端") : t("仅本机")}
        </Pill>
      </div>
      <div className="card-body">
        <div className="setting">
          <div className="setting-t">
            <b>{t("同一台机器的多个标签页实时同步")}</b>
            <small>{t("在另一个标签页里改一张单，这边立刻就变。开两个窗口试试。")}</small>
          </div>
          <span className="num">{t("{n} 个对端在线", { n: st.peers })}</span>
        </div>

        {/* 说清楚做得到什么、做不到什么。含糊其辞比直说更伤信任 */}
        <p className="setting-note">
          {t("这个版本部署在纯静态托管上，没有服务端，所以还做不到「多台电脑看同一份数据」。但协同的机制（别人改了我要知道、无缝接过来、冲突有说得清的规则）已经跑通了 —— 换成后端时替换的只是「消息从哪来」，上层一行都不用动。接口见 src/data/sync.ts。")}
        </p>
        <ul className="sync-facts">
          <li>
            <Icon name="check" size={13} />
            {t("裁决规则：最后写入者胜。同一个人开几个标签页够用；真到多人并发要换成 op 级合并。")}
          </li>
          <li>
            <Icon name="check" size={13} />
            {t("最近收到变更：{t}", { t: st.lastInAt ? relativeTime(st.lastInAt) : t("还没有") })}
          </li>
          <li>
            <Icon name="check" size={13} />
            {t("最近发出变更：{t}", { t: st.lastOutAt ? relativeTime(st.lastOutAt) : t("还没有") })}
          </li>
        </ul>
      </div>
    </section>
  );
}

/* ═══════════════════ 自定义字段 ═══════════════════ */

export function CustomFieldSection() {
  const db = useDb();
  const { user } = useAuth();
  const { t } = useT();
  const admin = canAdmin(user);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ entity: "customer", key: "", label: "", type: "text", options: "", inList: false });

  return (
    <section className="card">
      <div className="card-head">
        <h3>{t("自定义字段")}</h3>
        <span className="card-sub">{t("每家公司总有两三个自己的字段")}</span>
        <span className="spacer" />
        {admin ? (
          <button className="btn btn-sm" onClick={() => setAdding(true)}>
            <Icon name="plus" size={13} />
            {t("加一个")}
          </button>
        ) : null}
      </div>
      <div className="card-body">
        {db.flow.customFields.length === 0 ? (
          <p className="muted">{t("还没有自定义字段。")}</p>
        ) : (
          <ul className="cfs">
            {db.flow.customFields.map((cf) => (
              <li key={cf.id}>
                <Pill tone="mute" dot={false}>
                  {t(CF_ENTITIES[cf.entity] ?? cf.entity)}
                </Pill>
                <div className="cf-main">
                  <b>{cf.label}</b>
                  <span className="cell-sub">
                    <span className="num">{cf.key}</span>
                    <span>·</span>
                    <span>{t(CF_TYPES[cf.type] ?? cf.type)}</span>
                    {cf.options.length ? (
                      <>
                        <span>·</span>
                        <span>{cf.options.join(" / ")}</span>
                      </>
                    ) : null}
                  </span>
                  {cf.hint ? <span className="cell-sub">{cf.hint}</span> : null}
                </div>
                <label className="switch" data-tip={t("显示在列表页")}>
                  <input type="checkbox" checked={cf.inList} disabled={!admin} onChange={(e) => patchCustomField(cf.id, { inList: e.target.checked })} aria-label={t("显示在列表页")} />
                  <i />
                </label>
                {admin ? (
                  <button className="icon-btn danger" aria-label={t("删除字段")} data-tip={t("删掉定义，已经填过的值还留在数据里")} onClick={() => removeCustomField(cf.id)}>
                    <Icon name="trash" size={13} />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={adding}
        title={t("加一个自定义字段")}
        onClose={() => setAdding(false)}
        footer={
          <>
            <button className="btn" onClick={() => setAdding(false)}>
              {t("取消")}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                if (!/^[a-z][a-z0-9_]*$/.test(f.key)) {
                  toastError(t("键只能用小写字母、数字和下划线，且以字母开头"));
                  return;
                }
                if (!f.label.trim()) {
                  toastError(t("标签不能为空"));
                  return;
                }
                const r = addCustomField({
                  entity: f.entity,
                  key: f.key,
                  label: f.label.trim(),
                  labelEn: null,
                  type: f.type,
                  options: f.type === "select" ? f.options.split(/[,，\s]+/).filter(Boolean) : [],
                  required: false,
                  inList: f.inList,
                  order: db.flow.customFields.length + 1,
                  hint: null,
                });
                if (!r.ok) {
                  toastError(r.error);
                  return;
                }
                setAdding(false);
                setF({ entity: "customer", key: "", label: "", type: "text", options: "", inList: false });
                toast(t("字段已加上"));
              }}
            >
              {t("添加")}
            </button>
          </>
        }
      >
        <div className="form-grid">
          <Field label={t("挂在哪张表")}>
            <select className="select" value={f.entity} onChange={(e) => setF({ ...f, entity: e.target.value })}>
              {Object.entries(CF_ENTITIES).map(([k, v]) => (
                <option key={k} value={k}>
                  {t(v)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("类型")}>
            <select className="select" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              {Object.entries(CF_TYPES).map(([k, v]) => (
                <option key={k} value={k}>
                  {t(v)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("显示名")}>
            <Text value={f.label} onChange={(v) => setF({ ...f, label: v })} label={t("显示名")} placeholder={t("例：客户来源")} />
          </Field>
          {/* 键定了就不给改：改了历史值全对不上，而旧值还躺在数据里 */}
          <Field label={t("键")} hint={t("存进数据里的名字，定了就不能改")}>
            <input className="input num" value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} placeholder="lead_source" aria-label={t("键")} />
          </Field>
        </div>
        {f.type === "select" ? (
          <Field label={t("选项")} hint={t("用逗号或空格分开")}>
            <Text value={f.options} onChange={(v) => setF({ ...f, options: v })} label={t("选项")} placeholder={t("阿里国际站, 展会, 客户介绍")} />
          </Field>
        ) : null}
      </Modal>
    </section>
  );
}

/* ═══════════════════ 导入向导入口 ═══════════════════ */

export function ImportSection() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [params, setParams] = useSearchParams();

  /* 档案页（客户 / 产品 / 供应商）在一条数据都还没有的时候，会把人指到这里来 ——
     `/settings?import=customer`。带着参数进来就直接把向导开在那张表上：
     让人自己在设置页里翻到「从 Excel 导入」再选一次表，等于把刚才那句
     「去这儿导入」又还给了他一半。 */
  const deep = params.get("import");
  useEffect(() => {
    if (!deep) return;
    setOpen(true);
    // 参数用完就抹掉，否则关掉向导再刷新又会弹出来
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.delete("import");
      return next;
    }, { replace: true });
  }, [deep, setParams]);

  return (
    <>
      <div className="setting">
        <div className="setting-t">
          <b>{t("从 Excel 导入")}</b>
          <small>{t("期初建账用。客户 / 产品 / 供应商三张表，可以直接从 Excel 粘贴，导入前会先试运行给你看要发生什么")}</small>
        </div>
        <button className="btn" onClick={() => setOpen(true)}>
          <Icon name="upload" />
          {t("导入向导")}
        </button>
      </div>
      <ImportWizard open={open} onClose={() => setOpen(false)} initialTarget={deep ?? undefined} />
    </>
  );
}
