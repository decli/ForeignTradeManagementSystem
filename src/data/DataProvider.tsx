import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { load, snapshot, subscribe } from "./db";
import type { Database } from "./types";
import { tr } from "@/i18n";

const Ready = createContext(false);

/**
 * 账套装载。`useSyncExternalStore` 订阅内存库，任何一次 `mutate()` 都会
 * 把订阅到的组件重渲染一遍 —— 不需要在每个页面写 refetch。
 */
export function DataProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    load()
      .then(() => alive && setReady(true))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return (
      <div className="boot">
        <p>{tr("账套装载失败：{err}", { err: error })}</p>
        <button className="btn" onClick={() => location.reload()}>
          {tr("重新装载")}
        </button>
      </div>
    );
  }
  if (!ready) return <>{fallback}</>;
  return <Ready.Provider value>{children}</Ready.Provider>;
}

export function useDb(): Database {
  if (!useContext(Ready)) throw new Error("useDb 必须在 DataProvider 内使用");
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
