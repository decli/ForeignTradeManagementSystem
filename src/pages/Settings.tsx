import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { toast, toastError } from "@/components/ui/Toast";
import { Field, Pill, Segmented } from "@/components/ui/bits";
import { BRAND, copyright } from "@/components/Brand";
import { MailOwner } from "@/components/Copyright";
import { analyticsState } from "@/lib/analytics";
import { changePassword } from "@/auth/accounts";
import { ROLE_LABEL, SCOPE_LABEL, useAuth } from "@/auth/AuthProvider";
import { googleConfigured, GOOGLE_CLIENT_ID } from "@/auth/google";
import { useDb } from "@/data/DataProvider";
import { useT } from "@/i18n";
import { clearAll, exportJson, importJson, isPersistent, markExported, resetToSeed } from "@/data/db";
import { setCustomRate } from "@/data/mutations";
import { customRate, marketRate } from "@/data/queries";
import { useDensity, useTheme, type Density, type Theme } from "@/lib/theme";
import { BackupSection, CustomFieldSection, ImportSection, ProfileSection, StorageSection, SyncSection } from "@/components/settings/DataOps";

export default function Settings() {
  const { t } = useT();
  const db = useDb();
  const { user, displayName, session, can } = useAuth();
  const { theme, setTheme } = useTheme();
  const [density, setDensity] = useDensity();
  const [rate, setRate] = useState(() => customRate(db).toFixed(4));
  const fileRef = useRef<HTMLInputElement>(null);

  const stats = {
    客户: db.customers.length,
    PI: db.pis.length,
    出运批次: db.shipments.filter((s) => !s.archived).length,
    里程碑: db.milestones.length,
    动态: db.notes.length,
    退税发票: db.taxInvoices.length,
    留痕: db.auditLogs.length,
  };

  const download = () => {
    const blob = new Blob([exportJson()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `tradeflow_账套_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    markExported();
    toast("账套已导出（不含登录凭据）");
  };

  const upload = async (file: File) => {
    try {
      await importJson(await file.text());
      toast("账套已导入");
    } catch (e) {
      toastError(e instanceof Error ? e.message : t("导入失败"));
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t("系统设置")}</h1>
          <p>{t("外观、表格密度、账套数据与本地账号 —— 全部只影响这台设备")}</p>
        </div>
      </div>

      <div style={{ display: "grid", gap: 16, maxWidth: 880 }}>
        <section className="card">
          <div className="card-head">
            <h3>{t("外观")}</h3>
          </div>
          <div className="card-body" style={{ paddingBlock: 4 }}>
            <div className="setting">
              <div className="setting-t">
                <b>{t("主题")}</b>
                <small>{t("跟随系统会随你的操作系统在日夜之间自动切换")}</small>
              </div>
              <Segmented<Theme>
                value={theme}
                onChange={setTheme}
                size="lg"
                options={[
                  { value: "light", label: t("浅色") },
                  { value: "dark", label: t("深色") },
                  { value: "system", label: t("跟随系统") },
                ]}
                label={t("主题")}
              />
            </div>
            <div className="setting">
              <div className="setting-t">
                <b>{t("表格密度")}</b>
                <small>{t("紧凑一屏能多看十几行；宽松适合长时间盯着改")}</small>
              </div>
              <Segmented<Density>
                value={density}
                onChange={setDensity}
                size="lg"
                options={[
                  { value: "compact", label: t("紧凑") },
                  { value: "default", label: t("标准") },
                  { value: "cozy", label: t("宽松") },
                ]}
                label={t("表格密度")}
              />
            </div>
            <div className="setting">
              <div className="setting-t">
                <b>{t("恢复表格布局")}</b>
                <small>{t("清掉所有列宽、隐藏列、排序与每页行数的记忆")}</small>
              </div>
              <button
                className="btn"
                onClick={() => {
                  for (const k of Object.keys(localStorage)) {
                    if (k.startsWith("mt.grid.") || k.startsWith("mt.drawer.")) localStorage.removeItem(k);
                  }
                  toast("表格布局已恢复默认，刷新后生效");
                }}
              >
                <Icon name="refresh" />
                {t("恢复默认")}
              </button>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h3>{t("汇率")}</h3>
            <span className="spacer" />
            <span className="muted" style={{ fontSize: "var(--fs-sm)" }}>{t("市场汇率 {r}（演示值，不联网）", { r: marketRate(db).toFixed(4) })}</span>
          </div>
          <div className="card-body" style={{ paddingBlock: 4 }}>
            <div className="setting">
              <div className="setting-t">
                <b>{t("自定汇率 USD → CNY")}</b>
                <small>{t("订单核算与看板把人民币单折算成美元口径时用的就是这个数")}</small>
              </div>
              <div className="row">
                <input className="input num" value={rate} onChange={(e) => setRate(e.target.value)} style={{ width: 120 }} inputMode="decimal" aria-label={t("自定汇率")} />
                <button
                  className="btn"
                  disabled={!can("finance")}
                  onClick={() => {
                    const v = Number(rate);
                    if (!Number.isFinite(v) || v <= 0) {
                      toastError("汇率得是个正数");
                      return;
                    }
                    setCustomRate({ id: user?.id ?? null, name: user?.name ?? "—" }, v);
                    toast(t("自定汇率已改为 {v}", { v }));
                  }}
                >
                  {t("保存")}
                </button>
              </div>
            </div>
            {!can("finance") ? (
              <p className="muted" style={{ fontSize: "var(--fs-sm)", paddingBottom: 12 }}>
                {t("只有财务和管理员能改汇率。当前身份是{role}。", { role: user ? t(ROLE_LABEL[user.role]) : t("访客") })}
              </p>
            ) : null}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h3>{t("账套数据")}</h3>
            <span className="spacer" />
            {/* 说的是"存下来了"，跟「存储健康」里那个浏览器授权的「持久化存储」不是一回事。
                两处都叫"持久化"会让人以为自相矛盾，这里改口径明确的说法 */}
            <Pill tone={isPersistent() ? "jade" : "amber"}>{isPersistent() ? t("已存入本机 IndexedDB") : t("浏览器禁用了存储 · 仅本次会话有效")}</Pill>
          </div>
          <div className="card-body">
            <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
              {Object.entries(stats).map(([k, v]) => (
                <span className="tag" key={k} style={{ height: 24, fontSize: "var(--fs-sm)" }}>
                  {t(k)} <b className="num" style={{ marginLeft: 4, color: "var(--text)" }}>{v}</b>
                </span>
              ))}
            </div>

            <div className="setting">
              <div className="setting-t">
                <b>{t("导出 / 导入")}</b>
                <small>{t("整份账套是一个 JSON。导出的文件不含登录凭据，可以放心传给同事")}</small>
              </div>
              <div className="row">
                <button className="btn" onClick={download}>
                  <Icon name="download" />
                  {t("导出 JSON")}
                </button>
                <button className="btn" onClick={() => fileRef.current?.click()}>
                  <Icon name="upload" />
                  {t("导入 JSON")}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>

            <ImportSection />

            <div className="setting">
              <div className="setting-t">
                <b>{t("重置演示数据")}</b>
                <small>{t("把账套恢复成出厂状态。你改过的动态、批量更新、关联都会消失")}</small>
              </div>
              <button
                className="btn btn-danger"
                onClick={() => {
                  if (!confirm("确定要把账套恢复成出厂状态吗？这一步不能撤销。")) return;
                  void resetToSeed().then(() => toast("演示数据已重灌"));
                }}
              >
                <Icon name="refresh" />
                {t("重灌演示数据")}
              </button>
            </div>

            <div className="setting">
              <div className="setting-t">
                <b>{t("清空本机数据")}</b>
                <small>{t("删掉 IndexedDB 里的整份账套，包括本地注册的账号")}</small>
              </div>
              <button
                className="btn btn-danger"
                onClick={() => {
                  if (!confirm("清空后本机不再保留任何数据，确定吗？")) return;
                  void clearAll().then(() => toast("已清空并重新灌入演示数据"));
                }}
              >
                <Icon name="trash" />
                {t("清空")}
              </button>
            </div>
          </div>
        </section>

        <ProfileSection />
        <StorageSection />
        <BackupSection />
        <SyncSection />
        <CustomFieldSection />

        <section className="card">
          <div className="card-head">
            <h3>{t("登录与账号")}</h3>
          </div>
          <div className="card-body" style={{ paddingBlock: 4 }}>
            <div className="setting">
              <div className="setting-t">
                <b>{t("当前身份")}</b>
                <small>
                  {displayName} · {user ? `${t(ROLE_LABEL[user.role])} · ${t(SCOPE_LABEL[user.scope])}` : "—"} ·{" "}
                  {session?.kind === "google" ? t("Google 账号") : session?.kind === "password" ? t("账密登录") : t("演示身份")}
                </small>
              </div>
              <Pill tone={user?.role === "viewer" ? "mute" : "accent"}>{user ? t(ROLE_LABEL[user.role]) : t("访客")}</Pill>
            </div>

            <div className="setting">
              <div className="setting-t">
                <b>{t("Google 单点登录")}</b>
                <small>
                  {googleConfigured()
                    ? t("已配置：{id}…", { id: GOOGLE_CLIENT_ID.slice(0, 18) })
                    : t("未配置。给构建加上 VITE_GOOGLE_CLIENT_ID，登录页就会出现 Google 按钮")}
                </small>
              </div>
              <Pill tone={googleConfigured() ? "jade" : "mute"}>{googleConfigured() ? t("已启用") : t("未配置")}</Pill>
            </div>

            <ChangePassword />
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h3>{t("关于这个演示版")}</h3>
          </div>
          <div className="card-body" style={{ display: "grid", gap: 10, fontSize: "var(--fs-md)", lineHeight: 1.7 }}>
            <p>
              {t("这是 信风 · Tradewind 的")}<b>{t("纯前端版本")}</b>{t("：没有服务端，没有数据库，所有数据都在你自己的浏览器（IndexedDB）里。关掉页面数据还在，换一台设备就是一套新的账套。")}
            </p>
            <p className="muted">
              {t("也就是说：")}<b>{t("不要把真实业务数据放进这个演示站")}</b>{t("。它没有备份、没有多人协作、没有服务端校验。要用在真实业务上，把")} <code className="num">src/data/db.ts</code>{t(" 换成对接后端的 fetch 即可，上层的查询与页面代码不用动。")}
            </p>

            {/* 站点有没有在统计访问，用户有权自己看到，而不是只有开发者知道。
                一个反复强调「数据只在你本机」的产品，如果偷偷装了统计还不说，
                那句话就掉价了 —— 所以宁可把它摆在明处。 */}
            <AnalyticsNote />
            {/* 版权的正式落点。登录页那行是「在场」，这里才是「可查」——
                谁做的、怎么联系、哪一年、什么版本，一个地方说全。
                邮箱是画在 canvas 上的，点一下复制；理由见 components/Copyright.tsx。 */}
            <div className="about-legal">
              <span>
                <b>
                  {BRAND.zh} {BRAND.en}
                </b>
                <em>v{__APP_VERSION__}</em>
              </span>
              <span>
                {t("著作权所有人")} <b>{BRAND.author}</b>
                <MailOwner size={12.5} />
              </span>
              <span>{copyright()}</span>
              <span className="muted">{t("保留所有权利")}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * 访问统计的当前状态。
 *
 * 三种情况说三句不同的话，而不是笼统一句「已启用」：
 * 没配 ID（fork 下来的人看到的）、浏览器要求不被追踪（用户自己设的）、
 * 正在统计（线上演示站）。第三种要说清楚统计的是什么、不统计什么 ——
 * 「我们只看你翻了几个模块，不看你账套里的任何一个字」。
 */
function AnalyticsNote() {
  const { t } = useT();
  const st = analyticsState();

  if (!st.configured) {
    return (
      <p className="muted">
        {t("本站未接入任何访问统计。")}
        <span className="hint"> {t("（内置的衡量 ID 只在官方站点生效；自己部署时配 VITE_GA_ID 即可启用）")}</span>
      </p>
    );
  }
  if (!st.enabled) {
    return <p className="muted">{t("你的浏览器要求不被追踪，本站已按此关闭访问统计。")}</p>;
  }
  return (
    <p className="muted">
      {t("本站用 Google Analytics 统计访问量，只记录你打开了哪些模块、点了哪些功能，用来决定下一版先做什么。")}
      <b> {t("账套里的任何数据都不会上传")}</b>
      {t("：客户名、单据号、金额一个字都不进统计。浏览器开启「请勿跟踪」即自动关闭。")}
    </p>
  );
}

function ChangePassword() {
  const { t } = useT();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="setting" style={{ alignItems: open ? "flex-start" : "center" }}>
      <div className="setting-t">
        <b>{t("修改口令")}</b>
        <small>{t("口令用 PBKDF2 派生后存在本机，导出账套时不会带出去")}</small>
      </div>
      {open ? (
        <div style={{ display: "grid", gap: 8, minWidth: 260 }}>
          <Field label={t("原口令")}>
            <input className="input" type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} autoComplete="current-password" />
          </Field>
          <Field label={t("新口令")} hint={t("至少 6 位")}>
            <input className="input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
          </Field>
          <div className="row">
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={async () => {
                if (!user) return;
                setBusy(true);
                const res = await changePassword(user.id, oldPw, newPw);
                setBusy(false);
                if (!res.ok) toastError(res.error ?? t("改不了"));
                else {
                  toast("口令已更新");
                  setOpen(false);
                  setOldPw("");
                  setNewPw("");
                }
              }}
            >
              {busy ? t("处理中…") : t("保存")}
            </button>
            <button className="btn" onClick={() => setOpen(false)}>
              {t("取消")}
            </button>
          </div>
        </div>
      ) : (
        <button className="btn" onClick={() => setOpen(true)}>
          <Icon name="key" />
          {t("修改口令")}
        </button>
      )}
    </div>
  );
}
