/**
 * 国旗标记。
 *
 * ── 为什么用 emoji，不用图片 ──
 * 七十来个国家/地区，任何一套 SVG 国旗都是几百 KB 的资源或者一个新依赖，
 * 而这个项目从头到尾没有外链资源、没有 UI 依赖。Unicode 的区域指示符
 * （🇺🇸 = U+1F1FA U+1F1F8）由系统字体渲染，一个字节的资源都不用下。
 *
 * ── 但 Windows 上没有国旗 ──
 * 微软的 Segoe UI Emoji 里刻意没做旗帜，那边会退成两个方框字母。
 * 所以先探一次这台机器到底渲不渲染，不渲染就换成**两位国别码色块** ——
 * 「PE」比一对方框清楚，也不至于让一行里的图标忽大忽小。
 *
 * 探测方法：把「🇨」和「🇨🇳」分别量一次宽。合成成一个旗帜字形时，
 * 两个码点画出来的宽度和一个 emoji 差不多；没合成的话就是两个字母的宽度。
 */

let cached: boolean | null = null;

function flagsRender() {
  if (cached !== null) return cached;
  cached = false;
  try {
    const ctx = document.createElement("canvas").getContext("2d");
    if (ctx) {
      ctx.font = "16px sans-serif";
      const pair = ctx.measureText("\u{1F1E8}\u{1F1F3}").width;
      const one = ctx.measureText("\u{1F1E8}").width;
      cached = pair > 0 && pair < one * 1.8;
    }
  } catch {
    /* 服务端渲染或者受限环境：当成没有 */
  }
  return cached;
}

/** 两位国别码 → 区域指示符。'US' → 🇺🇸 */
const toEmoji = (cc: string) =>
  cc.replace(/./g, (ch) => String.fromCodePoint(0x1f1e6 + ch.toUpperCase().charCodeAt(0) - 65));

export function Flag({ cc }: { cc?: string }) {
  if (!cc) return <span className="flag flag-none" aria-hidden="true" />;
  return flagsRender() ? (
    <span className="flag" aria-hidden="true">
      <i>{toEmoji(cc)}</i>
    </span>
  ) : (
    <span className="flag flag-cc" aria-hidden="true">
      {cc}
    </span>
  );
}
