/**
 * 图标。统一 24 视窗、1.75 线宽、圆头圆角 —— 混用不同线宽的图标是
 * 界面「看着不对劲」最常见的来源之一。
 */

export const ICONS = {
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M20 20l-4-4",
  x: "M6 6l12 12M18 6L6 18",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  check: "M4 12.5 9 17.5 20 6.5",
  chevronDown: "m6 9 6 6 6-6",
  chevronRight: "m9 6 6 6-6 6",
  chevronLeft: "m15 6-6 6 6 6",
  chevronsLeft: "m11 6-6 6 6 6M18 6l-6 6 6 6",
  arrowUp: "M12 19V5M6 11l6-6 6 6",
  arrowDown: "M12 5v14M6 13l6 6 6-6",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  sort: "M12 4v16M8 8l4-4 4 4",
  download: "M12 3v12M8 11l4 4 4-4M4 19h16",
  upload: "M12 17V5M8 9l4-4 4 4M4 21h16",
  sun: "M12 6.5A5.5 5.5 0 1 0 12 17.5 5.5 5.5 0 0 0 12 6.5M12 1.5v2M12 20.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1.5 12h2M20.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5",
  monitor: "M4 5h16v11H4zM9 20h6M12 16v4",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21a8 8 0 0 1 16 0",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M18 21h4a5.5 5.5 0 0 0-4-5.3",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  ship: "M3 17c1.5 1 3 1 4.5 0S10.5 16 12 17s3 1 4.5 0S19.5 16 21 17M5 14V8h14l-2 6M12 8V4",
  box: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9",
  cart: "M2 3h3l2.6 12h11.2L21 7H6M9 20.5a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6M18 20.5a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  pie: "M12 3a9 9 0 1 0 9 9h-9z",
  building: "M3 21V9l9-6 9 6v12M9 21v-6h6v6",
  wallet: "M3 6h18v13H3zM3 10h18M7 15h4",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4",
  shield: "M12 3l8 3v6c0 4.5-3.2 7.9-8 9-4.8-1.1-8-4.5-8-9V6z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3.5 2",
  alert: "M12 3l9.5 17H2.5zM12 10v4M12 17.2v.1",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 11v5M12 8v.1",
  trash: "M4 6h16M9 6V4h6v2M6 6l1 14h10l1-14",
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  flag: "M4 15V4h13l-1.5 3L17 10H4M4 21V10",
  filter: "M3 5h18l-7 8v6l-4 2v-8z",
  columns: "M4 4h16v16H4zM10 4v16M16 4v16",
  layout: "M4 4h16v16H4zM4 9h16M9 20V9",
  refresh: "M20 11a8 8 0 1 0-.6 4M20 5v6h-6",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  more: "M6 12h.1M12 12h.1M18 12h.1",
  pin: "M9 4h6l-1 6 3 3v2H7v-2l3-3zM12 15v5",
  star: "M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 17l-5.3 2.7 1.1-5.9L3.5 9.7l5.9-.8z",
  home: "M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z",
  sliders: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4",
  database: "M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  key: "M15.5 8.5a3.5 3.5 0 1 1-3.4 4.4L11 14l-1.5-1.5L8 14l-2-2 6.1-6.1a3.5 3.5 0 0 1 3.4 2.6",
  lock: "M6 11h12v9H6zM9 11V7.5a3 3 0 0 1 6 0V11",
  mail: "M3 6h18v12H3zM3 7l9 6 9-6",
  calendar: "M4 6h16v14H4zM4 10h16M9 3v4M15 3v4",
  link: "M10 13a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7L11 6.4M14 11a4 4 0 0 0-5.7 0L5.7 13.6a4 4 0 0 0 5.7 5.7L13 17.6",
  unlink: "M8.5 15.5 6 18a4 4 0 0 1-5.7-5.7l2.6-2.6M15.5 8.5 18 6a4 4 0 0 1 5.7 5.7M4 4l16 16",
  eye: "M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  command: "M6 9a3 3 0 1 1 3-3v12a3 3 0 1 1-3-3h12a3 3 0 1 1-3 3V6a3 3 0 1 1 3 3z",
  panel: "M4 4h16v16H4zM10 4v16",
  sparkle: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M3 12h18M12 3c2.5 2.4 3.8 5.5 3.8 9S14.5 18.6 12 21C9.5 18.6 8.2 15.5 8.2 12S9.5 5.4 12 3",
  tag: "M11 3H4v7l10 10 7-7zM8 8h.1",
  play: "M7 4l12 8-12 8z",
  gauge: "M12 20a8 8 0 1 1 8-8M12 12l4.5-3.5",
  inbox: "M4 13h4l1.5 3h5L16 13h4M4 13l2.5-8h11L20 13v6H4z",
  lightning: "M13 3 5 14h6l-1 7 8-11h-6z",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size, className, style }: { name: IconName; size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={size ? { width: size, height: size, ...style } : style}
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}
