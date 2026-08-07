import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/ui/bits";
import { DEMO_ACCOUNTS, registerAccount, signInWithPassword } from "@/auth/accounts";
import { ROLE_LABEL, SCOPE_LABEL, useAuth } from "@/auth/AuthProvider";
import { googleConfigured, renderGoogleButton, type GoogleProfile } from "@/auth/google";
import { useDb } from "@/data/DataProvider";
import { DEMO_PASSWORD, type Role, type Scope } from "@/data/types";
import { useThemeCycle } from "@/lib/theme";

type Mode = "signin" | "signup";

export default function Login() {
  const db = useDb();
  const { signInDemo, signInPassword, signInGoogle } = useAuth();
  const { resolved, cycle, theme } = useThemeCycle();
  const [mode, setMode] = useState<Mode>("signin");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("sales");
  const [scope, setScope] = useState<Scope>("self");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const gbtn = useRef<HTMLDivElement>(null);

  // Google 按钮由官方脚本渲染，主题变了要重画一次，否则深色下是一块白
  useEffect(() => {
    if (!googleConfigured() || !gbtn.current) return;
    const onCred = (p: GoogleProfile) => {
      // 纯前端拿不到「这个 Google 账号对应系统里的谁」，绑到管理员身份上，
      // 进去之后可以随时在右下角切换身份来验证不同角色的数据范围
      const admin = db.users.find((u) => u.role === "admin") ?? db.users[0];
      signInGoogle(p, admin.id);
    };
    renderGoogleButton(gbtn.current, onCred, resolved === "dark").catch((e: Error) => setGoogleError(e.message));
  }, [resolved, db.users, signInGoogle]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signin") {
        const res = await signInWithPassword(username, password);
        if (!res.ok) setError(res.error);
        else signInPassword(res.user.id);
      } else {
        const res = await registerAccount({ username, password, name, role, scope, team: scope === "team" ? "PPE组" : null });
        if (!res.ok) setError(res.error);
        else signInPassword(res.user.id);
      }
    } finally {
      setBusy(false);
    }
  };

  const fillDemo = (u: string) => {
    setMode("signin");
    setUsername(u);
    setPassword(DEMO_PASSWORD);
    setError(null);
  };

  return (
    <div className="login">
      <section className="login-art">
        <div>
          <div className="row" style={{ gap: 10, marginBottom: 36 }}>
            <span className="rail-mark">
              <Icon name="ship" />
            </span>
            <span className="rail-name">
              <b style={{ color: "#fff" }}>MT 通商</b>
              <span style={{ color: "#7386a1" }}>MT TRADEFLOW</span>
            </span>
          </div>
          <h1>
            把跟单表
            <br />
            从 Excel 里搬出来
          </h1>
          <p>出运跟踪、订单核算、退税申报，一条 PI 号串起来。停滞和超期自己会冒出来，不用人去翻。</p>

          <div className="login-feats">
            <div className="login-feat">
              <Icon name="ship" />
              <span>
                <b>里程碑航程线</b> —— 交期 / 装柜 / 进仓 / ATD / ETA 连成一条线，一眼看出这票走到哪
              </span>
            </div>
            <div className="login-feat">
              <Icon name="lightning" />
              <span>
                <b>就地改 + 批量写</b> —— 勾几行，动态、日期、放行状态一次写完，5 秒内可撤销
              </span>
            </div>
            <div className="login-feat">
              <Icon name="database" />
              <span>
                <b>数据在你自己的浏览器里</b> —— 演示版不上传任何东西，随时可导出 JSON 或清空
              </span>
            </div>
          </div>
        </div>

        <p className="login-foot">
          这是纯前端演示版：登录与数据都在本机完成，换一台设备就是一套新的账套。
        </p>
      </section>

      <section className="login-form">
        <div className="login-box">
          <div className="row">
            <div style={{ flex: 1 }}>
              <h2>{mode === "signin" ? "登录" : "注册本地账号"}</h2>
              <p className="muted" style={{ fontSize: "var(--fs-md)", marginTop: 4 }}>
                {mode === "signin" ? "用演示账号直接进，或者用 Google 账号" : "账号只存在这台设备上"}
              </p>
            </div>
            <button className="icon-btn" onClick={cycle} aria-label="切换外观" data-tip={`外观：${theme === "system" ? "跟随系统" : theme === "dark" ? "深色" : "浅色"}`}>
              <Icon name={theme === "light" ? "sun" : theme === "dark" ? "moon" : "monitor"} />
            </button>
          </div>

          <div className="login-tabs" role="group" aria-label="登录方式">
            <button aria-pressed={mode === "signin"} onClick={() => { setMode("signin"); setError(null); }}>
              账密登录
            </button>
            <button aria-pressed={mode === "signup"} onClick={() => { setMode("signup"); setError(null); setUsername(""); setPassword(""); }}>
              注册账号
            </button>
          </div>

          <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
            <label className="field">
              <span>账号</span>
              <input
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder={mode === "signup" ? "3–24 位英文、数字、_ . -" : "admin"}
                required
              />
            </label>

            {mode === "signup" ? (
              <label className="field">
                <span>显示名</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="台账里显示的名字" required />
              </label>
            ) : null}

            <label className="field">
              <span>口令</span>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                placeholder={mode === "signup" ? "至少 6 位" : "demo1234"}
                required
              />
            </label>

            {mode === "signup" ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label className="field">
                  <span>角色</span>
                  <select className="select" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                    {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>数据范围</span>
                  <select className="select" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
                    {(Object.keys(SCOPE_LABEL) as Scope[]).map((s) => (
                      <option key={s} value={s}>
                        {SCOPE_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}

            {error ? (
              <div className="login-err" role="alert">
                <Icon name="alert" />
                {error}
              </div>
            ) : null}

            <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
              {busy ? "校验中…" : mode === "signin" ? "登录" : "注册并进入"}
            </button>
          </form>

          <div className="login-or">或</div>

          {googleConfigured() ? (
            <div>
              <div ref={gbtn} style={{ display: "grid", justifyContent: "stretch", minHeight: 44 }} />
              {googleError ? (
                <p className="muted" style={{ fontSize: "var(--fs-sm)", marginTop: 6 }}>
                  {googleError}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="login-demo" style={{ borderStyle: "solid" }}>
              <div className="row" style={{ gap: 8 }}>
                <Icon name="info" size={15} style={{ color: "var(--text-3)" }} />
                <b style={{ fontSize: "var(--fs-md)" }}>Google 登录未配置</b>
              </div>
              <p className="muted" style={{ fontSize: "var(--fs-sm)" }}>
                部署时给 <code className="num">VITE_GOOGLE_CLIENT_ID</code> 一个值，这里就会出现「使用 Google 账号登录」按钮。
                做法写在 README 的「接 Google 登录」一节。
              </p>
            </div>
          )}

          <div className="login-demo">
            <div className="row" style={{ padding: "0 7px 4px" }}>
              <Icon name="key" size={14} style={{ color: "var(--text-3)" }} />
              <b style={{ fontSize: "var(--fs-sm)" }}>演示账号</b>
              <span className="spacer" />
              <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                口令都是 <code className="num">{DEMO_PASSWORD}</code>
              </span>
            </div>
            {/* 两个真按钮并排，不做「按钮套按钮」—— 那样键盘用户根本 Tab 不到里面那个 */}
            {DEMO_ACCOUNTS.map((a) => {
              const u = db.users.find((x) => x.username === a.username);
              return (
                <div key={a.username} className="login-demo-row">
                  <Avatar name={u?.name ?? a.username} hue={u?.hue ?? 0} size="sm" />
                  <button
                    onClick={() => fillDemo(a.username)}
                    aria-label={`把 ${a.username} 填进登录框`}
                    style={{ flex: 1, minWidth: 0, display: "flex", gap: 8, alignItems: "center", border: 0, background: "transparent", color: "inherit", textAlign: "left", padding: 0, font: "inherit" }}
                  >
                    <code>{a.username}</code>
                    <span className="muted truncate">{a.note}</span>
                  </button>
                  <button className="btn btn-sm" onClick={() => u && signInDemo(u.id)} aria-label={`以 ${a.username} 的身份直接进入`}>
                    直接进
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
