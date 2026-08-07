import { useState } from "react";
import { Icon } from "@/components/Icon";
import { BRAND, Logomark } from "@/components/Brand";
import { BrandWind } from "@/components/BrandWind";
import { Avatar } from "@/components/ui/bits";
import { DEMO_ACCOUNTS, signInWithPassword } from "@/auth/accounts";
import { ROLE_LABEL, SCOPE_LABEL, useAuth } from "@/auth/AuthProvider";
import { useDb } from "@/data/DataProvider";
import { DEMO_PASSWORD } from "@/data/types";
import { useT } from "@/i18n";
import { useThemeCycle } from "@/lib/theme";

/**
 * 登录页。
 *
 * 一屏之内只让人做一个决定：**进去**。
 * 左边一句话说清这是什么，右边一个默认填好的管理员账号 + 一个按钮。
 * 其余四个演示身份折在「换个身份」后面 —— 五个并排列出来，
 * 用户第一反应是「我该选哪个」，而不是「进去看看」。
 */
export default function Login() {
  const db = useDb();
  const { signInDemo, signInPassword } = useAuth();
  const { theme, cycle } = useThemeCycle();
  const { t, lang, toggle } = useT();

  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signInWithPassword(username, password);
    setBusy(false);
    if (!res.ok) setError(t(res.error));
    else signInPassword(res.user.id);
  };

  const enterAs = (name: string) => {
    const u = db.users.find((x) => x.username === name);
    if (u) signInDemo(u.id);
  };

  return (
    <div className="login">
      {/* ── 左：一句口号 + 名字的来历，背景是一张会流动的风场图 ──
          原来这里摆过「28 个模块 / 5 个节点 / 0 次上传」三个数字。撤掉了：
          模块数量是我们的内部事实，不是用户的收益，登录页上没人关心。
          换成名字的出处 —— 同样占三行，但看完记得住这个产品叫什么、为什么。 */}
      <section className="login-art">
        <BrandWind />

        <div className="login-art-top">
          <Logomark size={34} />
          <span className="login-brand">
            <b>{BRAND.zh}</b>
            <span>{BRAND.wordmark}</span>
          </span>
        </div>

        <div className="login-art-mid">
          <h1>
            {(lang === "zh" ? BRAND.taglineZhLines : BRAND.taglineEnLines).map((line, i) => (
              <span key={i} className={i === 0 ? "l1" : "l2"}>
                {line}
              </span>
            ))}
          </h1>
          <div className="login-rule" />
          <p>{t("外贸全流程管理")}</p>
        </div>

        <div className="login-lore">
          <p>
            <b>{BRAND.zh}</b>
            {lang === "zh" ? BRAND.loreZh : BRAND.loreEn}
          </p>
        </div>
      </section>

      {/* ── 右：一个账号，一个按钮 ── */}
      <section className="login-form">
        <div className="login-actions">
          <button className="icon-btn lang-btn" onClick={toggle} aria-label={t("切换语言")}>
            {lang === "zh" ? "EN" : "中"}
          </button>
          <button className="icon-btn" onClick={cycle} aria-label={t("切换外观")}>
            <Icon name={theme === "light" ? "sun" : theme === "dark" ? "moon" : "monitor"} />
          </button>
        </div>

        <div className="login-box">
          <h2>{t("登录")}</h2>

          <form onSubmit={submit} className="login-fields">
            <label className="field">
              <span>{t("账号")}</span>
              <input
                className="input input-lg"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </label>

            <label className="field">
              <span>{t("口令")}</span>
              <input
                className="input input-lg"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>

            {error ? (
              <div className="login-err" role="alert">
                <Icon name="alert" />
                {error}
              </div>
            ) : null}

            <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
              {busy ? t("校验中…") : t("登录")}
              {busy ? null : <Icon name="arrowRight" />}
            </button>
          </form>

          <button className="login-more" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore}>
            {t("更多演示身份")}
            <Icon name="chevronDown" style={{ transform: showMore ? "rotate(180deg)" : undefined }} />
          </button>

          {showMore ? (
            <div className="login-roles">
              {DEMO_ACCOUNTS.filter((a) => a.username !== "admin").map((a) => {
                const u = db.users.find((x) => x.username === a.username);
                return (
                  <button key={a.username} className="login-role" onClick={() => enterAs(a.username)}>
                    <Avatar name={u?.name ?? a.username} hue={u?.hue ?? 0} size="sm" />
                    <span className="login-role-t">
                      <b>{u?.name ?? a.username}</b>
                      <small>
                        {u ? `${t(ROLE_LABEL[u.role])} · ${t(SCOPE_LABEL[u.scope])}` : ""}
                      </small>
                    </span>
                    <Icon name="arrowRight" size={14} />
                  </button>
                );
              })}
              <p className="login-hint">{t("登录后可随时在左下角切换身份")}</p>
            </div>
          ) : null}

          <p className="login-foot">{t("演示数据在你自己的浏览器里生成与保存，不会上传任何内容")}</p>
        </div>
      </section>
    </div>
  );
}
