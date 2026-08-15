/**
 * 版权署名。
 *
 * ── 为什么邮箱要画在 canvas 上 ──
 * 一个纯静态站会被无数爬虫扫过。只要邮箱以文本形态出现在 HTML 里，
 * 半天之内它就会进入若干个「外贸行业采购名录」，接下来是每天几十封
 * 群发推广和冒充海关/银行的诈骗信。这不是理论风险，是把邮箱贴到公开
 * 网页上的必然结果。
 *
 * 所以这里的邮箱：
 *  1. **不以文本节点出现** —— 画进 <canvas> 的像素，DOM 里只有一个空画布；
 *  2. **不以字面量出现在源码里** —— 用码点数组在运行时拼出来，
 *     打包产物里 grep 不到 `xxx@xxx.com` 这种可直接正则捞走的串；
 *  3. **不写进 aria-label / title / alt** —— 那些都是纯文本属性，
 *     写进去等于前两条白做。
 *
 * 代价是读屏用户读不到它。补偿：整块是个按钮，回车/点击即复制到剪贴板，
 * 并用 aria-live 播报「已复制」。读屏用户拿到的是可粘贴的真地址，
 * 而爬虫不会去点按钮 —— 两边都照顾到了。
 *
 * ── 为什么不是一张图片 ──
 * 图片要么多一次网络请求，要么变成一长串 base64 塞进 HTML；而且写死的
 * 图片颜色跟不上明暗主题和五套主题色。canvas 每次按父元素的
 * computed color 现画，换肤、切明暗、拖到 Retina 屏都自动跟上。
 */

import { useCallback, useLayoutEffect, useRef } from "react";
import { BRAND, copyright } from "./Brand";
import { toast } from "./ui/Toast";
import { useT } from "@/i18n";

/* decli@qq.com 的码点。见文件头第 2 条：源码里不留可正则匹配的字面量。
   分两段存，连起来才是完整地址 —— 单看任何一段都不像邮箱。 */
const LOCAL = [100, 101, 99, 108, 105];
const HOST = [113, 113, 46, 99, 111, 109];

/** 运行时拼出版权邮箱。只给 canvas 绘制和剪贴板用，不要塞进 DOM */
export const ownerMail = () => String.fromCharCode(...LOCAL) + "@" + String.fromCharCode(...HOST);

type MailProps = {
  /** 字号（px）。默认跟随 --fs-xs 那一档 */
  size?: number;
  weight?: number;
  /** 覆盖颜色。默认取父元素的 computed color，跟着主题走 */
  color?: string;
};

/**
 * 把版权邮箱画成一小块画布。
 *
 * 尺寸按 measureText 的结果定，所以不同字体/字号下都不会截断或留白；
 * 位图按 devicePixelRatio 放大，Retina 上不糊。
 */
export function MailMark({ size = 12, weight = 500, color }: MailProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  const draw = useCallback(() => {
    const cv = ref.current;
    if (!cv) return;
    const probe = cv.getContext("2d");
    if (!probe) return;

    // 颜色和字体都跟父元素走：放进任何一个容器里都自动融进去
    const host = cv.parentElement ?? cv;
    const cs = getComputedStyle(host);
    const font = `${weight} ${size}px ${cs.fontFamily}`;
    const text = ownerMail();

    probe.font = font;
    const w = Math.ceil(probe.measureText(text).width) + 2;
    const h = Math.ceil(size * 1.4);

    // 3 倍封顶：再高的 dpr 对一行 12px 的字没有可见收益，只是白烧内存
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    /* ⚠️ 尺寸只在这里用命令式写，绝不要再把 width/height 交给 JSX 属性去渲染。
       给 <canvas> 赋 width/height 会**清空画布**，而 React 每次 re-render 都会
       比对这两个属性；一旦它们由 state 驱动，React 就会在这行代码画完之后
       把画布抹掉，屏幕上只剩一块空白。这个坑踩过一次，写在这里。 */
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;

    // 改 width/height 会重置画布状态，字体必须在这之后再设一次
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.font = font;
    ctx.textBaseline = "middle";
    ctx.fillStyle = color ?? cs.color;
    ctx.fillText(text, 1, h / 2);
  }, [size, weight, color]);

  // useLayoutEffect：在首帧之前把尺寸和内容定下来，否则会闪一下 300×150 的默认画布
  useLayoutEffect(() => {
    draw();

    // 字体晚到会让第一次测量偏窄，字体就位后补画一次
    document.fonts?.ready.then(draw).catch(() => {});

    // 换明暗 / 换主题色 / 换密度都写在 <html> 的 data-* 上
    const mo = new MutationObserver(draw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-accent", "data-density", "lang"] });

    // 「跟随系统」这一档没有 data-theme，只能听系统偏好
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", draw);

    // 拖到另一块屏幕 dpr 会变，不重画就糊
    window.addEventListener("resize", draw);

    return () => {
      mo.disconnect();
      mq.removeEventListener("change", draw);
      window.removeEventListener("resize", draw);
    };
  }, [draw]);

  /* 不给 width / height 属性 —— 见 draw() 里那段警告。
     style 上先摆一个近似尺寸，draw() 会在首帧前按实测值改写它，
     免得布局在第一帧按默认的 300×150 撑开一下再收回去。 */
  return <canvas ref={ref} className="mail-mark" style={{ width: 76, height: Math.ceil(size * 1.4) }} aria-hidden="true" />;
}

/**
 * 「版权所有 <邮箱>」，整块可点击复制。
 *
 * 按钮的可访问名称是「复制版权邮箱」而不是邮箱本身 —— 见文件头第 3 条。
 */
export function MailOwner({ size, weight, color }: MailProps) {
  const { t } = useT();

  const copy = async () => {
    const mail = ownerMail();
    try {
      await navigator.clipboard.writeText(mail);
      toast(t("版权邮箱已复制到剪贴板"));
    } catch {
      // 非安全上下文（http://）或用户拒绝了剪贴板权限：退回选中复制
      const ta = document.createElement("textarea");
      ta.value = mail;
      ta.setAttribute("aria-hidden", "true");
      ta.style.cssText = "position:fixed;top:-100px;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand?.("copy");
      ta.remove();
      toast(ok ? t("版权邮箱已复制到剪贴板") : t("复制失败，请手动记录"));
    }
  };

  return (
    <button type="button" className="mail-owner" onClick={copy} aria-label={t("复制版权邮箱")} title={t("点击复制版权邮箱")}>
      <MailMark size={size} weight={weight} color={color} />
    </button>
  );
}

/**
 * 全站统一的版权行。
 *
 * `tone` 决定摆在哪：
 *  - `login`  登录页最底那一行，暗到几乎读不出来 —— 版权的作用是「在」，不是被看见
 *  - `app`    登录后每一页正文末尾的细行
 *  - `about`  设置页「关于」，这里是「可查」，写全：谁做的、哪一年、什么版本
 */
export function CopyrightLine({ tone = "app", extra }: { tone?: "login" | "app" | "about"; extra?: string }) {
  const { t } = useT();

  return (
    <div className="legal-line" data-tone={tone}>
      <span className="legal-seg">
        {copyright()}
        <i className="legal-sep" aria-hidden="true" />
        {t("版权所有")}
        <MailOwner size={tone === "about" ? 12.5 : 11.5} />
      </span>
      <i className="legal-dot" aria-hidden="true" />
      <span className="legal-seg">
        {BRAND.zh} {BRAND.en}
        <em className="legal-ver">v{__APP_VERSION__}</em>
      </span>
      {extra ? (
        <>
          <i className="legal-dot" aria-hidden="true" />
          <span className="legal-seg">{extra}</span>
        </>
      ) : null}
    </div>
  );
}

/**
 * 登录后每一页末尾的版权页脚。
 *
 * 挂在 AppShell 的滚动容器里、正文之后 —— 跟着内容滚，不占视口。
 * 表格页 .page 本来就留了 96px 底部留白，这一行正好落在那片空白里。
 */
export function AppFooter() {
  const { t } = useT();
  return (
    <footer className="app-legal">
      <CopyrightLine tone="app" extra={t("演示版本 · 数据仅存于本机")} />
    </footer>
  );
}
