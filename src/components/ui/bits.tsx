import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/Icon";
import type { Tone } from "@/lib/rules";

export function Pill({ tone = "mute", children, dot = true, className = "" }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return <span className={`pill ${tone}${dot ? "" : " no-dot"} ${className}`}>{children}</span>;
}

export function Avatar({ name, hue = 0, src, size = "" }: { name: string; hue?: number; src?: string | null; size?: "" | "sm" | "lg" }) {
  const initial = /^[a-zA-Z]/.test(name) ? name.slice(0, 1).toUpperCase() : name.slice(-2);
  return (
    <span className={`avatar${size ? ` avatar-${size}` : ""}`} data-hue={hue % 11} aria-hidden="true">
      {src ? <img src={src} alt="" referrerPolicy="no-referrer" /> : initial}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "",
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
  size?: "" | "lg";
  label?: string;
}) {
  return (
    <div className={`seg${size ? ` seg-${size}` : ""}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count !== undefined ? <span className="muted" style={{ marginLeft: 5 }}>{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="search">
      <Icon name="search" />
      <input
        className="input"
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder ?? "搜索"}
      />
      {value ? (
        <button className="search-clear" onClick={() => onChange("")} aria-label="清空搜索">
          <Icon name="x" />
        </button>
      ) : null}
    </div>
  );
}

/** 空态说人话：写清楚「为什么空」和「下一步按哪」，不要只放一句「暂无数据」 */
export function EmptyState({
  icon = "inbox",
  title,
  desc,
  action,
}: {
  icon?: IconName;
  title: string;
  desc?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-mark">
        <Icon name={icon} />
      </span>
      <h3>{title}</h3>
      {desc ? <p>{desc}</p> : null}
      {action ? <div style={{ marginTop: 4 }}>{action}</div> : null}
    </div>
  );
}

export function Chip({ label, value, onClear }: { label: string; value: string; onClear: () => void }) {
  return (
    <span className="chip">
      {label} <b>{value}</b>
      <button onClick={onClear} aria-label={`清除筛选 ${label}`}>
        <Icon name="x" />
      </button>
    </span>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

/** 键值对，抽屉和详情页里到处都是 */
export function KV({ k, v, mono = false }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div className="kv">
      <span>{k}</span>
      <div className={mono ? "num" : undefined}>{v}</div>
    </div>
  );
}

export function Bar({ value, max, tone = "" }: { value: number; max: number; tone?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`bar ${tone}`}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}
