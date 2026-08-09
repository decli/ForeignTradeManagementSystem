import { useState } from "react";
import { Icon } from "@/components/Icon";
import { BRAND, Logomark, brandLockup, copyright } from "@/components/Brand";
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
 *
 * ── 为什么不再是「左深右白」两半 ──
 * 原来是一条竖直硬缝把屏幕对半切：左边深海军蓝的品牌面板，右边纯白的表单区。
 * 两块各自都说得过去，摆在一起就是两张不同的图拼在一块儿 ——
 * 缝在正中间，最扎眼的位置，而它什么也不表示。
 *
 * 现在整页是**一张连续的风场**，表单收成一张浮在场景上的卡片。
 * 卡片和背景当然还是有明暗差，但那是「一个物件放在一片风景前」的差，
 * 有投影、有边、有层次；不是「两张图对半贴」的差。
 * 顺带风场也铺满了整屏 —— 鼠标多半停在表单附近，流线朝那儿汇聚才有戏。
 *
 * ── 版面：一个版心，三行 ──
 * 去掉硬缝之后还剩一个毛病：左右两块各自贴着自己那一侧的屏幕边，
 * 于是左页边距是个常数（文字块的 padding），右页边距是「表单列宽减卡片宽再折半」
 * 的余数 —— 一个不动，一个随窗口变宽而变宽，中间那块空白也跟着无限长大。
 * 两个边距不一样，看着就像没排过。
 *
 * 现在整页收进**一个居中的版心**：页眉（标识 / 语言外观）、正文（口号 | 表单）、
 * 页脚（版权）三行共用同一条左界和同一条右界。左右页边距因此天然相等，
 * 中间那道间距也有了上限 —— 它是版心减去两块内容，不再是屏幕的余数。
 * 标识从口号上方挪到页眉，既坐实了那条左界，也把口号让成了唯一的主角。
 */
export default function Login() {
  const db = useDb();
  const { signInDemo, signInPassword } = useAuth();
  const { theme, cycle } = useThemeCycle();
  const { t, lang, toggle } = useT();
  const mark = brandLockup(lang);

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
      {/* 风场铺满整页，是这一屏的地。它挂在 .login 上而不是左半边，
          因为鼠标汇聚特效要覆盖表单那一侧 —— 人的手就在那儿。 */}
      <BrandWind />

      {/* ── 页眉 ──
          标识坐在版心左界上，语言与外观坐在右界上。这一行的作用有两层：
          一是把整页的左右两条界画出来（下面的口号和卡片都对着它），
          二是把标识从口号头顶挪开 —— 口号是这一屏唯一该被先读到的东西。 */}
      <header className="login-head">
        <div className="login-mark">
          <Logomark size={34} />
          <span className="login-brand" data-lang={lang}>
            <b>{mark.name}</b>
            <span>{mark.sub}</span>
          </span>
        </div>

        <div className="login-actions">
          <button className="icon-btn lang-btn" onClick={toggle} aria-label={t("切换语言")}>
            {lang === "zh" ? "EN" : "中"}
          </button>
          <button className="icon-btn" onClick={cycle} aria-label={t("切换外观")}>
            <Icon name={theme === "light" ? "sun" : theme === "dark" ? "moon" : "monitor"} />
          </button>
        </div>
      </header>

      <div className="login-stage">
        {/* ── 左：一句口号 + 名字的来历 ──
            原来这里摆过「28 个模块 / 5 个节点 / 0 次上传」三个数字。撤掉了：
            模块数量是我们的内部事实，不是用户的收益，登录页上没人关心。
            换成名字的出处 —— 同样占三行，但看完记得住这个产品叫什么、为什么。 */}
        <section className="login-art">
          {/* 字号跟着语种走：中文两行各 5 个字，英文那两行是 19 个字符 ——
              同一个字号下英文会顶穿版心，所以英文那档单独压小 */}
          <h1 data-lang={lang}>
            {(lang === "zh" ? BRAND.taglineZhLines : BRAND.taglineEnLines).map((line, i) => (
              <span key={i} className={i === 0 ? "l1" : "l2"}>
                {line}
              </span>
            ))}
          </h1>
          <div className="login-rule" />
          {/* 「外贸全流程管理」说的是功能类目，读完只知道这是哪一类软件。
              换成一句回答「我为什么要用」的话，候选见 Brand.tsx 的 PITCHES。 */}
          <p className="login-pitch">{lang === "zh" ? BRAND.pitchZh : BRAND.pitchEn}</p>

          <div className="login-lore">
            <p>
              <b>{mark.name}</b>
              {lang === "zh" ? BRAND.loreZh : BRAND.loreEn}
            </p>
          </div>
        </section>

        {/* ── 右：一个账号，一个按钮 ── */}
        <section className="login-form">
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

      {/* ── 版权 ──
          放在整屏最底下、暗到几乎读不出来的一行。版权声明的作用是**在**，
          不是被看见 —— 摆在卡片里或者标题旁边，就成了噪声。
          它跟表单不在同一层，不参与「进去」这个决定。 */}
      <footer className="login-legal">
        <span>
          {copyright()} · {BRAND.zh} {BRAND.en}
        </span>
        <span className="login-legal-sep" aria-hidden="true" />
        <span>{t("演示版本 · 数据仅存于本机")}</span>
      </footer>
    </div>
  );
}
