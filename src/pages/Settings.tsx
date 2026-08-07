import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { toast, toastError } from "@/components/ui/Toast";
import { Field, Pill, Segmented } from "@/components/ui/bits";
import { changePassword } from "@/auth/accounts";
import { ROLE_LABEL, SCOPE_LABEL, useAuth } from "@/auth/AuthProvider";
import { googleConfigured, GOOGLE_CLIENT_ID } from "@/auth/google";
import { useDb } from "@/data/DataProvider";
import { clearAll, exportJson, importJson, isPersistent, resetToSeed } from "@/data/db";
import { setCustomRate } from "@/data/mutations";
import { customRate, marketRate } from "@/data/queries";
import { useDensity, useTheme, type Density, type Theme } from "@/lib/theme";

export default function Settings() {
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
    toast("账套已导出（不含登录凭据）");
  };

  const upload = async (file: File) => {
    try {
      await importJson(await file.text());
      toast("账套已导入");
    } catch (e) {
      toastError(e instanceof Error ? e.message : "导入失败");
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>系统设置</h1>
          <p>外观、表格密度、账套数据与本地账号 —— 全部只影响这台设备</p>
        </div>
      </div>

      <div style={{ display: "grid", gap: 16, maxWidth: 880 }}>
        <section className="card">
          <div className="card-head">
            <h3>外观</h3>
          </div>
          <div className="card-body" style={{ paddingBlock: 4 }}>
            <div className="setting">
              <div className="setting-t">
                <b>主题</b>
                <small>跟随系统会随你的操作系统在日夜之间自动切换</small>
              </div>
              <Segmented<Theme>
                value={theme}
                onChange={setTheme}
                size="lg"
                options={[
                  { value: "light", label: "浅色" },
                  { value: "dark", label: "深色" },
                  { value: "system", label: "跟随系统" },
                ]}
                label="主题"
              />
            </div>
            <div className="setting">
              <div className="setting-t">
                <b>表格密度</b>
                <small>紧凑一屏能多看十几行；宽松适合长时间盯着改</small>
              </div>
              <Segmented<Density>
                value={density}
                onChange={setDensity}
                size="lg"
                options={[
                  { value: "compact", label: "紧凑" },
                  { value: "default", label: "标准" },
                  { value: "cozy", label: "宽松" },
                ]}
                label="表格密度"
              />
            </div>
            <div className="setting">
              <div className="setting-t">
                <b>恢复表格布局</b>
                <small>清掉所有列宽、隐藏列、排序与每页行数的记忆</small>
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
                恢复默认
              </button>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h3>汇率</h3>
            <span className="spacer" />
            <span className="muted" style={{ fontSize: "var(--fs-sm)" }}>市场汇率 {marketRate(db).toFixed(4)}（演示值，不联网）</span>
          </div>
          <div className="card-body" style={{ paddingBlock: 4 }}>
            <div className="setting">
              <div className="setting-t">
                <b>自定汇率 USD → CNY</b>
                <small>订单核算与看板把人民币单折算成美元口径时用的就是这个数</small>
              </div>
              <div className="row">
                <input className="input num" value={rate} onChange={(e) => setRate(e.target.value)} style={{ width: 120 }} inputMode="decimal" aria-label="自定汇率" />
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
                    toast(`自定汇率已改为 ${v}`);
                  }}
                >
                  保存
                </button>
              </div>
            </div>
            {!can("finance") ? (
              <p className="muted" style={{ fontSize: "var(--fs-sm)", paddingBottom: 12 }}>
                只有财务和管理员能改汇率。当前身份是{user ? ROLE_LABEL[user.role] : "访客"}。
              </p>
            ) : null}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h3>账套数据</h3>
            <span className="spacer" />
            <Pill tone={isPersistent() ? "jade" : "amber"}>{isPersistent() ? "已持久化到 IndexedDB" : "浏览器禁用了存储 · 仅本次会话有效"}</Pill>
          </div>
          <div className="card-body">
            <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
              {Object.entries(stats).map(([k, v]) => (
                <span className="tag" key={k} style={{ height: 24, fontSize: "var(--fs-sm)" }}>
                  {k} <b className="num" style={{ marginLeft: 4, color: "var(--text)" }}>{v}</b>
                </span>
              ))}
            </div>

            <div className="setting">
              <div className="setting-t">
                <b>导出 / 导入</b>
                <small>整份账套是一个 JSON。导出的文件不含登录凭据，可以放心传给同事</small>
              </div>
              <div className="row">
                <button className="btn" onClick={download}>
                  <Icon name="download" />
                  导出 JSON
                </button>
                <button className="btn" onClick={() => fileRef.current?.click()}>
                  <Icon name="upload" />
                  导入 JSON
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

            <div className="setting">
              <div className="setting-t">
                <b>重置演示数据</b>
                <small>把账套恢复成出厂状态。你改过的动态、批量更新、关联都会消失</small>
              </div>
              <button
                className="btn btn-danger"
                onClick={() => {
                  if (!confirm("确定要把账套恢复成出厂状态吗？这一步不能撤销。")) return;
                  void resetToSeed().then(() => toast("演示数据已重灌"));
                }}
              >
                <Icon name="refresh" />
                重灌演示数据
              </button>
            </div>

            <div className="setting">
              <div className="setting-t">
                <b>清空本机数据</b>
                <small>删掉 IndexedDB 里的整份账套，包括本地注册的账号</small>
              </div>
              <button
                className="btn btn-danger"
                onClick={() => {
                  if (!confirm("清空后本机不再保留任何数据，确定吗？")) return;
                  void clearAll().then(() => toast("已清空并重新灌入演示数据"));
                }}
              >
                <Icon name="trash" />
                清空
              </button>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h3>登录与账号</h3>
          </div>
          <div className="card-body" style={{ paddingBlock: 4 }}>
            <div className="setting">
              <div className="setting-t">
                <b>当前身份</b>
                <small>
                  {displayName} · {user ? `${ROLE_LABEL[user.role]} · ${SCOPE_LABEL[user.scope]}` : "—"} ·{" "}
                  {session?.kind === "google" ? "Google 账号" : session?.kind === "password" ? "账密登录" : "演示身份"}
                </small>
              </div>
              <Pill tone={user?.role === "viewer" ? "mute" : "accent"}>{user ? ROLE_LABEL[user.role] : "访客"}</Pill>
            </div>

            <div className="setting">
              <div className="setting-t">
                <b>Google 单点登录</b>
                <small>
                  {googleConfigured()
                    ? `已配置：${GOOGLE_CLIENT_ID.slice(0, 18)}…`
                    : "未配置。给构建加上 VITE_GOOGLE_CLIENT_ID，登录页就会出现 Google 按钮"}
                </small>
              </div>
              <Pill tone={googleConfigured() ? "jade" : "mute"}>{googleConfigured() ? "已启用" : "未配置"}</Pill>
            </div>

            <ChangePassword />
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h3>关于这个演示版</h3>
          </div>
          <div className="card-body" style={{ display: "grid", gap: 10, fontSize: "var(--fs-md)", lineHeight: 1.7 }}>
            <p>
              这是 MT 通商 · TRADEFLOW 的<b>纯前端版本</b>：没有服务端，没有数据库，所有数据都在你自己的浏览器
              （IndexedDB）里。关掉页面数据还在，换一台设备就是一套新的账套。
            </p>
            <p className="muted">
              也就是说：<b>不要把真实业务数据放进这个演示站</b>。它没有备份、没有多人协作、没有服务端校验。
              要用在真实业务上，把 <code className="num">src/data/db.ts</code> 换成对接后端的 fetch 即可，
              上层的查询与页面代码不用动。
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function ChangePassword() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="setting" style={{ alignItems: open ? "flex-start" : "center" }}>
      <div className="setting-t">
        <b>修改口令</b>
        <small>口令用 PBKDF2 派生后存在本机，导出账套时不会带出去</small>
      </div>
      {open ? (
        <div style={{ display: "grid", gap: 8, minWidth: 260 }}>
          <Field label="原口令">
            <input className="input" type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} autoComplete="current-password" />
          </Field>
          <Field label="新口令" hint="至少 6 位">
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
                if (!res.ok) toastError(res.error ?? "改不了");
                else {
                  toast("口令已更新");
                  setOpen(false);
                  setOldPw("");
                  setNewPw("");
                }
              }}
            >
              {busy ? "处理中…" : "保存"}
            </button>
            <button className="btn" onClick={() => setOpen(false)}>
              取消
            </button>
          </div>
        </div>
      ) : (
        <button className="btn" onClick={() => setOpen(true)}>
          <Icon name="key" />
          修改口令
        </button>
      )}
    </div>
  );
}
