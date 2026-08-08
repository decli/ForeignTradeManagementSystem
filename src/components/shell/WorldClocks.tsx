import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Flag } from "@/components/Flag";
import { Menu } from "@/components/ui/Menu";
import { PickList } from "@/components/shell/PickList";
import { useStored, useTick } from "@/lib/hooks";
import { useT } from "@/i18n";

/**
 * 世界时间。
 *
 * ── 原来是什么样 ──
 * 六个城市平铺在顶栏上：「厦门 13:21 · 利马 00:21 · 纽约 01:21 · …」，
 * 横着占掉四百多像素，还得靠遮罩加横滚才塞得下。它占的是顶栏最贵的一段地方，
 * 而换来的信息是六个数字 —— 谁也不会一整天盯着利马几点。
 *
 * ── 真正要回答的问题不是「几点」，是「现在能不能打过去」──
 * 而这个问题，六个数字并排放着其实答不了：你得先知道对方几点上班，
 * 再在脑子里做一次减法。所以折叠不是为了省地方而省地方 ——
 * 平铺根本就是错的形式，它把一件需要比较的事拆成了六个孤立的数。
 *
 * 现在顶栏只留一个芯片：本地时间 + 「几地在上班」。后者是一天里真正会变、
 * 也真正有人关心的那个数。点开是一张对照表：
 *
 *   横轴是**你的**一天（0–24 点），每个城市一行，亮块是对方的上班时段
 *   换算到你这条轴上的位置，一条竖线是此刻。
 *
 * 于是「伦敦要等到我下午四点才上班」变成看一眼的事，不用算。
 *
 * 鼠标停在芯片上就展开，不用点 —— 这是个「看一眼就走」的面板。
 * 城市可以自己加减，**列表第一个就是本地**（那条横轴属于谁）。
 */

/** 可选城市。挑的是外贸真会打交道的港口、口岸和客户所在地 */
export const CITY_BOOK = [
  { tz: "Asia/Shanghai", name: "北京", en: "Beijing", cc: "CN" },
  { tz: "Asia/Shanghai", name: "上海", en: "Shanghai", alt: 1, cc: "CN" },
  { tz: "Asia/Shanghai", name: "厦门", en: "Xiamen", alt: 2, cc: "CN" },
  { tz: "Asia/Shanghai", name: "深圳", en: "Shenzhen", alt: 3, cc: "CN" },
  { tz: "Asia/Hong_Kong", name: "香港", en: "Hong Kong", cc: "HK" },
  { tz: "Asia/Taipei", name: "台北", en: "Taipei", cc: "TW" },
  { tz: "Asia/Tokyo", name: "东京", en: "Tokyo", cc: "JP" },
  { tz: "Asia/Seoul", name: "首尔", en: "Seoul", cc: "KR" },
  { tz: "Asia/Singapore", name: "新加坡", en: "Singapore", cc: "SG" },
  { tz: "Asia/Bangkok", name: "曼谷", en: "Bangkok", cc: "TH" },
  { tz: "Asia/Ho_Chi_Minh", name: "胡志明市", en: "Ho Chi Minh City", cc: "VN" },
  { tz: "Asia/Jakarta", name: "雅加达", en: "Jakarta", cc: "ID" },
  { tz: "Asia/Manila", name: "马尼拉", en: "Manila", cc: "PH" },
  { tz: "Asia/Kuala_Lumpur", name: "吉隆坡", en: "Kuala Lumpur", cc: "MY" },
  { tz: "Asia/Kolkata", name: "孟买", en: "Mumbai", cc: "IN" },
  { tz: "Asia/Karachi", name: "卡拉奇", en: "Karachi", cc: "PK" },
  { tz: "Asia/Dubai", name: "迪拜", en: "Dubai", cc: "AE" },
  { tz: "Asia/Riyadh", name: "利雅得", en: "Riyadh", cc: "SA" },
  { tz: "Europe/Istanbul", name: "伊斯坦布尔", en: "Istanbul", cc: "TR" },
  { tz: "Europe/Moscow", name: "莫斯科", en: "Moscow", cc: "RU" },
  { tz: "Europe/Warsaw", name: "华沙", en: "Warsaw", cc: "PL" },
  { tz: "Europe/Berlin", name: "汉堡", en: "Hamburg", cc: "DE" },
  { tz: "Europe/Paris", name: "巴黎", en: "Paris", cc: "FR" },
  { tz: "Europe/Amsterdam", name: "鹿特丹", en: "Rotterdam", cc: "NL" },
  { tz: "Europe/Madrid", name: "马德里", en: "Madrid", cc: "ES" },
  { tz: "Europe/London", name: "伦敦", en: "London", cc: "GB" },
  { tz: "Africa/Johannesburg", name: "约翰内斯堡", en: "Johannesburg", cc: "ZA" },
  { tz: "Africa/Lagos", name: "拉各斯", en: "Lagos", cc: "NG" },
  { tz: "Africa/Cairo", name: "开罗", en: "Cairo", cc: "EG" },
  { tz: "America/Sao_Paulo", name: "圣保罗", en: "São Paulo", cc: "BR" },
  { tz: "America/Argentina/Buenos_Aires", name: "布宜诺斯艾利斯", en: "Buenos Aires", cc: "AR" },
  { tz: "America/Santiago", name: "圣地亚哥", en: "Santiago", cc: "CL" },
  { tz: "America/Lima", name: "利马", en: "Lima", cc: "PE" },
  { tz: "America/Bogota", name: "波哥大", en: "Bogotá", cc: "CO" },
  { tz: "America/Mexico_City", name: "墨西哥城", en: "Mexico City", cc: "MX" },
  { tz: "America/New_York", name: "纽约", en: "New York", cc: "US" },
  { tz: "America/Chicago", name: "芝加哥", en: "Chicago", cc: "US" },
  { tz: "America/Los_Angeles", name: "洛杉矶", en: "Los Angeles", cc: "US" },
  { tz: "America/Vancouver", name: "温哥华", en: "Vancouver", cc: "CA" },
  { tz: "Australia/Sydney", name: "悉尼", en: "Sydney", cc: "AU" },
  { tz: "Pacific/Auckland", name: "奥克兰", en: "Auckland", cc: "NZ" },
];

/**
 * 城市在列表里的身份是 `tz#alt` 而不是 `tz` —— 北京、上海、厦门、深圳
 * 是同一个 `Asia/Shanghai`，只用时区当 key 的话它们互相覆盖，
 * 挑了「厦门」存下来再读回来会变成「北京」。
 */
const cityKey = (c: { tz: string; alt?: number }) => (c.alt ? `${c.tz}#${c.alt}` : c.tz);

type City = { tz: string; name: string; en: string; cc: string; alt?: number };

/**
 * 书里没有的时区也要能显示。用户可能在苏黎世、在赫尔辛基 ——
 * 城市表收了四十个外贸口岸，覆盖不到全世界。这时按 `tz:Europe/Zurich` 造一条：
 * 名字取时区 id 的最后一段，国别码留空（Flag 会退成一个地球）。
 * 宁可显示「Zurich」也不要默认成北京 —— 那条横轴是**你的**一天，认错了整张表都是错的。
 */
function findCity(key: string): City | undefined {
  const hit = CITY_BOOK.find((c) => cityKey(c) === key);
  if (hit) return hit;
  if (!key.startsWith("tz:")) return undefined;
  const tz = key.slice(3);
  const label = tz.split("/").pop()!.replace(/_/g, " ");
  return { tz, name: label, en: label, cc: "" };
}

/** 浏览器所在时区对应的城市。书里有就用书里的（Asia/Shanghai → 北京），没有就临时造 */
function localCity() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const hit = CITY_BOOK.find((c) => c.tz === tz);
    return hit ? cityKey(hit) : `tz:${tz}`;
  } catch {
    return "Asia/Shanghai";
  }
}

/** 客户密集的几个时区。本地那条由浏览器决定，插在最前面 */
const PARTNERS = ["Asia/Shanghai", "America/Lima", "America/New_York", "America/Argentina/Buenos_Aires", "Europe/London", "Asia/Dubai"];

/* 默认列表 = 你所在的城市 + 上面那几个（去重）。
   模块级算一次就够 —— 一次会话里浏览器时区不会变。 */
const HOME = localCity();
const DEFAULT_CITIES = [HOME, ...PARTNERS.filter((k) => k !== HOME)];

/** 对方按当地 9:00–18:00 上班。跟 localClock 里的口径保持一致 */
const WORK_FROM = 9;
const WORK_TO = 18;

/**
 * 周末不是哪儿都是六日。
 *
 * 沙特、埃及、以色列是**周五 + 周六**，伊朗是周四 + 周五。
 * 阿联酋 2022 年 1 月把周末从「五六」改成了「六日」，所以迪拜走默认。
 * 原来一句 `/Sat|Sun/` 走天下，结果是利雅得周日被标成休息（人家在上班）、
 * 周五反倒算上班 —— 一个专门做外贸的工具，把中东客户的作息搞反了很难交代。
 *
 * 0 = 周日 … 6 = 周六。
 */
const WEEKEND: Record<string, number[]> = { SA: [5, 6], EG: [5, 6], IL: [5, 6], IR: [4, 5] };
const weekendOf = (cc: string) => WEEKEND[cc] ?? [6, 0];

const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

type Zone = { offset: number; min: number; day: number; dow: number; weekday: string };

/**
 * 某个时区此刻的墙上时间和它相对 UTC 的偏移。
 *
 * 不能用 getTimezoneOffset —— 那只认本机时区。做法是让 Intl 把同一个时刻在目标
 * 时区渲染成年月日时分，再把渲染结果**当成 UTC 读回来**，和真正的 UTC 相减，
 * 差值就是这个时区的偏移。夏令时、半小时时区（印度 +5:30、伦敦夏天 +1）
 * 全由 Intl 负责，这里一次手工加减都没有。
 *
 * 时间基准先截到整分钟：now 带着秒和毫秒，而渲染出来的墙上时间只到分钟，
 * 直接相减会差出小几十秒，除以 60000 之后偏移就会算成 479 而不是 480。
 */
function zoneInfo(tz: string, now: Date, locale: string): Zone | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
    // en-US 的 hour12:false 在午夜给的是 24，归一到 0
    const hour = Number(get("hour")) % 24;
    const y = Number(get("year"));
    const mo = Number(get("month")) - 1;
    const d = Number(get("day"));
    return {
      offset: Math.round((Date.UTC(y, mo, d, hour, Number(get("minute"))) - Math.floor(now.getTime() / 60000) * 60000) / 60000),
      min: hour * 60 + Number(get("minute")),
      day: Date.UTC(y, mo, d),
      dow: DOW[get("weekday")] ?? 0,
      weekday: new Intl.DateTimeFormat(locale, { timeZone: tz, weekday: "short" }).format(now),
    };
  } catch {
    return null;
  }
}

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** 挑城市时先让人看见那边现在几点 —— 加进来之前就知道值不值得占一行 */
const zoneNow = (tz: string) => {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  } catch {
    return "--:--";
  }
};
const pct = (min: number) => `${((min / 1440) * 100).toFixed(3)}%`;

type Row = {
  key: string;
  label: string;
  cc: string;
  home: boolean;
  time: string;
  working: boolean;
  /** 今天是这座城市的休息日。整行压暗，时间带画成空心 */
  off: boolean;
  /** 休息日就把星期几标出来 —— 否则「全员灰着」看不出是深夜还是放假 */
  weekday: string | null;
  /** 相对本地的日期差：-1 昨天 / 0 今天 / +1 明天 */
  dayDelta: number;
  /** 对方的上班时段换算到本地这条轴上，跨零点会被切成两段 */
  spans: { from: number; to: number; cut: "l" | "r" | null }[];
};

/** 越过本地零点就切两段。被切开的那一头削平，读起来才是「一段被轴切断」而不是两段班 */
function toSpans(from: number, to: number): Row["spans"] {
  if (to <= 1440) return [{ from, to, cut: null }];
  return [
    { from, to: 1440, cut: "r" },
    { from: 0, to: to - 1440, cut: "l" },
  ];
}

function buildRows(keys: string[], now: Date, lang: "zh" | "en"): { rows: Row[]; nowMin: number; workingCount: number } {
  const locale = lang === "en" ? "en-US" : "zh-CN";
  // 列表第一个就是本地：那条横轴属于它
  const cities = keys.map((k) => findCity(k)).filter((c): c is City => !!c);
  const home = cities[0] ? zoneInfo(cities[0].tz, now, locale) : null;
  const nowMin = home?.min ?? 0;

  const rows = cities.map((c, i) => {
    const z = zoneInfo(c.tz, now, locale);
    const label = lang === "en" ? c.en : c.name;
    const key = cityKey(c);
    if (!z || !home) {
      return { key, label, cc: c.cc, home: i === 0, time: "--:--", working: false, off: false, weekday: null, dayDelta: 0, spans: [] };
    }
    /* 时差用两边的 UTC 偏移相减，不能用墙上时间相减。
       厦门 +8、利马 −5，真实差是 −13 小时；拿墙上分钟数去减再折回 ±12 小时，
       会把它算成「+11 小时」—— 方向反了，整条时间带就画到轴的另一头去。
       跨时区的真实差最大能到 26 小时，本来就装不进 ±12 那个圈。 */
    const diff = z.offset - home.offset;

    // 对方 9:00 落在我这条轴上的位置 = 9:00 − 时差；越过零点就切成两段
    const from = (((WORK_FROM * 60 - diff) % 1440) + 1440) % 1440;
    const to = from + (WORK_TO - WORK_FROM) * 60;

    const off = weekendOf(c.cc).includes(z.dow);

    return {
      key,
      label,
      cc: c.cc,
      home: i === 0,
      time: hhmm(z.min),
      working: !off && z.min >= WORK_FROM * 60 && z.min < WORK_TO * 60,
      off,
      weekday: off ? z.weekday : null,
      dayDelta: Math.round((z.day - home.day) / 86_400_000),
      spans: toSpans(from, to),
    };
  });

  return { rows, nowMin, workingCount: rows.filter((r) => !r.home && r.working).length };
}

export function WorldClocks() {
  const { t, lang } = useT();
  const [keys, setKeys] = useStored<string[]>("mt.clocks", DEFAULT_CITIES);
  const [adding, setAdding] = useState(false);
  /* 自己走表，不蹭父组件的。20 秒一格：显示到分钟，最多晚 20 秒，
     而且此刻那条竖线也跟着往右挪，看得出它是活的。 */
  const tick = useTick(20_000);
  const { rows, nowMin, workingCount } = useMemo(() => buildRows(keys, new Date(), lang), [keys, lang, tick]);
  const home = rows[0];

  /** 换本地 = 把它挪到第一位。整条横轴跟着换，其余城市的亮块自动重算 */
  const makeHome = (key: string) => setKeys([key, ...keys.filter((k) => k !== key)]);

  return (
    <Menu
      hover
      align="end"
      width={420}
      trigger={(p) => (
        /* 芯片上原来是个地球，于是「16:00」到底是哪儿的时间没人说得准。
           换成本地那座城市的国旗 + 城市名：这个数是**你**的时间，一眼就定了性。
           顶栏挤起来时城市名先让位，国旗留着 —— 它用 18px 就把「哪儿」讲清楚了。 */
        <button
          className="clock-chip"
          {...p}
          ref={p.ref}
          aria-label={`${home?.label ?? ""} ${home?.time ?? ""} · ${t("{n} 地在上班", { n: workingCount })}`}
        >
          <Flag cc={home?.cc} />
          <span className="clock-chip-city">{home?.label ?? ""}</span>
          <b>{home?.time ?? "--:--"}</b>
          <span className="clock-chip-sep" aria-hidden="true" />
          <span className="clock-chip-n" data-on={workingCount > 0 ? "1" : "0"}>
            {t("{n} 地在上班", { n: workingCount })}
          </span>
        </button>
      )}
    >
      {() =>
        adding ? (
          <PickList
            title={t("添加城市")}
            placeholder={t("搜城市或国家…")}
            onBack={() => setAdding(false)}
            items={CITY_BOOK.filter((c) => !keys.includes(cityKey(c))).map((c) => ({ ...c, key: cityKey(c) }))}
            text={(c) => [c.name, c.en, c.tz]}
            onPick={(c) => {
              setKeys([...keys, c.key]);
              setAdding(false);
            }}
            render={(c) => (
              <>
                <Flag cc={c.cc} />
                <span className="truncate">{lang === "en" ? c.en : c.name}</span>
                <span className="spacer" />
                <span className="pick-hint">{zoneNow(c.tz)}</span>
              </>
            )}
          />
        ) : (
          <div className="tz">
            <header className="tz-head">
              <b>{t("世界时间")}</b>
              <span className="muted">
                {t("本地")} {home?.label ?? "—"} {home?.time ?? ""}
              </span>
            </header>

            {/* 刻度是本地的一天。所有行共用它，才比得出先后 */}
            <div className="tz-scale" aria-hidden="true">
              <span className="tz-lane">
                {[0, 6, 12, 18, 24].map((h) => (
                  <span key={h} style={{ left: pct(h * 60) }}>
                    {h}
                  </span>
                ))}
              </span>
            </div>

            <div className="tz-rows">
              {rows.map((r) => (
                <div
                  className="tz-row"
                  key={r.key}
                  data-home={r.home ? "1" : "0"}
                  data-working={r.working ? "1" : "0"}
                  data-off={r.off ? "1" : "0"}
                >
                  <span className="tz-city">
                    <Flag cc={r.cc} />
                    <span className="truncate">{r.label}</span>
                  </span>
                  <span className="tz-time">
                    {r.time}
                    {r.dayDelta ? <i>{t(r.dayDelta > 0 ? "明" : "昨")}</i> : null}
                    {r.weekday ? <i>{r.weekday}</i> : null}
                  </span>
                  <span className="tz-band">
                    {r.spans.map((s, i) => (
                      <i key={i} className="tz-work" data-cut={s.cut ?? ""} style={{ left: pct(s.from), width: pct(s.to - s.from) }} />
                    ))}
                  </span>
                  {/* 两个按钮只在这一行悬停时露出来：面板的常态是「看」，不是「改」 */}
                  {r.home ? (
                    <span className="tz-acts" />
                  ) : (
                    <span className="tz-acts">
                      <button className="row-x" onClick={() => makeHome(r.key)} data-tip={t("设为本地")} aria-label={t("把 {city} 设为本地", { city: r.label })}>
                        <Icon name="home" size={12} />
                      </button>
                      <button
                        className="row-x"
                        onClick={() => setKeys(keys.filter((k) => k !== r.key))}
                        data-tip={t("移除")}
                        aria-label={t("移除 {city}", { city: r.label })}
                      >
                        <Icon name="x" size={12} />
                      </button>
                    </span>
                  )}
                </div>
              ))}
              {/* 竖线画在行的外面、盖在整片轨道上 —— 每行画一条的话，
                  行与行之间的缝隙会把它断成六截 */}
              <span className="tz-now" aria-hidden="true">
                <span className="tz-lane">
                  <i style={{ left: pct(nowMin) }} />
                </span>
              </span>
            </div>

            <footer className="tz-bar">
              <button className="link-btn" onClick={() => setAdding(true)}>
                <Icon name="plus" size={13} />
                {t("添加城市")}
              </button>
            </footer>
            <p className="tz-foot">{t("色块 = 对方的上班时段（当地 9:00–18:00），按你的钟摆放；空心 = 当天是对方的休息日；竖线 = 此刻。")}</p>
          </div>
        )
      }
    </Menu>
  );
}
