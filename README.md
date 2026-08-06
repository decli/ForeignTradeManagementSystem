# MT 通商 · TRADEFLOW

外贸业务管理系统：跟单、订单核算、退税、资金。

单进程单端口，一条命令跑起来；数据库默认是一个 SQLite 文件，拷走即备份，
将来可平滑切到 MySQL。

- 设计与技术选型：[`docs/design-proposal.md`](docs/design-proposal.md)
- 可点击原型（全模块，模拟数据）：[`docs/ui-prototype.html`](docs/ui-prototype.html)，浏览器直接打开

---

## 快速开始

```bash
npm install
cp .env.example .env          # DATABASE_URL="file:./dev.db"
npx prisma migrate dev        # 建库建表
npx prisma db seed            # 灌一份演示数据
npm run dev                   # http://localhost:3000
```

打开后默认进「跟单表」。演示账号 `admin / demo1234`（登录功能在 M1 排期，当前直接进入）。

生产：

```bash
npm ci && npm run build && npm start   # 默认 3000 端口
```

---

## 已经做完的模块

| 模块 | 路由 | 状态 |
| --- | --- | --- |
| 数据看板 | `/dashboard` | ✅ 接数据库 |
| 客户管理 | `/customers` | ✅ 接数据库 |
| 跟单表 | `/follow-ups` | ✅ 接数据库 |
| 订单核算跟踪 | `/orders` | ✅ 接数据库 |
| 退税管理 | `/tax-refund` | ✅ 接数据库 |
| 审计日志 | `/audit` | ✅ 接数据库 |
| 其余 22 个模块 | `/m/<slug>` | 占位页，说明该模块定位与功能范围 |

### 跟单表

- **里程碑航程线** —— 交期 / 装柜 / 进仓 / ATD / ETA 连成一条带进度填充的线。
  已发生的实心，当前节点带光晕，计划日已过还没确认的转珊瑚红，悬停看「计划 vs 实际」。
  整柜四个节点，拼柜多一个「进仓」。
- **动态就地改** —— 点一下动态就能编辑，常用短语一键填入。动态写成流水（`ShipmentNote`），
  同时冗余一份到批次上供列表读取，既有历史又不牺牲列表性能。
- **批量更新** —— 勾选多行，底部升起操作条，一次写完动态 + 日期 + 放行状态，**带撤销**。
- **详情抽屉** —— 概览 / 动态流水 / 单证齐套三个标签。
- **停滞与超期识别** —— 超过 7 天没有新动态标「停滞 N 天」，里程碑超期标红并计入表头统计。
- **软删除 + 撤销** —— 「删除」置 `archived` 而不是真删；外贸单据要留痕，也才撤销得回来。

### 订单核算跟踪

- KPI：订单总数 / 未完结 / 利润率预警 &lt;11% / 负毛利 / 在跟订单额（人民币单按自定汇率折算并入）
- 在跟进 · 已归档、结算状态分段筛选，「只看利润率预警」一键聚焦
- 利润率按语义色分档；数据不全的行标「费用估算未填」「采购成本未录」
- 点行开抽屉：成本构成堆叠条、收付款进度、关联的出运批次与退税发票

### 退税管理

- KPI 随公司段联动重算；金额按公司段全量口径，申报月只决定「本月申报」那张卡
- 未关联订单的行标红，**关联向导**可搜 PI 号 / 客户 / 产品挂上去，带撤销
- 税额合计随筛选实时重算

### 数据看板

- 五张 KPI + 月度出运与订单额组合图 + 目的国 TOP + 业务员业绩 + 利润率分布
- 「今天要处理什么」清单：停滞、超期、负毛利、退税未关联、额度超限，每条都能跳到能处理它的页面
- 图表是服务端渲染的纯 SVG，没有图表库依赖

### 通用

- **Excel 导出** —— 三个台账都能导出真正的 `.xlsx`（不是改名的 CSV），
  金额写成数字带 Excel 原生格式，财务拿到能直接求和；**导出跟随当前筛选条件**
- **写操作全留痕** —— 每次写入落一条 `AuditLog`，审计日志页面按人 / 单据回查改动前后值
- 浅色 / 深色主题，侧栏可折叠

---

## 两条硬约定

**1. 金额一律用整数「分」存。** SQLite 没有真正的 `DECIMAL`，浮点会让订单核算和退税
凑不平账。所有金额字段是 `BigInt`（单位：分），汇率存 6 位小数的整数
（`6.7392` → `6739200`），只在展示层格式化 —— 见 `src/lib/format.ts`。

**2. 只用 SQLite 与 MySQL 都支持的类型。** 状态存字符串 + 应用层枚举（不用 MySQL `ENUM`），
`AuditLog.before/after` 存 JSON 文本（不用 `Json` 类型）。这样切库时 schema 不用改。

---

## 测试

```bash
npm test          # 先构建再跑，34 条端到端用例
npm run test:only # 跳过构建（改了测试没改源码时用）
```

用例跑在**真实的 Next 服务 + 真实 SQLite** 上，不打桩：改动态、批量更新、关联发票
都是真的写库，然后断言刷新后还在。每次开跑前会重灌演示数据，保证可重复。

覆盖：里程碑渲染、就地改动态、批量更新与撤销、软删除与撤销、筛选写进 URL、
空态文案、详情抽屉、订单利润率排序与预警筛选、退税公司段联动、关联向导、
看板图表与风险跳转、客户主从、审计留痕、xlsx 导出（含跟随筛选）、
侧栏 28 个模块、深色模式、六个页面都不横向溢出。

> **测试必须跑生产构建，不能用 dev server。** 除了 dev 按需编译会让用例撞上编译延迟，
> 更要命的是 **dev 模式下 Server Action 结束后会把客户端 `router.replace` 写进查询串的
> 筛选条件丢掉**（筛完改一条数据，筛选自己复位了）。生产构建没有这个表现。
> 开发时如果遇到这个现象，是 dev 模式的行为差异，不是数据出错。

---

## 切换到 MySQL

共三处，应用代码不用动：

1. `prisma/schema.prisma` 里 `datasource.provider` 改成 `"mysql"`
2. `prisma.config.ts` 里 `migrations.path` 改成 `prisma/migrations-mysql`
   （两种方言生成的 DDL 不同，不能混用同一个迁移目录）
3. `src/lib/db.ts` 和 `prisma/seed.ts` 里的 adapter 换掉：

```bash
npm i @prisma/adapter-mariadb
```

```ts
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
const adapter = new PrismaMariaDb(databaseUrl());
```

然后把 `DATABASE_URL` 换成连接串，跑 `npx prisma migrate dev`。
存量数据用一次性导出导入脚本搬迁。

---

## 目录结构

```
prisma/
  schema.prisma          数据模型（含两条硬约定的说明）
  migrations-sqlite/     SQLite 方言的迁移
  seed.ts                演示数据
scripts/
  db-stats.ts            快速查看库里的关键计数
src/
  app/
    dashboard/           数据看板
    customers/           客户管理
    follow-ups/          跟单表：page.tsx（服务端查询）+ actions.ts（写操作）
    orders/              订单核算跟踪
    tax-refund/          退税管理 + 关联订单 action
    audit/               审计日志
    api/export/[kind]/   xlsx 导出
    m/[slug]/            未开发模块的占位页
    globals.css          设计令牌与组件样式
  components/
    app-shell.tsx        侧栏 + 顶栏 + 提示条
    milestone-rail.tsx   里程碑航程线（签名组件）
    dashboard/charts.tsx 服务端 SVG 图表
    follow-ups/ orders/ tax/ customers/
  server/                查询与视图映射（BigInt 在这里转成可序列化的数字）
  lib/                   db / 金额日期格式化 / 信息架构 / 判定规则
tests/                   端到端用例
```

**约定**：`src/server/*` 只在服务端跑；客户端组件要用的常量和纯函数放 `src/lib/*`。
从 `"use client"` 模块里 import 函数到服务端页面会直接报错，反过来把 `server/*`
的值 import 进客户端组件，会把 Prisma 和 better-sqlite3 打进浏览器包。

---

## 技术栈

Next.js 16（App Router）· React 19 · TypeScript · Tailwind CSS v4 ·
Prisma 7 + better-sqlite3 adapter · write-excel-file · Playwright · Node 22

**不引入**：Kafka、RabbitMQ、Redis、Elasticsearch、Oracle/PostgreSQL、微服务、K8s。
这个数据量用不上，装起来还麻烦。

---

## 后续排期

| 阶段 | 内容 |
| --- | --- |
| M1 | 登录 + 角色权限 + 数据范围；PI 取号、我的订单 |
| M2 补齐 | Excel **导入**、新增/编辑批次与订单表单、里程碑日期就地改 |
| M3 | 收付款 / 财务、供应商、采购合同、询价单、生产单 |
| M4 | 单证备案、银行日记账、资金汇总、费用明细 |
| M5 | 报表中心、提成与绩效、系统设置与权限 |
