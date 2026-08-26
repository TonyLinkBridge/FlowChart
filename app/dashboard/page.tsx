'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addNode, blankDoc, connect, patchEdge, patchNode, removeEdge, removeNode } from '@/lib/doc';
import { autoLayout } from '@/lib/layout';
import { parseDoc } from '@/lib/io';
import { emptyNote } from '@/lib/note';
import { terminalRole } from '@/lib/graph';
import { nodeH, nodeW } from '@/lib/edges';
import { useElementSize } from '@/hooks/useElementSize';
import { fitView, zoomAt, clampZ, type View } from '@/lib/viewport';
import { docProgress, footnoteIndex, nodeProgress, toggleStep, type FlowDoc, type FlowEdge, type FlowNode as FlowNodeData, type NodeStyle, type Note, type Shape } from '@/lib/types';
import { FlowNode } from '@/components/flow/FlowNode';
import { FlowEdges } from '@/components/flow/FlowEdges';
import { NotePopover } from '@/components/flow/NotePopover';
import { NodeToolbar } from '@/components/flow/NodeToolbar';
import { mergeDocs } from '@/lib/merge';
import { initialSelectedNode, shouldClearCanvasSelection } from '@/lib/editor-selection.mjs';
import { useCollab } from '@/hooks/useCollab';
import { NotePanel } from '@/components/views/NotePanel';
import { EdgePanel } from '@/components/views/EdgePanel';
import { ExportMenu } from '@/components/chrome/ExportMenu';
import { TemplateMenu } from '@/components/chrome/TemplateMenu';
import { PasteDialog } from '@/components/chrome/PasteDialog';
import { ChecklistView } from '@/components/views/ChecklistView';
import { TimelineView } from '@/components/views/TimelineView';
import { LanesView } from '@/components/views/LanesView';
import { Sidebar } from '@/components/chrome/Sidebar';
import { VersionsPanel } from '@/components/chrome/VersionsPanel';
import {
  loadWorkspace, rememberCurrent, createFlow, saveFlow, deleteFlow, moveFlow, moveFlowSpace, fetchFlow, restoreVersion,
  createFolder, renameFolderDb, deleteFolderDb, currentDoc, SaveConflict, type Workspace,
} from '@/lib/store';
import { OrganizationSwitcher, UserButton, useClerk, useOrganization, useOrganizationList, useUser } from '@clerk/nextjs';
import s from '@/components/chrome/Chrome.module.css';


const VIEWS = ['流程图', '泳道', '时间条', '清单'] as const;

/** 日志只记「发生过什么」，撤销走 ⌘Z 的历史栈 —— 两套并存的时候，
 *  这里的撤销按钮因为没人再传回调，早就永远不显示了。 */
/** 一条历史。before 是「做这件事之前」的图 —— 点它就回到那个时候。
 *  以前撤销栈和日志是两份：栈里有数据但看不见，日志看得见但点不动。
 *  合成一份，历史才是真的能翻回去的。 */
type HistoryEntry = { id: number; time: string; label: string; before: FlowDoc };

function clock() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function Editor() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [doc, setDoc] = useState<FlowDoc>(() => blankDoc());
  const [ws, setWs] = useState<Workspace | null>(null);
  const [sideOpen, setSideOpen] = useState(true);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  /** 撤销栈。原来每个动作各自闭包一份旧 doc，散在各处也接不上 ⌘Z，
   *  改成统一：结构性改动一律走 commit()，撤销就是弹栈。 */

  const [edgeIndex, setEdgeIndex] = useState<number | null>(null);
  /** 连线模式：null=没开，''=开了但还没点起点，'xx'=起点是 xx */
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dropping, setDropping] = useState(false);
  /** 不为 null 就是粘贴框开着；字符串是预填的内容 */
  const [pasting, setPasting] = useState<string | null>(null);
  /** 拖动中的节点。放在 ref 里是因为 pointermove 每帧都触发，
   *  塞进 state 会多一轮渲染；before 存一份拖动前的图，松手时只记一条撤销。 */
  const dragRef = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number;
                           before: FlowDoc; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  /** 拖画布。放在 React 事件里 —— 原生监听器比 React 先跑，
   *  节点上的「阻止冒泡」根本拦不住它，拖节点会连画布一起拖。 */
  const panRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  /** 视口 = 平移 + 缩放。图能不能看全全靠它。 */
  const [vp, setVp] = useState<View>({ x: 0, y: 0, z: 1 });
  const vpRef = useRef(vp);
  vpRef.current = vp;
  /** 换了一张图（新建/导入/模板/粘贴/重排）就重新适应一次 */
  /** 用户拖过/缩放过镜头没。没动过 → 图长一步视野跟着居中；
   *  动过 → 镜头是用户的，程序不抢，直到「适应」/换图/重排交还。 */
  const userMovedRef = useRef(false);

  // 最新的 doc / ws 的实时引用 —— 异步回调里读，闭包不会拿到旧的
  const docRef = useRef<FlowDoc>(null as unknown as FlowDoc);
  docRef.current = doc;
  const wsRef = useRef<Workspace | null>(null);
  wsRef.current = ws;
  // 广播「我存到第 N 版了」；在 useCollab 挂好后赋值
  const announceRef = useRef<((v: number) => void) | null>(null);

  const refit = useCallback((nodes: FlowNodeData[]) => {
    userMovedRef.current = false;
    setVp(fitView(nodes, canvasRef.current?.clientWidth ?? 0,
                  canvasRef.current?.clientHeight ?? 0));
  }, []);

  /** 附注气泡：hover 出来只读，点一下钉住才展开可改。
   *  进出都留一点延迟 —— 不然从小数字移到卡片上的那半秒，卡片就没了。 */
  const [hoverNote, setHoverNote] = useState<string | null>(null);
  const [pinnedNote, setPinnedNote] = useState<string | null>(null);
  const [noteExpanded, setNoteExpanded] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [canvasRef, canvas] = useElementSize<HTMLDivElement>();

  const scheduleHover = useCallback((id: string | null) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHoverNote(id), id ? 120 : 180);
  }, []);
  const keepHover = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }, []);
  const [selected, setSelected] = useState<string | null>(initialSelectedNode);
  const [view, setView] = useState<(typeof VIEWS)[number]>('流程图');

  /** 点节点上的金色小数字 —— 右栏切到附注，并翻到那一条 */
  const openNote = useCallback((id: string) => {
    setSelected(id);
    setPinnedNote(cur => (cur === id ? null : id));
    setNoteExpanded(true);
  }, []);

  /* C —— 顶部内联，没东西可撤销的事走这里，两秒自动退回 */
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  /* 历史 = 撤销栈（⌘Z）+ 重做栈（⇧⌘Z）。底部日志面板砍掉了，
     但历史本身要看得见：工具条上有撤销/重做按钮，悬停能看到要撤/重做哪一步。 */
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [future, setFuture] = useState<{ label: string; doc: FlowDoc }[]>([]);
  /** 按住空格才拖画布（Figma 那套）。
   *  之前靠「节点上阻止冒泡」来区分，但画布的平移是原生监听器，
   *  在冒泡到画布那层就触发了，而 React 的阻止冒泡要等到根节点 —— 晚一步，拦不住。 */
  const [spaceDown, setSpaceDown] = useState(false);
  const spaceRef = useRef(false);
  spaceRef.current = spaceDown;
  const seq = useRef(1);
  /** 记一条历史。before 在外面算好 —— 更新函数必须是纯的。 */
  const remember = useCallback((label: string, before: FlowDoc) => {
    const entry: HistoryEntry = { id: ++seq.current, time: clock(), label, before };
    setHistory(h => [entry, ...h].slice(0, 80));
  }, []);

  /** 提交一次结构性改动：存档 + 记日志。打字类的碎改动不走这里。
   *  改出新东西后，旧的「重做」分支就作废 —— 不然重做会把刚改的盖掉。 */
  const commit = useCallback((next: FlowDoc, label: string) => {
    remember(label, doc);
    setFuture([]);
    setDoc(next);
    if (!userMovedRef.current) refit(next.nodes);
  }, [doc, remember, refit]);

  /** 撤销 = 回到最近那条历史的「之前」，同时把「现在」推进重做栈。 */
  const undo = useCallback(() => {
    if (!history.length) return;
    const entry = history[0];
    setFuture(f => [{ label: entry.label, doc }, ...f].slice(0, 80));
    setDoc(entry.before);
    setHistory(h => h.slice(1));
    setSelected(null); setEdgeIndex(null);
    setToast(`已撤销 · ${entry.label}`);
  }, [history, doc]);

  /** 重做 = 把刚撤销的那步再放回来。 */
  const redo = useCallback(() => {
    if (!future.length) return;
    const entry = future[0];
    setHistory(h => [{ id: ++seq.current, time: clock(), label: entry.label, before: doc }, ...h].slice(0, 80));
    setDoc(entry.doc);
    setFuture(f => f.slice(1));
    setSelected(null); setEdgeIndex(null);
    setToast(`已重做 · ${entry.label}`);
  }, [future, doc]);


  /** 进来先拉一次工作区。拉不下来就明说 + 给重试 ——
   *  以前失败只会亮「保存失败」，人对着空画布画半天，其实一笔都没落库。 */
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadErr, setLoadErr] = useState('');
  const bootstrap = useCallback(() => {
    setLoadState('loading');
    loadWorkspace()
      .then(w => {
        setWs(w);
        const c = currentDoc(w);
        if (c) {
          lastLoadedRef.current = c.doc;
          setDoc(c.doc);
          syncRef.current = { id: c.id, doc: c.doc, version: c.version };
        }
        setLoadState('ready');
      })
      .catch(e => { setLoadErr(e instanceof Error ? e.message : '网络不通'); setLoadState('error'); });
  }, []);
  useEffect(() => { bootstrap(); }, [bootstrap]);

  /** 切换空间（个人 ↔ Team）：先把手上没存完的发出去，再整个工作区重拉。
   *  orgId 来自 Clerk 会话，服务端按它过滤 —— 前端只负责触发重载。 */
  const { organization } = useOrganization();
  const orgId = organization?.id ?? null;
  const orgRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (orgRef.current === undefined) { orgRef.current = orgId; return; }   // 首次挂载不算切换
    if (orgRef.current === orgId) return;
    orgRef.current = orgId;
    flushSave();
    syncRef.current = { id: null, doc: null, version: 1 };
    lastLoadedRef.current = null;
    setHistory([]); setFuture([]); setSelected(null); setEdgeIndex(null); setPinnedNote(null);
    setWs(null);
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const [histOpen, setHistOpen] = useState(false);

  /** 我加入的所有 Team —— 侧栏「搬家…」菜单的选项来源。
   *  在 Team 里可以搬回个人空间；在任何空间都能搬去别的 Team。 */
  const { userMemberships } = useOrganizationList({ userMemberships: { infinite: true } });
  const spaces = useMemo(() => {
    const teams = (userMemberships?.data ?? [])
      .map(m => ({ id: m.organization.id as string | null, name: m.organization.name }))
      .filter(t => t.id !== orgId);
    return orgId ? [{ id: null, name: '我的个人空间' }, ...teams] : teams;
  }, [userMemberships?.data, orgId]);


  /** 恢复历史版本：结果是一个新版本，历史不毁，恢复错了再恢复回去。 */
  const doRestore = useCallback((v: number) => {
    const id = wsRef.current?.currentId;
    if (!id) return;
    restoreVersion(id, v).then(r => {
      syncRef.current = { id, doc: r.doc, version: r.version };
      lastLoadedRef.current = r.doc;
      setDoc(r.doc);
      setHistory([]); setFuture([]); setSelected(null); setPinnedNote(null);
      setWs(w => w && { ...w, docs: w.docs.map(d => d.id === id ? { ...d, doc: r.doc, version: r.version, updatedAt: Date.now() } : d) });
      refit(r.doc.nodes);
      announceRef.current?.(r.version);
      setToast(`已恢复到 V${v}，生成新版本 V${r.version}`);
    }).catch(e => setToast(e instanceof Error ? e.message : '恢复失败'));
  }, [refit]);

  /** 首次进来适应一次。
   *  之前只在新建/切换/导入/粘贴/重排时适应，唯独一进来那次漏了 ——
   *  所以图停在原始坐标上，贴着左上角。
   *  画布宽高是异步量出来的，量到之前 fitView 会直接放弃，所以要等它。 */
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || !ws || !doc.nodes.length) return;
    if (!canvas.w || !canvas.h) return;      // 还没量到画布尺寸
    fitted.current = true;
    refit(doc.nodes);
  }, [ws, doc.nodes, canvas.w, canvas.h, refit]);

  /** 自动保存：停手 800ms 才发一次请求，不然每敲一个字发一次谁也受不了。
   *  pending 记着「还没发出去的那份」—— 切图前必须 flush，
   *  不然定时器一清，最后 800ms 的改动就静默丢了。 */
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ id: string; doc: FlowDoc; base: number } | null>(null);
  const lastLoadedRef = useRef<FlowDoc | null>(null);
  /** 当前这张图「最后一次和服务器对上号」的样子 —— 撞车合并时的基准。 */
  const syncRef = useRef<{ id: string | null; doc: FlowDoc | null; version: number }>({ id: null, doc: null, version: 1 });

  /** 真正把一份 doc 发出去。撞到 409（同事在我之后存过）就三方合并再试，最多三轮。
   *  合并结果要放回画布 —— 不然你看到的和库里的会岔开。 */
  const performSave = useCallback(async (id: string, docToSave: FlowDoc, base: number, baseDoc: FlowDoc | null) => {
    let attempt = docToSave;
    let attemptBase = base;
    let mergedInfo: string | null = null;
    for (let round = 0; round < 3; round++) {
      try {
        const v = await saveFlow(id, attempt, attemptBase);
        if (syncRef.current.id === id) syncRef.current = { id, doc: attempt, version: v };
        setWs(w => w && { ...w, docs: w.docs.map(d => d.id === id ? { ...d, doc: attempt, updatedAt: Date.now(), version: v } : d) });
        announceRef.current?.(v);
        if (attempt !== docToSave && wsRef.current?.currentId === id) {
          // 发生过合并：把合并结果放回画布；这一瞬间还在敲的字再叠一层
          const cur = docRef.current;
          if (cur === docToSave) { lastLoadedRef.current = attempt; setDoc(attempt); }
          else setDoc(mergeDocs(docToSave, cur, attempt).doc);
          if (mergedInfo) setToast(mergedInfo);
        }
        setSaveState('saved');
        return;
      } catch (e) {
        if (e instanceof SaveConflict && baseDoc) {
          const { doc: merged, clashes } = mergeDocs(baseDoc, attempt, e.serverDoc);
          mergedInfo = clashes.length
            ? `已合并同事的修改 · 「${clashes[0]}」两边都改过，保留了你的`
            : '已合并同事的修改';
          baseDoc = e.serverDoc;          // 下一轮的合并基准就是对方那版
          attemptBase = e.serverVersion;
          attempt = merged;
          continue;
        }
        throw e;
      }
    }
    throw new Error('保存一直撞车');
  }, []);

  const flushSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const pend = pendingRef.current;
    pendingRef.current = null;
    if (!pend) return;
    // 切走的那张图撞车时，合并基准用工作区里留着的最后同步版
    const baseDoc = wsRef.current?.docs.find(d => d.id === pend.id)?.doc ?? null;
    // 发失败要把这份塞回去 —— 点「重试」或网络回来时才补得上；丢了就是真丢了
    performSave(pend.id, pend.doc, pend.base, baseDoc)
      .catch(() => { pendingRef.current ??= pend; setSaveState('error'); });
  }, [performSave]);

  useEffect(() => {
    if (!ws?.currentId) return;
    if (doc === lastLoadedRef.current) return;   // 刚加载/切换过来的那份，不用回存
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState('saving');
    pendingRef.current = { id: ws.currentId, doc, base: syncRef.current.version };
    saveTimer.current = setTimeout(() => {
      pendingRef.current = null;
      performSave(ws.currentId!, doc, syncRef.current.version, syncRef.current.doc)
        .catch(() => setSaveState('error'));
    }, 800);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [doc, ws?.currentId, performSave]);

  /** 手动重试：把欠着的那份（可能是切走前那张图的）和当前这张都补发一遍。 */
  const retrySave = useCallback(() => {
    const pend = pendingRef.current;
    pendingRef.current = null;
    const id = ws?.currentId;
    setSaveState('saving');
    const jobs: Promise<void>[] = [];
    if (pend && pend.id !== id) {
      const baseDoc = wsRef.current?.docs.find(d => d.id === pend.id)?.doc ?? null;
      jobs.push(performSave(pend.id, pend.doc, pend.base, baseDoc));
    }
    if (id) jobs.push(performSave(id, docRef.current, syncRef.current.version, syncRef.current.doc));
    Promise.all(jobs).catch(() => setSaveState('error'));
  }, [ws?.currentId, performSave]);

  /** 网络断了存不上，网络一回来就自己补发，不用人守着点重试。 */
  useEffect(() => {
    const onOnline = () => { if (saveState === 'error') retrySave(); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [saveState, retrySave]);

  /* ── 协同：谁在线、光标在哪、同事保存了就拉最新 ──
     手上干净（没未存的改动）→ 直接换成对方的版本；
     手上有改动 → 什么都不做，下一次保存会撞 409 走三方合并。 */
  const myName = user?.firstName ?? user?.username ?? user?.primaryEmailAddress?.emailAddress?.split('@')[0] ?? '我';
  const onPeerSaved = useCallback((v: number, byName: string) => {
    const id = wsRef.current?.currentId;
    if (!id || v <= syncRef.current.version) return;
    if (docRef.current !== syncRef.current.doc || pendingRef.current) return;
    fetchFlow(id).then(row => {
      if (!row || wsRef.current?.currentId !== id) return;
      if (row.version <= syncRef.current.version) return;
      if (docRef.current !== syncRef.current.doc || pendingRef.current) return;   // 拉取期间动手了，别覆盖
      syncRef.current = { id, doc: row.doc, version: row.version };
      lastLoadedRef.current = row.doc;
      setDoc(row.doc);
      setWs(w => w && { ...w, docs: w.docs.map(d => d.id === id ? { ...d, doc: row.doc, version: row.version, updatedAt: row.updatedAt } : d) });
      setToast(`${byName} 更新了这张图`);
    });
  }, []);
  const { mates, ghosts, sendCursor, sendDrag, sendDragEnd, sendSel, announceSaved } = useCollab(
    ws?.currentId ?? null,
    { id: user?.id ?? '', name: myName },
    onPeerSaved,
  );
  announceRef.current = v => announceSaved(v, myName);

  /** 我选中了哪个节点也广播出去 —— 对方屏幕上那个节点会描上我的颜色。 */
  useEffect(() => { sendSel(selected); }, [selected, sendSel]);

  /** 渲染用的图 = 数据 + 同事拖动中的「幽灵位置」。
   *  幽灵只盖在渲染上，绝不写进 doc —— 数据对错交给版本号和三方合并。 */
  const liveDoc = useMemo(() => {
    const gs = Object.values(ghosts);
    if (!gs.length) return doc;
    const at = new Map(gs.map(g => [g.id, g]));
    return { ...doc, nodes: doc.nodes.map(n => {
      const g = at.get(n.id);
      return g ? { ...n, x: g.x, y: g.y } : n;
    }) };
  }, [doc, ghosts]);

  /** 节点 → 同事颜色：他选中的、他正在拖的，都描一圈他的色。 */
  const peerMarks = useMemo(() => {
    const m = new Map<string, string>();
    for (const mate of mates) if (mate.sel) m.set(mate.sel, mate.color);
    for (const g of Object.values(ghosts)) m.set(g.id, g.color);
    return m;
  }, [mates, ghosts]);

  /** 还有改动没落库就要关页？让浏览器拦一下。 */
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (saveState === 'saving' || saveState === 'error' || pendingRef.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [saveState]);

  const prog = docProgress(doc);
  const notes = footnoteIndex(doc);

  /** 打勾：整步一次勾完/取消，同时写一条可撤销的日志 */
  const toggleDone = useCallback((id: string) => {
    const node = doc.nodes.find(n => n.id === id);
    if (!node || node.shape === 'decision' || node.shape === 'terminator' || node.muted) return;
    const willDone = nodeProgress(node) !== 1;
    const next: FlowDoc = {
      ...doc,
      nodes: doc.nodes.map(n => n.id !== id ? n : {
        ...n,
        done: willDone,
        note: n.note?.steps
          ? { ...n.note, steps: n.note.steps.map(st => ({ ...st, done: willDone })) }
          : n.note,
      }),
    };
    commit(next, `${willDone ? '勾完' : '取消勾选'}「${node.title}」`);
  }, [doc, commit]);

  /** 勾单条子步骤 —— 节点进度自动跟着汇总，不用另外维护 */
  const toggleStepAt = useCallback((nodeId: string, stepIndex: number) => {
    const node = doc.nodes.find(n => n.id === nodeId);
    const step = node?.note?.steps?.[stepIndex];
    if (!node || !step) return;
    commit(toggleStep(doc, nodeId, stepIndex),
      `${step.done ? '取消' : '勾完'}「${node.title}」第 ${stepIndex + 1} 步`);
  }, [doc, commit]);

  /** 新建一张空白图，加进列表并切过去。先把手上没存完的发出去。 */
  const newDoc = useCallback((folderId: string | null = null) => {
    flushSave();
    createFlow(blankDoc(), folderId).then(row => {
      if (!row) return;
      lastLoadedRef.current = row.doc;
      syncRef.current = { id: row.id, doc: row.doc, version: row.version };
      setWs(w => w && { ...w, docs: [row, ...w.docs], currentId: row.id });
      rememberCurrent(row.id);
      setDoc(row.doc); setHistory([]); setFuture([]); setSelected(null); refit(row.doc.nodes);
    }).catch(() => setSaveState('error'));
  }, [flushSave, refit]);

  /** 搬家：图从当前空间挪去别处，本地列表里移掉；正开着的话切去下一张。 */
  const relocateSpace = useCallback((id: string, target: string | null) => {
    moveFlowSpace(id, target).then(() => {
      const w = wsRef.current;
      if (!w) return;
      const docs = w.docs.filter(d => d.id !== id);
      if (w.currentId === id) {
        if (!docs.length) { setWs({ ...w, docs, currentId: null }); newDoc(null); return; }
        lastLoadedRef.current = docs[0].doc;
        syncRef.current = { id: docs[0].id, doc: docs[0].doc, version: docs[0].version };
        setWs({ ...w, docs, currentId: docs[0].id });
        setDoc(docs[0].doc); setHistory([]); setFuture([]); setSelected(null);
        refit(docs[0].doc.nodes);
        rememberCurrent(docs[0].id);
      } else {
        setWs({ ...w, docs });
      }
      setToast(target ? '已搬进 Team —— 切换空间就能看到' : '已搬回你的个人空间');
    }).catch(e => setToast(e instanceof Error ? e.message : '搬家失败'));
  }, [newDoc, refit]);

  /** 切换到另一张图。先 flush 再切 —— 不然最后 800ms 的改动静默丢掉。
   *  历史是「这一张」的，切图要清空，不然会跨图撤销。
   *  （副作用全在更新函数外面 —— 这个坑今天已经踩过两次了。） */
  const pickFlow = useCallback((id: string) => {
    if (!ws || id === ws.currentId) return;
    const target = ws.docs.find(d => d.id === id);
    if (!target) return;
    flushSave();
    lastLoadedRef.current = target.doc;
    syncRef.current = { id, doc: target.doc, version: target.version };
    setWs({ ...ws, currentId: id });
    setDoc(target.doc); setHistory([]); setFuture([]); setSelected(null); setEdgeIndex(null); setPinnedNote(null);
    refit(target.doc.nodes);
    rememberCurrent(id);
  }, [ws, flushSave, refit]);

  const renameFlow = useCallback((id: string, title: string) => {
    if (!ws) return;
    setWs({ ...ws, docs: ws.docs.map(d => d.id === id ? { ...d, doc: { ...d.doc, title } } : d) });
    if (ws.currentId === id) {
      setDoc(cur => ({ ...cur, title }));   // 当前这张交给自动保存
    } else {
      const other = ws.docs.find(d => d.id === id);
      // 改的不是当前这张：带上版本号防覆盖；真撞上就放弃这次改名（同事那边为准）
      if (other) saveFlow(id, { ...other.doc, title }, other.version)
        .catch(e => { if (!(e instanceof SaveConflict)) setSaveState('error'); });
    }
  }, [ws]);

  const removeFlow = useCallback((id: string) => {
    if (!ws) return;
    if (pendingRef.current?.id === id) pendingRef.current = null;   // 别把刚删的那张又存回去
    deleteFlow(id).then(() => {
      const docs = ws.docs.filter(d => d.id !== id);
      if (!docs.length) { setWs({ ...ws, docs, currentId: null }); newDoc(null); return; }
      const nextId = ws.currentId === id ? docs[0].id : ws.currentId;
      setWs({ ...ws, docs, currentId: nextId });
      if (nextId !== ws.currentId) {
        lastLoadedRef.current = docs[0].doc;
        syncRef.current = { id: docs[0].id, doc: docs[0].doc, version: docs[0].version };
        setDoc(docs[0].doc); setHistory([]); setFuture([]); setSelected(null); refit(docs[0].doc.nodes);
        rememberCurrent(nextId);
      }
    }).catch(() => setSaveState('error'));
  }, [ws, newDoc, refit]);

  const relocateFlow = useCallback((id: string, folderId: string | null) => {
    moveFlow(id, folderId).catch(() => setSaveState('error'));
    setWs(w => w && { ...w, docs: w.docs.map(d => d.id === id ? { ...d, folderId } : d) });
  }, []);

  const newFolder = useCallback(() => {
    createFolder('新分组').then(f => f && setWs(w => w && { ...w, folders: [...w.folders, f] }))
      .catch(() => setSaveState('error'));
  }, []);

  const renameFolder = useCallback((id: string, name: string) => {
    setWs(w => w && { ...w, folders: w.folders.map(f => f.id === id ? { ...f, name } : f) });
    renameFolderDb(id, name).catch(() => {});
  }, []);

  const removeFolder = useCallback((id: string) => {
    deleteFolderDb(id).then(() => setWs(w => w && {
      ...w,
      folders: w.folders.filter(f => f.id !== id),
      docs: w.docs.map(d => d.folderId === id ? { ...d, folderId: null } : d),   // 图退回未分组，不跟着删
    })).catch(() => setSaveState('error'));
  }, []);

  /** 加一步。有选中就接在它后面，没有就丢个孤立节点。 */
  const addStep = useCallback(() => {
    const { doc: next, id } = addNode(doc, selected);
    commit(next, '加了一步');
    setSelected(id);
  }, [doc, selected, commit]);

  const deleteNode = useCallback((id: string) => {
    const node = doc.nodes.find(n => n.id === id);
    commit(removeNode(doc, id), `删了「${node?.title ?? id}」`);
    setSelected(null);
  }, [doc, commit]);

  /** 改节点属性。改名边打字边记日志会刷爆，所以不记。 */
  const patch = useCallback((id: string, p: Partial<FlowNodeData>) => {
    setDoc(d => patchNode(d, id, p));
  }, []);

  /** 头顶工具条改外观：合并进 node.style，清成空对象就整个去掉。
   *  字号变了盒子高度会变，要顺手重排一次，不然下一行会被盖住。 */
  const restyle = useCallback((id: string, p: Partial<NodeStyle>, label: string) => {
    const n = doc.nodes.find(nn => nn.id === id);
    if (!n) return;
    const merged: NodeStyle = { ...n.style, ...p };
    (Object.keys(merged) as (keyof NodeStyle)[]).forEach(k => { if (merged[k] === undefined) delete merged[k]; });
    let next = patchNode(doc, id, { style: Object.keys(merged).length ? merged : undefined });
    if ('size' in p) next = autoLayout(next);
    commit(next, label);
  }, [doc, commit]);

  const relayout = useCallback(() => {
    const laid = autoLayout(doc);
    commit(laid, '重新排版');
    refit(laid.nodes);
  }, [doc, commit]);

  /** 附注的所有编辑都走这一个口子。传 undefined 就是把整条附注删掉。
   *  不记日志 —— 边打字边记会把日志刷爆，结构性改动靠撤销键兜底。 */
  /** 点节点。连线模式下第一下选起点，第二下连上。 */
  const clickNode = useCallback((id: string) => {
    if (dragRef.current?.moved) return;   // 刚拖完，别顺手把它选中/连线
    if (linkFrom === null) { setSelected(id); setEdgeIndex(null); return; }
    if (linkFrom === '') { setLinkFrom(id); return; }
    if (linkFrom === id) { setLinkFrom(''); return; }
    const before = doc.edges.length;
    const next = connect(doc, linkFrom, id);
    if (next.edges.length > before) {
      const a = doc.nodes.find(n => n.id === linkFrom)?.title;
      const b = doc.nodes.find(n => n.id === id)?.title;
      commit(next, `连了一条线：${a} → ${b}`);
    }
    setLinkFrom(null);
  }, [doc, linkFrom, commit]);

  const selectEdge = useCallback((i: number) => {
    setEdgeIndex(i); setSelected(null); setLinkFrom(null);
  }, []);

  const changeEdge = useCallback((i: number, p: Partial<FlowEdge>) => {
    setDoc(d => patchEdge(d, i, p));
  }, []);

  const deleteEdge = useCallback((i: number) => {
    const e = doc.edges[i];
    const a = doc.nodes.find(n => n.id === e?.source)?.title;
    const b = doc.nodes.find(n => n.id === e?.target)?.title;
    commit(removeEdge(doc, i), `删了连线：${a} → ${b}`);
    setEdgeIndex(null);
  }, [doc, commit]);

  /** 导入一份 JSON。坏文件只提示，不动现有的图。 */
  const importText = useCallback((text: string, from: string) => {
    const r = parseDoc(text);
    if (!r.ok) { setToast(`导入失败 · ${r.error}`); return; }
    commit(r.doc, `导入了「${r.doc.title}」（${from}）`);
    refit(r.doc.nodes);
    setSelected(null); setEdgeIndex(null); setLinkFrom(null);
    setToast(r.warnings.length
      ? `已导入 · ${r.doc.nodes.length} 个节点 · ${r.warnings.length} 处已自动修正`
      : `已导入 · ${r.doc.nodes.length} 个节点`);
  }, [commit]);

  const openFile = useCallback(async (file?: File | null) => {
    if (!file) return;
    if (!/\.json$/i.test(file.name)) { setToast('导入失败 · 只认 .json 文件'); return; }
    importText(await file.text(), file.name);
  }, [importText]);

  const startDrag = useCallback((id: string, e: React.PointerEvent) => {
    if (linkFrom !== null) return;                 // 连线模式下不抢手势
    const n = doc.nodes.find(x => x.id === id);
    if (!n) return;
    if (n.locked) return;                          // 锁住的节点拖不动，点选照常
    dragRef.current = { id, sx: e.clientX, sy: e.clientY, ox: n.x ?? 0, oy: n.y ?? 0, before: doc, moved: false };
    setDragging(true);
  }, [doc, linkFrom]);

  /** 滚轮缩放（以光标为锚点）+ 拖空白处平移。
   *  用原生监听是因为要 preventDefault —— React 的 onWheel 是被动的，拦不住页面滚动。 */
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as Element).closest?.('[data-pop]')) return;   // 气泡里滚动归气泡
      e.preventDefault();
      userMovedRef.current = true;
      const r = el.getBoundingClientRect();
      const cx = e.clientX - r.left, cy = e.clientY - r.top;
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
        setVp(v => zoomAt(v, cx, cy, e.deltaY < 0 ? 1.12 : 1 / 1.12));
      } else {
        setVp(v => ({ ...v, x: v.x - e.deltaX }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const z = vpRef.current.z;
      const dx = (e.clientX - d.sx) / z, dy = (e.clientY - d.sy) / z;
      // 3px 抖动阈值：手一抖就当拖动的话，就再也点不中节点了
      if (!d.moved && Math.hypot(dx, dy) < 3) return;
      d.moved = true;
      const nx = Math.round(d.ox + dx), ny = Math.round(d.oy + dy);
      sendDrag(d.id, nx, ny);   // 同事屏幕上实时看到这个节点跟着我的手走
      setDoc(cur => ({
        ...cur,
        nodes: cur.nodes.map(n => {
          if (n.id !== d.id) return n;
          return { ...n, x: nx, y: ny };
        }),
      }));
    };
    const up = () => {
      const d = dragRef.current;
      if (d?.moved) {
        sendDragEnd();
        // 整段拖动只算一步：压栈的是按下之前那份图
        remember(`拖动了「${d.before.nodes.find(n => n.id === d.id)?.title ?? d.id}」`, d.before);
      }
      setDragging(false);
      // click 紧跟在 pointerup 之后同步触发，等它读完 moved 再清
      setTimeout(() => { dragRef.current = null; }, 0);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [dragging, remember, sendDrag, sendDragEnd]);

  /** 在右栏点「写附注」：建一条空的，顺手把气泡钉开，不然点完像没反应。 */
  const createNote = useCallback((id: string) => {
    changeNote(id, emptyNote());
    setPinnedNote(id);
    setNoteExpanded(true);
  }, []);

  const applyTemplate = useCallback((next: FlowDoc, name: string) => {
    commit(next, `套用了模板「${name}」`);
    refit(next.nodes);
    setSelected(null); setEdgeIndex(null); setLinkFrom(null);
    setToast(`已套用「${name}」· ${next.nodes.length} 个节点`);
  }, [commit]);

  /** 粘贴生成。跟导入、套模板走同一条路：进历史栈、可撤销、交还自动居中。 */
  const generateFrom = useCallback((next: FlowDoc, stats: string) => {
    commit(next, `粘贴生成了「${next.title}」`);
    refit(next.nodes);
    setSelected(null); setEdgeIndex(null); setLinkFrom(null); setPasting(null);
    setToast(`已生成 · ${stats}`);
  }, [commit]);

  const changeNote = useCallback((nodeId: string, note: Note | undefined) => {
    setDoc(d => ({ ...d, nodes: d.nodes.map(n => (n.id === nodeId ? { ...n, note } : n)) }));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      // 正在输入框里打字就别抢键
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
        if (e.key === 'Escape') el.blur();
        return;
      }
      if (e.code === 'Space' && !e.repeat) { e.preventDefault(); setSpaceDown(true); return; }
      if (e.key === 'Escape' && pasting !== null) { setPasting(null); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      else if ((e.key === 'Backspace' || e.key === 'Delete') && selected) { e.preventDefault(); deleteNode(selected); }
      else if (e.key === 'Escape') { setSelected(null); setEdgeIndex(null); setLinkFrom(null); setPinnedNote(null); setHoverNote(null); }
    };
    /** 画布上直接 ⌘V：把剪贴板里的文字塞进粘贴框。
     *  在输入框里粘贴不拦截 —— 那是正常打字。 */
    const onPaste = (e: ClipboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      const text = e.clipboardData?.getData('text/plain')?.trim();
      if (!text) return;
      e.preventDefault();
      setPasting(text);
    };
    const onKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space') setSpaceDown(false); };
    // 切到别的窗口时空格可能「卡住」，回来要清掉
    const onBlur = () => setSpaceDown(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('paste', onPaste);
    };
  }, [undo, redo, deleteNode, selected, pasting]);

  return (
    <div className={s.stage}>

      {/* 顶端发丝线：整条流程的完成度 */}
      <div className={s.hairline}><div className={s.hairFill} style={{ width: `${Math.round(prog.ratio * 100)}%` }} /></div>

      {/* 画布常驻铺满全屏；其他视图时面板「盖」在上面，不拆画布 ——
          滚轮监听是挂载时绑一次的，画布一销毁重建，监听指着旧元素，缩放就死了 */}
      {(
        <div
          ref={canvasRef}
          style={{ position: 'absolute', inset: 0 }}
          className={`${s.canvas} ${dropping ? s.canvasDrop : ''} ${spaceDown ? s.canvasPan : ''}`}
          onPointerDown={e => {
            // 中键随时可拖；空格按住随时可拖；否则只有按在空白处才拖
            const overInteractive = !!(e.target as Element).closest('[data-node],[data-pop]');
            if (shouldClearCanvasSelection({ button: e.button, overInteractive })) {
              setSelected(null);
              setEdgeIndex(null);
            }
            if (!(e.button === 1 || spaceDown || (e.button === 0 && !overInteractive))) return;
            userMovedRef.current = true;
            panRef.current = { sx: e.clientX, sy: e.clientY, ox: vpRef.current.x, oy: vpRef.current.y };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={e => {
            // 光标位置广播给同一张图的同事 —— 发的是世界坐标，各自按自己镜头换算
            const rct = e.currentTarget.getBoundingClientRect();
            sendCursor((e.clientX - rct.left - vpRef.current.x) / vpRef.current.z,
                       (e.clientY - rct.top - vpRef.current.y) / vpRef.current.z);
            const p = panRef.current;
            if (!p) return;
            setVp(v => ({ ...v, x: p.ox + (e.clientX - p.sx), y: p.oy + (e.clientY - p.sy) }));
          }}
          onPointerUp={() => { panRef.current = null; }}
          onPointerCancel={() => { panRef.current = null; }}
          onDragOver={e => { e.preventDefault(); setDropping(true); }}
          onDragLeave={e => { if (e.currentTarget === e.target) setDropping(false); }}
          onDrop={e => { e.preventDefault(); setDropping(false); openFile(e.dataTransfer.files?.[0]); }}
        >
          <div style={{ position: 'absolute', inset: 0, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.z})`, transformOrigin: '0 0' }}>
            <FlowEdges doc={liveDoc} selectedEdge={edgeIndex} onSelectEdge={selectEdge} />
            {liveDoc.nodes.map(n => (
              <FlowNode
                key={n.id}
                node={n}
                peerRing={peerMarks.get(n.id)}
                footnote={notes.get(n.id)}
                activeFootnote={selected === n.id}
                onSelect={clickNode}
                onToggle={toggleDone}
                onOpenNote={openNote}
                terminal={terminalRole(doc, n.id)}
                onDragStart={startDrag}
                onMarkerHover={scheduleHover}
                panMode={spaceDown}
              />
            ))}

          </div>

          {(() => {
            // 气泡不进缩放层 —— 图缩到 33% 时字还没法读就没意义了。
            // 位置按屏幕坐标换算（跟着缩放走），气泡本身永远 1:1。
            const id = pinnedNote ?? hoverNote;
            const n = id ? liveDoc.nodes.find(x => x.id === id) : null;
            if (!n?.note) return null;
            return (
              <NotePopover
                node={n}
                index={notes.get(n.id) ?? 0}
                x={vp.x + (n.x ?? 0) * vp.z}
                y={vp.y + (n.y ?? 0) * vp.z}
                nodeWpx={nodeW(n) * vp.z}
                canvasW={canvas.w}
                pinned={pinnedNote === n.id}
                expanded={pinnedNote === n.id && noteExpanded}
                onPin={() => { setPinnedNote(n.id); setNoteExpanded(true); setSelected(n.id); }}
                onEnter={keepHover}
                onLeave={() => { if (pinnedNote !== n.id) scheduleHover(null); }}
                onClose={() => { setPinnedNote(null); setHoverNote(null); }}
                onToggleExpand={() => {
                  if (pinnedNote !== n.id) { setPinnedNote(n.id); setNoteExpanded(true); }
                  else setNoteExpanded(v => !v);
                }}
                onChange={note => changeNote(n.id, note)}
              />
            );
          })()}

          {/* 同事的光标 —— 收到的是世界坐标，按自己的镜头换算成屏幕位置 */}
          {mates.filter(m => m.x !== undefined).map(m => (
            <div key={m.key} className={s.peerCursor}
                 style={{ left: vp.x + (m.x ?? 0) * vp.z, top: vp.y + (m.y ?? 0) * vp.z }}>
              <svg width="13" height="16" viewBox="0 0 13 16">
                <path d="M0 0 L13 10 L7.5 11 L10 16 L7.8 16 L5.4 11.6 L0 14.5 Z" fill={m.color} />
              </svg>
              <span className={s.peerTag} style={{ background: m.color }}>{m.name}</span>
            </div>
          ))}
        </div>
      )}

      {view !== '流程图' && (
        <div className={s.viewPanel} style={{ left: sideOpen ? 268 : 0 }}>
          {view === '泳道' ? <LanesView doc={doc} onSelect={setSelected} />
            : view === '时间条' ? <TimelineView doc={doc} onSelect={setSelected} />
            : <ChecklistView doc={doc} onToggleNode={toggleDone} onToggleStep={toggleStepAt} />}
        </div>
      )}

      {/* 选中节点头顶的快捷工具条：外观快调在这，资料详编在右栏。
          拖动、连线、按住空格时都先收起来 —— 不跟手势抢地方 */}
      {view === '流程图' && selected && !dragging && !spaceDown && edgeIndex === null
        && linkFrom === null && loadState === 'ready' && (() => {
        const live = liveDoc.nodes.find(nn => nn.id === selected);
        const n = doc.nodes.find(nn => nn.id === selected);
        if (!n || !live) return null;
        return (
          <NodeToolbar
            node={n}
            x={vp.x + ((live.x ?? 0) + nodeW(live) / 2) * vp.z}
            y={vp.y + (live.y ?? 0) * vp.z}
            onShape={sh => commit(patchNode(doc, n.id, { shape: sh }), '改了形状')}
            onStyle={(p, label) => restyle(n.id, p, label)}
            onHref={url => commit(patchNode(doc, n.id, { href: url }), url ? `给「${n.title}」挂了链接` : '清除了链接')}
            onNote={() => (n.note ? openNote(n.id) : createNote(n.id))}
            onLink={() => { setLinkFrom(n.id); setEdgeIndex(null); }}
            onToggleLock={() => commit(patchNode(doc, n.id, { locked: n.locked ? undefined : true }),
                                       n.locked ? `解锁了「${n.title}」` : `锁住了「${n.title}」`)}
            onToggleMute={() => commit(patchNode(doc, n.id, { muted: !n.muted }),
                                       n.muted ? '取消弱化' : `弱化了「${n.title}」`)}
            onAddAfter={addStep}
            onDelete={() => deleteNode(n.id)}
          />
        );
      })()}

      {/* 左上：文档胶囊 —— 名字、进度、保存状态 */}
      <div className={`${s.pill} ${s.docPill}`}>
        <span className={s.docDot} />
        <input className={s.docPillInput} value={doc.title} aria-label="流程图标题"
               placeholder="给这张图起个名字"
               onChange={e => setDoc(d => ({ ...d, title: e.target.value }))} />
        <span className={s.docMeta}>
          {prog.done}/{prog.total} ·{' '}
          {saveState === 'error'
            ? <button className={s.saveErr} onClick={retrySave}
                      title="一般是网络断了。改动还留在本页，点击补发；不放心可先导出 JSON。">保存失败 · 点此重试</button>
            : saveState === 'saving' ? '保存中…' : '已保存'}
        </span>
        {mates.length > 0 && (
          <span className={s.mateRow} title={`同时在看：${mates.map(m => m.name).join('、')}`}>
            {mates.slice(0, 4).map(m => (
              <span key={m.key} className={s.mateChip} style={{ background: m.color }}>
                {(m.name || '?').slice(0, 1).toUpperCase()}
              </span>
            ))}
            {mates.length > 4 && <span className={s.mateMore}>+{mates.length - 4}</span>}
          </span>
        )}
        <button className={s.histBtn} onClick={() => setHistOpen(o => !o)}>历史</button>
      </div>

      {/* 顶部中央：四视图切换 */}
      <div className={`${s.pill} ${s.viewPill}`}>
        {VIEWS.map(v => (
          <button key={v} className={`${s.viewSeg} ${v === view ? s.viewSegOn : ''}`} onClick={() => setView(v)}>{v}</button>
        ))}
      </div>

      {/* 提示：连线引导 / 一次性消息 */}
      {(linkFrom !== null || toast) && (
        <div className={`${s.pill} ${s.floatToast}`}>
          {linkFrom !== null
            ? (linkFrom === '' ? '连线中 · 点一下起点节点' : '连线中 · 再点一下终点节点（Esc 取消）')
            : toast}
        </div>
      )}

      {/* 右上：账号 —— 头像（点开是 Clerk 菜单）+ 明确的登出 */}
      <div className={`${s.pill} ${s.acctPill}`}>
        {/* 个人空间 ↔ Team 的切换；邀请/移除成员也在这个菜单里（Clerk 自带） */}
        <span className={s.orgSwitch}><OrganizationSwitcher /></span>
        <UserButton />
        <span className={s.acctName}>{user?.firstName ?? user?.username ?? user?.primaryEmailAddress?.emailAddress?.split('@')[0] ?? ''}</span>
        <button className={s.acctOut} onClick={() => signOut({ redirectUrl: '/' })}>登出</button>
      </div>

      {/* 左侧：资料库浮卡 / 收起后是一颗按钮 */}
      {ws && (sideOpen ? (
        <Sidebar
          ws={ws} onClose={() => setSideOpen(false)}
          onPick={pickFlow} onNew={newDoc} onRename={renameFlow}
          onDelete={removeFlow} onMove={relocateFlow}
          onNewFolder={newFolder} onRenameFolder={renameFolder} onDropFolder={removeFolder}
          spaces={spaces} onMoveSpace={relocateSpace}
        />
      ) : (
        <button className={s.libToggle} onClick={() => setSideOpen(true)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 5h16M4 12h10M4 19h13" /></svg>
          流程库
        </button>
      ))}

      {/* 底部中央：工具条（只在流程图视图） */}
      {view === '流程图' && (
        <div className={`${s.pill} ${s.toolbarFloat}`}>
          <button className={s.tbBtn} onClick={undo} disabled={!history.length}
                  title={history.length ? `撤销 · ${history[0].label}（⌘Z）` : '没有可撤销的改动'}>撤销</button>
          <button className={s.tbBtn} onClick={redo} disabled={!future.length}
                  title={future.length ? `重做 · ${future[0].label}（⇧⌘Z）` : '没有可重做的改动'}>重做</button>
          <button className={`${s.tbBtn} ${s.tbStrong}`} onClick={addStep}>＋ 节点</button>
          <button className={`${s.tbBtn} ${linkFrom !== null ? s.tbOn : ''}`}
                  onClick={() => { setLinkFrom(v => (v === null ? '' : null)); setEdgeIndex(null); }}>连线</button>
          <button className={s.tbBtn} onClick={() => setPasting('')}>粘贴生成</button>
          <TemplateMenu onPick={applyTemplate} up />
          <button className={s.tbBtn} onClick={() => fileRef.current?.click()}>导入</button>
          <button className={s.tbBtn} onClick={relayout}>重新排版</button>
          <ExportMenu doc={doc} onDone={setToast} up />
        </div>
      )}
      <input ref={fileRef} type="file" accept="application/json,.json" hidden
             onChange={e => { openFile(e.target.files?.[0]); e.target.value = ''; }} />

      {/* 右下：缩放（只在流程图视图） */}
      {view === '流程图' && (
        <div className={`${s.pill} ${s.zoomFloat}`}>
          <button className={s.zoomBtn} onClick={() => { userMovedRef.current = true; setVp(v => ({ ...v, z: clampZ(v.z / 1.2) })); }} aria-label="缩小">−</button>
          <button className={s.zoomBtn} onClick={() => refit(doc.nodes)} title="让整张图正好放进画布">{Math.round(vp.z * 100)}%</button>
          <button className={s.zoomBtn} onClick={() => { userMovedRef.current = true; setVp(v => ({ ...v, z: clampZ(v.z * 1.2) })); }} aria-label="放大">＋</button>
        </div>
      )}

      {/* 检查器：选中了才浮出来 */}
      {histOpen && ws?.currentId && (
        <VersionsPanel
          flowId={ws.currentId}
          currentVersion={ws.docs.find(d => d.id === ws.currentId)?.version ?? 1}
          onClose={() => setHistOpen(false)}
          onRestore={doRestore}
        />
      )}

      {view === '流程图' && !histOpen && edgeIndex !== null && (
        <div className={s.inspectorFloat}>
          <EdgePanel doc={doc} index={edgeIndex} onPatch={changeEdge}
                     onDelete={deleteEdge} onClose={() => setEdgeIndex(null)} />
        </div>
      )}
      {view === '流程图' && !histOpen && edgeIndex === null && selected && (
        <div className={s.inspectorFloat}>
          <NotePanel
            doc={doc}
            nodeId={selected}
            onClose={() => setSelected(null)}
            onPatch={patch}
            onDelete={deleteNode}
            onAddAfter={id => { setSelected(id); addStep(); }}
            onCreateNote={createNote}
          />
        </div>
      )}

      {pasting !== null && (
        <PasteDialog initial={pasting} onCancel={() => setPasting(null)} onGenerate={generateFrom} />
      )}

      {/* 工作区还没拉回来之前，罩住画布 —— 别让人对着还没落库的空图白画 */}
      {loadState !== 'ready' && (
        <div className={s.bootVeil}>
          {loadState === 'loading' ? (
            <div className={s.bootCard}>
              <span className={s.bootLine}><span className={s.bootDot} />正在取回你的流程…</span>
            </div>
          ) : (
            <div className={s.bootCard}>
              <strong>工作区没能加载</strong>
              <span className={s.bootWhy}>{loadErr || '网络不通'}</span>
              <button className={s.bootRetry} onClick={bootstrap}>重试</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
