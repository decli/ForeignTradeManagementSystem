import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { useTextField } from "@/lib/hooks";
import { useT } from "@/i18n";

/**
 * 「加一个」的选择列表。汇率面板加币种、时钟面板加城市，用的是同一个东西。
 *
 * 做成**面板内换页**而不是再弹一层：弹层套弹层要处理两套定位、两套点外面关闭，
 * 而且第二层一出来第一层就被盖住，用户会忘记自己本来在哪。
 * 换页只是同一块面板里的内容替换 —— 有返回箭头，回得去。
 *
 * 搜索框走 useTextField：这里要能搜「越南」「东京」，直接受控会被输入法卡死。
 */
export function PickList<T extends { key: string }>({
  items,
  text,
  placeholder,
  onPick,
  onBack,
  title,
  render,
}: {
  items: T[];
  /** 参与搜索的文本，全部小写匹配 */
  text: (item: T) => string[];
  placeholder: string;
  onPick: (item: T) => void;
  onBack: () => void;
  title: string;
  render: (item: T) => React.ReactNode;
}) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const field = useTextField(q, setQ);

  const hits = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return items;
    return items.filter((it) => text(it).some((s) => s.toLowerCase().includes(k)));
    // text 是每次渲染新建的箭头函数，进依赖会让这里每次都重算 —— 它只依赖 items 与 q
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, q]);

  return (
    <div className="pick">
      <header className="pick-head">
        <button className="icon-btn" onClick={onBack} aria-label={t("返回")}>
          <Icon name="chevronLeft" />
        </button>
        <b>{title}</b>
      </header>

      <div className="search pick-search">
        <Icon name="search" />
        <input
          className="input"
          type="search"
          autoFocus
          value={field.value}
          onChange={field.onChange}
          onCompositionStart={field.onCompositionStart}
          onCompositionEnd={field.onCompositionEnd}
          placeholder={placeholder}
          aria-label={placeholder}
        />
      </div>

      <div className="pick-list">
        {hits.length === 0 ? (
          <p className="pick-empty">{t("没搜到「{q}」", { q })}</p>
        ) : (
          hits.map((it) => (
            <button key={it.key} className="pick-item" onClick={() => onPick(it)}>
              {render(it)}
              <Icon name="plus" size={14} />
            </button>
          ))
        )}
      </div>
    </div>
  );
}
