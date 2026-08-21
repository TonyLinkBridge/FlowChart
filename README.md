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
cp .env.example .env.local   # 填上 Supabase 的两个值
pnpm dev
```

`.env.local` 需要：

```
NEXT_PUBLIC_SUPABASE_URL=https://你的项目.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的 anon key
```

数据库建表脚本在 `supabase/schema.sql` —— 到 Supabase 后台的 SQL Editor 整段粘贴运行。

## 技术

Next.js 16 · React 19 · Supabase（登录 + 数据）· 原生 CSS（无 Tailwind）

排版、连线、排期都是自己实现的，没有引流程图库。
