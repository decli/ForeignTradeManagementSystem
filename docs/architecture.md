# 架构说明 —— 从全栈单服务改造为纯静态站

> 上一版是 Next.js 16 + Prisma 7 + SQLite 的单进程单端口服务。
> 这一版把它改造成**纯静态前端**，为的是能免费发布到 GitHub Pages。
> 这篇写清楚：改了什么、为什么这么改、以及怎么改回去。

---

## 1. 改造前后

| | 改造前 | 改造后 |
| --- | --- | --- |
| 运行方式 | Node 进程，监听 3000 端口 | 一堆静态文件，没有进程 |
| 框架 | Next.js 16 App Router（服务端渲染 + Server Actions） | Vite 7 + React 19（客户端渲染） |
| 路由 | 文件系统路由 | react-router 7 + `404.html` 回落 |
| 数据库 | SQLite 文件 + Prisma 7 | 浏览器 IndexedDB |
| 查询 | `src/server/*` 里的 Prisma 查询（async） | `src/data/queries.ts` 里的纯函数（sync） |
| 写操作 | Server Actions | `src/data/mutations.ts` |
| 登录 | 排期中（Cookie Session + argon2） | Google 登录 / 本地账密（PBKDF2） |
| Excel 导出 | 服务端 `/api/export/[kind]` | 浏览器里生成 Blob 下载 |
| 托管成本 | 一台机器 | 0 |

**没变的**：数据模型的字段与语义、视图模型的返回结构、业务判定规则
（停滞 7 天、利润率预警 11%、中信保 85%）、金额用整数分存的约定、
写操作必须留痕的约定。

---

## 2. 为什么数据放 IndexedDB，而且整库存一条记录

先说为什么不是 localStorage：它是同步 API，写 300 KB 台账会卡住主线程；
5 MB 的上限对导入过 Excel 的账套也不够用。

再说为什么不按表分 object store，而是把整个 `Database` 对象存成一条记录：

这个数据量是**千行级**，一次性读进内存完全撑得住。换来的好处很实在：

1. **查询是同步的。** 表格筛选、排序、看板聚合都不用 `async`，
   页面里没有一处 loading 状态需要传递。`useSyncExternalStore` 订阅内存库，
   任何一次写入自动重渲染所有订阅者 —— 没有一行 refetch 代码。
2. **写入天然是原子的。** 一次 `put` 要么整库更新要么不动，
   不会出现「批次更新了但动态流水没写进去」这种半截状态。
3. **导出就是 `JSON.stringify`。** 备份、迁移、发给同事复现问题，都是一个文件。

代价是每次写入要把整个对象序列化一遍。实测千行级在几毫秒量级，
而且写入本来就防抖了 220ms，一次批量更新只落一次盘。

```
组件  ──useDb()──▶  useSyncExternalStore
                          │
                    src/data/db.ts   ← 内存里的 Database（唯一真相）
                          │  mutate()
                          ▼
                    防抖 220ms → IndexedDB（一条记录）
```

---

## 3. 演示数据的时间轴跟着「今天」走

原始台账是照 2026-08-07 那天的真实业务写的。如果把日期写死，
这个演示站放上半年后会变成一堆「全部超期」的死数据 ——
停滞、超期、本月出运这些判定全部失效，看板首屏一片红。

所以 `src/data/seed.ts` 里所有日期都按 `today − ANCHOR` 的差值整体平移。
生成的批次还会**反着推时间轴**：先决定这票走到第几步，
再把「下一个待办节点」摆到今天前后（约 14% 落在过去 → 超期）。
不这么做的话，随机出来的批次绝大多数都会显示成超期。

手写的那批行（客户备注、动态、产品名）一个字都没改 ——
生成器写不出「并柜方还差一家没进仓，货代说最晚 8 号截仓」这种话。
机器只负责在它们周围补量，主线剧情还是手写的。

---

## 4. 认证：能做到什么，做不到什么

**做不到的**：真正的认证。没有服务端就没有服务端校验，
浏览器里跑的校验逻辑，改改前端代码就能绕过。

**做到的**：

- **Google 登录**走官方 Google Identity Services，拿到的 `credential` 是一个真实的
  JWT。前端只解 payload 用于**认人**（头像、名字、邮箱），不用于**授权**。
  要接真后端时，把这个 credential 原样 POST 给服务端验签即可，
  `src/auth/google.ts` 一行不用改。
- **账密登录**用 WebCrypto 的 PBKDF2-SHA256、随机盐、12 万轮，跟真后端一个做法。
  它解决的是「别让口令以明文躺在别人的电脑上」—— 共用机器、浏览器同步、
  导出的账套 JSON 都可能被看到。导出账套时凭据会被整段剔掉。
- **角色与数据范围**是真的在生效：角色（`admin` / `sales` / `finance` / `viewer` …）
  决定能不能写，数据范围（`self` / `team` / `all`）决定 `listShipments` /
  `listOrders` / `listCustomers` 返回哪些行。用 `viewer` 登录，所有写按钮都是禁用的。

这三件事在演示站上是**产品能力的展示**，不是安全边界。数据本来就都在
用户自己的浏览器里，越权也越不到别人的数据。

---

## 5. 部署：两条 base 路径

GitHub Pages 有两种站点，路径不一样：

| 站点 | URL | base |
| --- | --- | --- |
| 用户站点 | `https://decli.github.io/` | `/` |
| 项目站点 | `https://decli.github.io/ForeignTradeManagementSystem/` | `/ForeignTradeManagementSystem/` |

资源路径和路由 `basename` 都得跟着 base 走，所以构建两次：

```bash
npm run build:root       # base = /
npm run build:project    # base = /ForeignTradeManagementSystem/
```

运行时 `src/main.tsx` 从 `import.meta.env.BASE_URL` 取 basename，两种部署共用一套代码。

**深链接 404**：Pages 是纯文件服务，请求 `/follow-ups` 时磁盘上没有这个文件。
构建插件把 `index.html` 再拷一份成 `404.html`，Pages 找不到路径时会把它吐回来，
浏览器照常执行 SPA，路由读 `location.pathname` 渲染出正确页面。
URL 保持干净，不用 hash 路由。

---

## 6. 接回真后端

需要动的只有一个文件：`src/data/db.ts`。

它现在对外只暴露四件事：

```ts
load()                       // 装载账套
snapshot()                   // 取当前账套（同步）
mutate(draft => { ... })     // 唯一写入口
subscribe(fn)                // 变更订阅
```

接后端有两条路：

**A. 保持同步查询（推荐，改动最小）** —— `load()` 改成一次 `GET /api/snapshot`
把账套拉下来，`mutate()` 改成「本地先改（乐观更新）+ `POST /api/mutations` 上报，
失败则回滚」。`queries.ts`、所有页面组件、DataGrid 全部不用动。
适合单公司、数据量在万行以内的场景 —— 也就是这个系统的实际场景。

**B. 改成按需查询** —— `queries.ts` 里的每个函数换成一次 fetch，
返回结构保持现在的字段名不变，页面组件把 `useMemo` 换成数据获取 hook。
工作量集中在页面的加载态，视图模型和样式不用动。

数据模型这边，`src/data/types.ts` 是原 Prisma schema 的平移，字段名一一对应，
把它翻回 `schema.prisma` 是机械劳动。两条硬约定（金额整数分、
状态存字符串不用枚举类型）就是为了这一步留的。

---

## 7. 明确不做的事

- **不引 UI 组件库**。这是一个数据密度极高的台账应用，
  冻结列、列宽拖拽、密度切换、卡片降级这些都要贴着业务改，
  组件库的默认样式会被覆盖到面目全非，还留下一份删不掉的依赖。
- **不引图表库**。只需要三种图，任何主流库的体积都超过整个应用的其余部分，
  而且默认配色会跟设计令牌打架，深色模式还要再改一遍。手写 SVG 反而更省事。
- **不引状态管理库**。唯一的全局状态是账套，`useSyncExternalStore` 直接够用；
  筛选条件写在 URL 里，本来就不该进内存状态。
- **不做 PWA / 离线缓存**。整站已经是静态文件，浏览器缓存就是离线能力；
  再叠一层 Service Worker 只会让「用户看到的是不是最新版本」变复杂。
