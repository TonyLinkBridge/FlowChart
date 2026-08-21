# Runflow · 跑流程

别人的流程图是画出来给人看的，这一张可以跑一遍。

## 能干什么

- **四种视图共用一份数据** — 流程图 / 泳道 / 时间条 / 清单，在任何一个里打勾，另外三个跟着变
- **附注** — 鼠标移到节点上就看到；操作步骤能逐条打勾，自动汇总成节点进度
- **粘贴生成** — 把有条理的文字或一段 Mermaid 粘进来，直接成图
- **导出** — PNG / SVG / JSON / Mermaid，**附注跟着一起走**（图下面自动接一张附注表）
- **多张图 + 分组** — 左侧栏管理，存在你自己的账号下

## 跑起来

```bash
pnpm install
cp .env.example .env.local   # 照里面的注释填 Clerk 和 Supabase 的值
pnpm dev
```

登录走 Clerk，数据库是 Supabase（只存数据，不管登录）。
浏览器不直连数据库 —— 所有读写走 /api，服务端先验身份再按人过滤。

全新数据库跑 `supabase/schema.sql`；老库从 Supabase Auth 迁移的跑 `supabase/migrate-to-clerk.sql`。脚本 —— 到 Supabase 后台的 SQL Editor 整段粘贴运行。

## 技术

Next.js 16 · React 19 · Clerk（登录）· Supabase（数据）· 原生 CSS（无 Tailwind）

排版、连线、排期都是自己实现的，没有引流程图库。
