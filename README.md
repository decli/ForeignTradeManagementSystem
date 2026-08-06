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

## 目前做完了什么

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| **跟单表** `/follow-ups` | ✅ 接数据库 | 见下 |
| 其余 24 个模块 | 占位页 | 侧栏可点，展示该模块定位与功能范围 |

跟单表已实现：

- **里程碑航程线** —— 交期 / 装柜 / 进仓 / ATD / ETA 连成一条带进度填充的线。
  已发生的实心，当前节点带光晕，计划日已过还没确认的转珊瑚红，悬停看「计划 vs 实际」。
  整柜四个节点，拼柜多一个「进仓」。
- **动态就地改** —— 点一下动态就能编辑，常用短语一键填入。动态写成流水（`ShipmentNote`），
  同时冗余一份到批次上供列表读取，所以既有历史又不牺牲列表性能。
- **批量更新** —— 勾选多行，底部升起操作条，一次写完动态 + 日期 + 放行状态，**带撤销**。
- **详情抽屉** —— 概览 / 动态流水 / 单证齐套三个标签，看完就关，列表筛选与滚动位置不丢。
- **筛选走 URL** —— 搜索防抖 300ms，刷新和分享链接都能复现同一个视图。
- **停滞与超期识别** —— 超过 7 天没有新动态标「停滞 N 天」，里程碑超期标红并计入表头统计。
- **软删除 + 撤销** —— 「删除」置 `archived` 而不是真删；外贸单据要留痕，也才撤销得回来。
- **写操作全留痕** —— 每次写入落一条 `AuditLog`，记录改动前后值。

---

## 两条硬约定

**1. 金额一律用整数「分」存。** SQLite 没有真正的 `DECIMAL`，浮点会让订单核算和退税
凑不平账。所有金额字段是 `BigInt`（单位：分），汇率存 6 位小数的整数
（`6.7392` → `6739200`），只在展示层格式化 —— 见 `src/lib/format.ts`。

**2. 只用 SQLite 与 MySQL 都支持的类型。** 状态存字符串 + 应用层枚举（不用 MySQL `ENUM`），
`AuditLog.before/after` 存 JSON 文本（不用 `Json` 类型）。这样切库时 schema 不用改。

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
const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
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
src/
  app/
    follow-ups/          跟单表：page.tsx（服务端查询）+ actions.ts（写操作）
    m/[slug]/            未开发模块的占位页
    layout.tsx           应用外壳 + 汇率
    globals.css          设计令牌与组件样式
  components/
    app-shell.tsx        侧栏 + 顶栏 + 提示条
    milestone-rail.tsx   里程碑航程线（签名组件）
    follow-ups/          筛选条、表格、抽屉
  server/
    shipments.ts         查询与视图映射（BigInt 在这里转成可序列化的数字）
  lib/
    db.ts                Prisma 单例
    format.ts            金额 / 日期格式化
    nav.ts               信息架构（侧栏 25 个模块）
```

---

## 技术栈

Next.js 16（App Router）· React 19 · TypeScript · Tailwind CSS v4 ·
Prisma 7 + better-sqlite3 adapter · Node 22

**不引入**：Kafka、RabbitMQ、Redis、Elasticsearch、Oracle/PostgreSQL、微服务、K8s。
这个数据量用不上，装起来还麻烦。

---

## 后续排期

| 阶段 | 内容 |
| --- | --- |
| M1 | 登录 + 角色权限 + 数据范围；客户管理、PI 取号 |
| M2 补齐 | 跟单表的 Excel 导入导出、新增/编辑批次表单、里程碑日期就地改 |
| M3 | 订单核算跟踪 + 收付款 + 供应商 / 采购合同 |
| M4 | 退税管理 + 单证备案 + 银行日记账 |
| M5 | 数据看板 + 报表中心 + 提成绩效 + 审计日志页面 |
