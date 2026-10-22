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

本地登录使用同一个 Clerk 应用的 **Development** 密钥（`pk_test_` / `sk_test_`）；
正式网站使用 Production 密钥。普通 `localhost` / `127.0.0.1` 不能直接使用正式环境密钥登录。
两个环境的用户编号互不通用；切换本地配置前，先确认专用测试账号和测试流程归属，不改业务流程的账号归属。
开发模式保留原始请求地址，避免 Clerk 的同页面改写将 `127.0.0.1` 改成 `localhost` 后产生自代理循环；正式模式的路由设置不变。

登录走 Clerk，数据库是 Supabase（只存数据，不管登录）。
浏览器不直连数据库 —— 所有读写走 /api，服务端先验身份再按人过滤。

全新数据库跑 `supabase/schema.sql`；老库从 Supabase Auth 迁移的跑 `supabase/migrate-to-clerk.sql`。脚本 —— 到 Supabase 后台的 SQL Editor 整段粘贴运行。

## 技术

Next.js 16 · React 19 · Clerk（登录）· Supabase（数据）· 原生 CSS（无 Tailwind）

排版、连线、排期都是自己实现的，没有引流程图库。

## 安全恢复历史版本

版本历史里的「查看差异」只读取内容。预览会列出步骤、附注/邮件模板、连线、外观、位置和排列顺序的变化。
确认后，服务器会在同一次数据库事务中完整备份当前内容、恢复选中存档、保存恢复后的新版本并记录操作。
其中任何写入失败都会全部回滚；若预览后有人保存了新内容，必须重新查看差异才能恢复。
恢复成功后的「查看并退回恢复前」会预览自动备份，退回时同样先备份当时的最新内容。

启用需要在对应 Supabase 项目执行 **`supabase/migrate-safe-restore.sql`** 一次（可重复执行）。
前提是该项目已应用 `schema.sql` 和 `migrate-team.sql`。这份升级只添加一个受限的服务端函数，
不修改现有流程、分组或历史内容。函数只允许服务端 `service_role` 调用，API 仍会先检查 Clerk 账号权限。
代码不会自动向线上数据库执行升级；升级未完成时，确认恢复会明确报错，不会退回旧的无备份恢复方式。

注意：此升级与旧的 `migrate-to-clerk.sql` 无关，**不要为启用恢复功能重跑旧迁移脚本**。

### 本地验证

```bash
pnpm test
pnpm exec tsc --noEmit --incremental false
pnpm run build
```

恢复数据库测试使用内存里的 PGlite/Postgres，不读取 `.env.local`，也不连接网站的数据库。
测试覆盖备份失败、恢复存档失败、日志失败的整笔回滚、并发保存、跨流程隔离、重复版本号和退回操作。

## 免费 Arc Dialog：删除前确认

按 [Arc Dialog 官方手动安装说明](https://uiarc.dev/components/dialog/markdown) 接入，
源码放在 `components/arc/`，保留 MIT 许可证。依赖固定为
`@radix-ui/react-dialog@1.3.1`、`motion@14.5.0` 和 `lucide-react@1.61.0`；不需要 Tailwind 或 shadcn 初始化。
Arc 的颜色、间距和字体变量只在弹窗内部映射到 RunFlow 风格，不导入会改变全站外观的基础样式。

删除入口组合 `Dialog`、`DialogTrigger asChild`、有标题和说明的 `DialogContent` 及 `DialogClose asChild`。
打开后默认聚焦「取消」，Tab / Shift+Tab 在弹窗内循环，Esc 或取消关闭后返回原删除按钮；系统减少动态效果的设置由 Arc 保留。
只有确认按钮调用原有 `onDelete(flowId)`，版本恢复、删除 API 和数据库逻辑保持原样。
确认界面不是回收站，也不提供删除后的恢复功能；警告会明确说明版本历史也随流程删除。

`tests/delete-flow-dialog.test.tsx` 使用假工作区和本地删除回调，覆盖确认、取消、键盘焦点及目标隔离，不连接数据库或删除真实流程。

## 免费 Arc Drawer：附注／邮件模板展开编辑

按 [Arc Drawer 官方手动安装说明](https://uiarc.dev/components/drawer/markdown) 接入，复用上面的三个固定版本依赖和 MIT 许可证。
`components/flow/NotePopover.tsx` 保留小预览；展开时使用受控 `Drawer`、`DrawerTrigger asChild`、右侧 `DrawerContent` 和 `DrawerClose asChild`。
现有节点附注入口仍可打开编辑。侧栏有标题、说明和模态语义，Tab / Shift+Tab 限制在侧栏内，Esc、关闭按钮或遮罩可收起并返回预览。
Arc 的标题拖动关闭与减少动态效果支持保持原样；手机宽度下侧栏接近全宽，内部独立滚动。

本地适配仅包括组件内的 RunFlow 样式变量、较高的邮件输入框，以及可选 `overlayProps`，
用它把遮罩标记为现有画布的交互层，避免关闭时误触画布拖动。侧栏键盘和粘贴事件不向画布快捷操作冒泡。
所有输入仍直接调用现有 `NoteSections` → `onChange`，没有新保存入口、内容裁剪或数据格式转换；原有自动保存、版本恢复和数据库逻辑未改。

`tests/note-drawer.test.tsx` 用完整组件和本地假附注，验证长模板、结构化字段、空附注、打开／关闭、焦点循环、原更新回调和遮罩隔离。
此组件的验收不使用真实流程，不代表已验证线上保存或完成发布；系统减少动态效果的实机设置尚未切换验证。

## 免费 Arc Accordion：附注侧栏分组

按 [Arc Accordion 官方手动安装说明](https://uiarc.dev/components/accordion/markdown) 接入，
增加固定依赖 `@radix-ui/react-accordion@1.3.1`，复用现有 Motion、Lucide、动画参数和 Arc MIT 许可证。
只在右侧 Drawer 的 `NoteSections` 开启 `collapsible`；其他使用方式默认保留原布局。
五组为「操作步骤」「要填的资料」「相关链接」「联系人」「附注／邮件模板」，通过官方 `items`、`defaultOpen={4}` 和默认 `size="md"` 接入，默认打开邮件，一次只打开一组，也可以全部收起。

输入、步骤勾选、增删和完整邮件仍使用原有更新回调；切换栏目不触发保存、不清空内容。
收起内容按官方方式保持挂载，并补上 `aria-hidden` / `inert`，避免动画兼容细节使隐藏的编辑框仍可获得焦点。
触发标题位于 heading 内，面板保留 Radix 的标识和标签关联；支持 Enter / Space、上下方向键、Home / End，保留 Arc 的减少动态效果分支。
颜色、字体和间距只做组件内的 RunFlow 变量映射，不加载全局重置样式。

`tests/note-accordion.test.tsx` 使用真实组件和本地假附注验证默认展开、长邮件与结构化字段完整性、切换／重开、空内容、键盘和隐藏面板语义。
版本恢复、数据库与服务器自动保存逻辑未改，不连接真实业务流程，也不表示已经上线。

## 免费 Arc Timeline：版本历史里的动态

按 [Arc Timeline 官方手动安装说明](https://uiarc.dev/components/timeline/markdown) 接入，复用已有 `motion@14.5.0`、`lucide-react@1.61.0`、动画参数和 Arc MIT 许可证，无新增依赖。
`ActivityTimeline` 只把现有动态转换成展示事件：新记录在前，按 UTC+8 日期分组，可展开完整详情。
它不发请求、不写历史、不调用差异预览或恢复。已有接口未返回动态 ID，因此展示层用完整记录内容及重复次数生成稳定标识；不合并或删除重复记录。

使用官方 `events`、每分钟刷新的 `now`、`label`、`locale="zh-CN"`、`timeZone="Asia/Kuala_Lumpur"` 和 `headingLevel={3}`。
复用原版本历史面板的滚动容器，不额外嵌套滚动区；`scrollToNew={false}` 避免阅读旧记录时自动跳回顶部。
本地适配只有组件内 RunFlow 样式变量、中文日期／相对时间／动态播报文案，以及完整日期补上年份；保留 Arc 的键盘、展开动画和减少动态效果支持。
有详情的行支持上下方向键、Home / End 和 Enter / Space；没有详情的行不伪装成按钮。时间保留机器可读值及完整日期，动态区域有明确名称，新记录通过状态区域播报。

`tests/version-activity-timeline.test.tsx` 用真实版本历史界面和假的历史接口响应，验证顺序、UTC+8 跨日、长详情、重复记录、键盘，以及查看动态不会触发写入。
原查看差异、自动备份、恢复和数据库逻辑未改；验收只使用本地假数据，不代表已连接真实数据或上线。系统减少动态效果的实机设置尚未切换验证。

## 免费 Arc Pagination：存档列表分页

按 [Arc Pagination 官方手动安装说明](https://uiarc.dev/components/pagination/markdown) 接入，复用已有 Motion、Lucide、动画参数和 MIT 许可证，不新增依赖。
`VersionSnapshotList` 只把已经读取的存档每 10 份分成一页；当前接口仍只读取最近 50 份，分页不会请求更多记录，也不代表全部历史。
使用官方受控 `page`、`pageCount`、`onPageChange` 和 `label="存档分页"`；只有超过一页才显示页码。
显示当前范围和已读取数量，首尾方向按钮禁用，当前页保留 `aria-current="page"`，按钮有中文无障碍名称和明显焦点框，支持 Tab / Enter / Space。
组件保留官方页码及当前标记动画、换行重测量和减少动态效果支持；RunFlow 变量只映射在组件内部。

切换流程或刷新后出现新的最新存档时回到第一页；加载列表变短时将当前页收敛到有效范围，避免空白页。
查看差异仍把该行的真实存档 ID 传给原有处理方法，不依赖可能重复的版本号。
动态时间线不分页、不重新挂载；查看差异、备份、恢复、历史读取接口和数据库逻辑保持原样。

`tests/version-pagination.test.tsx` 使用实际版本历史界面及假的接口响应，验证 50 份完整可达、每页数量、边界、键盘、存档 ID、流程切换和刷新，并检查翻页不触发额外读取或写入。
本地浏览器验收使用独立的 50 份假存档页面，不连接真实流程。系统减少动态效果的实机设置尚未切换验证，未发布线上。

## 免费 Arc Alert：版本历史提示

按 [Arc Alert 官方手动安装说明](https://uiarc.dev/components/alert/markdown) 接入，复用已有 Motion、Lucide、动画参数和 Arc MIT 许可证，不新增依赖。
仅替换 `VersionsPanel` 的历史加载／存档错误提示与恢复成功回执：使用 `tone="danger"` / `tone="success"`、`title` 和字符串 `children`，原有完整错误原因、恢复后版本及备份版本不截断。
错误使用 `role="alert"`，成功使用 `role="status"`；装饰图标及切换时退出的文字按官方实现对辅助技术隐藏。各提示保持自己的组件实例，更新错误内容时不重新挂载；成功回执与后续列表读取错误可以同时保留。

「重新加载历史」与「查看并退回恢复前」保留原按钮、回调和禁用条件，放在提示框之外，不混入播报内容。
此处不传 `onDismiss`，也不新增关闭状态，避免隐藏错误或自动备份入口；官方可选 `open` / `onDismiss` API 保留，关闭按钮的无障碍名称改为中文，仍支持 Enter / Space。
仅在组件内映射 RunFlow 的纸白、黑金、直角与字体变量；长错误（包括无空格字符串）可换行，不导入全局样式。
分页、动态时间线、差异确认、备份、恢复、历史读取和数据库逻辑未改。

`tests/version-alerts.test.tsx` 使用完整版本历史组件和假接口回执，覆盖完整错误、键盘重试、连续错误更新、成功回执的准确版本、退回按钮仍先预览及成功后读取失败。
独立本地浏览器页面验证错误、成功、手机宽度长错误及官方四种状态和可选关闭交互，不连接真实登录、流程或数据库。
系统减少动态效果的实现保留，尚未切换系统设置实机验收；此次没有验证真实业务恢复，也没有发布线上。

## 免费 Arc Toast stack：导出结果

按 [Arc Toast stack 官方手动安装说明](https://uiarc.dev/components/toast-stack/markdown) 接入，复用现有 Motion、Lucide、动画参数与 MIT 许可证，不新增依赖。
编辑页使用常驻的 `ToastStackProvider` 和一个 `ToastStack`；`ExportMenu` 通过 `sharedNotifications` 接入，因此切换视图不会丢失仍在生成的导出结果。独立使用 `ExportMenu` 时仍默认自带通知容器，其他操作的原提示及版本历史 Alert 不变。
用 `toast({ type: "loading", ... })` 取得独立 ID，文件生成／启动下载后用 `update(id, ...)` 更新为 success，异常时更新为 error；并发任务各自更新，不以文案或格式作为 ID。
同步格式可能立即完成，不为展示加载状态人为增加延迟。成功只表示文件已生成、已交给浏览器下载，不表示已经保存到磁盘。

保留原有四种格式、文件名、附注、数据清空／保留确认、生成器及下载实现；确认导出后立即收起菜单，避免生成中通知覆盖旧确认按钮。失败不调用成功回调，可重新打开导出菜单重试。
`onDone` 仍可选用于既有调用方；编辑页不再把导出成功重复送到旧的两秒提示，其他旧提示的调用没有改动。
通知通过 `ExportToastViewport` 在客户端挂到 body，避开工具栏的 transform；桌面底部留 76px，小屏底部留 152px 避让两行工具栏与缩放控件。通知层级在工具栏／菜单之下，连续导出时不挡住下一次选择。
交互层沿用 `data-pop` 并阻止通知按键向画布冒泡；只接收通知卡片自身的指针输入。

使用默认的 `duration={5000}`、`limit={12}`、`visibleToasts={3}`、`position="bottom-right"` 及 `label="导出通知"`；错误／警告按官方延长到 8 秒，loading 等待更新。
类型播报和关闭按钮中文化，保留 polite live region、退出文字隐藏、隐藏／退出卡片 inert、Alt+T、Tab、Esc、关闭后的焦点交还，以及悬停／聚焦／拖动／页面隐藏时暂停计时。
仅组件内映射黑金、纸白、直角和无阴影变量，保留原堆叠、展开、拖动关闭和减少动态效果实现。

`tests/export-toast-stack.test.tsx` 使用实际菜单、Arc 组件和文件生成器，仅替换浏览器下载／光栅化边界，验证加载→结果的同条更新、失败不误报、并发隔离、清空／保留内容、文件内容和键盘边界。
本地浏览器使用一张假流程：PNG 经过实际光栅化，下载出口仅做本地捕获；验证三种结果、键盘／焦点、自动消失与聚焦暂停、队列上限和 390px 窄屏位置。
未连接真实流程、登录或数据库；系统减少动态效果、触屏手势及后台隐藏暂停保留源码但尚未实机验收。未发布线上。

## 免费 Arc Floating button group：右下角缩放

按 [Arc Floating button group 官方手动安装说明](https://uiarc.dev/components/floating-button-group/markdown) 接入完整组件和其 Tooltip 依赖，新增固定依赖 `@radix-ui/react-tooltip@1.4.1`，复用现有 Motion、Lucide、动画参数和 Arc MIT 许可证；不安装全局主题或重置样式。
`ZoomControls` 只替换流程图视图右下角的三个缩放按钮，使用官方 `items`、`label="画布缩放"`、`variant="floating"`、`size="sm"`、水平排列和顶部提示。
中间按钮通过公开的 ReactNode 图标接口显示百分比，保留紧凑宽度；其完整无障碍名称和提示是「适应画布 · 当前百分比」。点击仍调用原有 `refit(doc.nodes)`。
减号、加号仍使用原来的 `clampZ(z / 1.2)` / `clampZ(z * 1.2)` 和移动标记；缩放算法、20%–250% 边界、滚动操作、底部主工具栏与数据库逻辑不变。

保留官方共享移动高亮、百分比切换动画、尺寸重测量和减少动态效果分支；仅组件内映射纸白、黑金、直角、无阴影样式，并加金色键盘焦点框。
三个按钮都有中文名称，整个工具组只有一个 Tab 入口；左右方向键循环、Home / End 定位、Enter / Space 执行，Escape 关闭提示。
外层保留 `data-pop`，并阻止按键继续传给画布快捷键，不截断组件内部的方向键操作或 Radix 的提示关闭处理。

`tests/zoom-controls.test.tsx` 使用实际 Arc / Radix 组件与假视口，验证三个回调、百分比更新及焦点稳定、单一 Tab 入口、方向键、Home / End、Enter / Space、Escape 和按键边界，以及原缩放比例和上下限。
本地浏览器使用独立假画布、实际 `fitView` 与滚动辅助函数，检查缩小／放大／适应、边界、普通滚动不改变比例、提示及金色焦点，并验证桌面工具栏位置参考和假导出通知不遮挡缩放按钮；窄屏仅验收缩放组件本身，不代表原有底部主工具栏已通过手机布局验收。
未连接真实流程、登录或数据库；系统减少动态效果、触屏手势和辅助阅读器朗读保留实现，尚未实机验收。只完成本地测试，未推送 GitHub 或发布线上。

## 八组件联动检查后的四项修复

- 撤销保存：自动保存以最后确认的内容为准，不再因返回最初加载的对象而跳过；保存版本号变化后重新检查，以补存等待旧请求时做出的撤销。原保存接口、差异／恢复接口和数据库未改。
- 跨视图导出：编辑页拥有常驻通知上下文；菜单可随流程图工具栏卸载，但已开始的任务仍更新同一条通知。导出格式、文件内容、清空／保留填写项与下载实现不变。
- 删除确认：弹窗内的 paste 不传给画布；取消／Esc、确认与返回焦点不变，关闭后画布的普通粘贴生成仍可用。
- 小屏布局：1000px 及以下将顶部标题、视图、账号分行；原九个主工具排成两行，缩放与通知分别上移；菜单相对整个工具栏定位，并在展开时高于缩放／附注预览。历史、检查器和资料库避让顶部与底部区域；画布及节点快捷工具的容器也留出上下区域，适应画布沿用原算法、以剩余区域尺寸计算。桌面保持原有布局。

`tests/editor-integration.test.tsx` 使用真实编辑页、前端 store、保存定时器和 Arc 组件，仅替换登录／实时协同、业务网络与浏览器文件边界；验证加载不误写、撤销后保存并切图、旧请求等待期间撤销、保存失败重试、跨视图导出成功／失败和删除弹窗粘贴隔离。另以本地假流程检查小屏的几何位置、实际按钮命中及导出菜单。
本轮未修改节点新增、连接或自动排版算法；“在两步之间插入”的问题已定位，仍需单独确认交互规则后实施。未访问或修改真实业务流程，未推送 GitHub。

## 免费 Arc Rich text editor：附注／邮件展开编辑

按 [Arc Rich text editor 官方手动安装说明](https://uiarc.dev/components/rich-text-editor/markdown) 复制 registry 的 TSX 与 CSS Module，复用现有 `motion@14.5.0`、`lucide-react@1.61.0`、动画参数与 Arc MIT 许可证。没有新增依赖、全局主题或数据库字段。
仅 `NoteSections` 的展开／折叠侧栏使用 `NoteRichTextEditor`；非展开编辑栏、只读小预览和导出代码保持原样。仍通过原回调更新 `note.text` 字符串、沿用自动保存。

使用官方 `value`（HTML）、`onChange`、`aria-label`、`placeholder`、`blockHint` 等公开接口；内部 HTML 不写入数据库。保留完整工具栏、斜杠菜单、快捷键、独立文字撤销与减少动态效果分支，不用伪造控件代替原组件。
为旧邮件增加成对的 `noteMarkdownToHtml` / `htmlToNoteMarkdown` 兼容转换：普通 `markdownToHtml` / `htmlToMarkdown` API 保留官方语义，附注专用转换保留物理换行、连续空行和行尾空行。保护首次加载发出的 onChange，切换模式／只打开不写回；文字撤销的 HTML 快照对应精确原文，保留 CRLF；不同内容的外部替换重建编辑会话，防止撤销出另一份内容。
对不能无损往返的原文（例如未支持的语法、特殊编号、混合行结束符）自动保留原文编辑，并明确提示，不强制转换或截断。格式编辑和原文编辑均沿用原自动保存；切换模式会重建富文本编辑器自身的文字撤销栈，不改变流程图历史。

本地适配还保护纯文本邮件粘贴的换行，拒绝链接表单中的可执行协议，让退出动画中的菜单和工具栏立刻 inert / aria-hidden。局部映射黑金纸面变量，保留现有直角、无阴影风格。保留 textbox / aria-multiline、listbox / aria-controls / aria-activedescendant、toolbar / aria-pressed、polite live region、Alt+F10、方向键及 Escape 语义。
为浮动工具栏留出首行空间，避免挡住原文切换；空白行即使被浏览器格式标签包裹仍按原空行保存。链接输入宽度随编辑器容器收缩。浏览器实测整段加粗后换行数量不变、文字撤销／重做自动保存且不影响流程节点、Alt+F10／方向键／Escape 焦点正常；280px 编辑器容器中的格式工具和链接输入无横向溢出（不代表整站手机验收）。
`tests/note-rich-text.test.tsx`、`tests/rich-text-codec.test.ts`、`tests/rich-text-interactions.test.tsx` 与实际编辑页集成测试覆盖原文不误写、换行／长模板、模式切换、字段完整性、文字撤销、自动保存、外部内容替换、粘贴清理和键盘隔离。实际浏览器仅使用本地假流程，不连接真实身份、协同或业务数据库；系统级辅助阅读器、真实手机键盘与系统减少动态效果仍需另行实机验收。
