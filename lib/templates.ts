import { autoLayout } from './layout';
import type { FlowDoc } from './types';

export interface Template {
  id: string;
  name: string;
  desc: string;
  build: () => FlowDoc;
}

/** 内置模板。build() 每次都重新排版并返回全新对象 ——
 *  直接共用同一份数据的话，用户一改就把模板本身改了。 */
const onboarding: FlowDoc = {
  title: '新员工入职流程',
  direction: 'TB',
  nodes: [
    { id: 'offer', title: '录用通知发出', shape: 'terminator', x: 360, y: 20 },

    { id: 'collect', title: '收集材料', x: 360, y: 94, owner: 'HR', days: 1, done: true,
      note: {
        steps: [
          { text: '身份证、学历证书、离职证明各一份', done: true },
          { text: '扫描件按模板命名规则重命名', done: true },
        ],
        links: [{ label: '材料清单模板', url: '#' }],
        contact: '人力运营组',
      } },

    { id: 'verify', title: '第三方核验', x: 360, y: 170, owner: 'HR', days: 3,
      note: {
        steps: [
          { text: '在 HRIS 提交核验申请', done: true },
          { text: '上传候选人授权书', done: true },
          { text: '勾选核验项：学历 / 履历 / 背调', done: true },
          { text: '等第三方回执，一般 2 个工作日', done: false },
          { text: '回执 PDF 存档到候选人档案', done: false },
        ],
        fields: [
          { label: '申请单号', value: 'HRV-2026-0418' },
          { label: '核验机构' },
        ],
        links: [
          { label: 'HRIS 核验申请入口', url: '#' },
          { label: '背调授权书模板 v3', url: '#' },
        ],
        contact: '人力运营组 | 群「入职流程答疑」',
        text: '回执超过 3 个工作日未到，直接在群里 @ 对接人，不要干等。',
      } },

    { id: 'report', title: '出具报告', x: 360, y: 248, owner: 'HR', days: 1,
      note: {
        steps: [{ text: '套用「背调报告 v3」模板', done: false }],
        text: '结论栏只能填 **通过 / 存疑 / 不通过**，不要自由发挥。',
      } },

    { id: 'pass', title: '核验通过？', shape: 'decision', x: 390, y: 324 },

    { id: 'stop', title: '终止流程', x: 80, y: 418, muted: true },

    { id: 'it', title: '开通账号 · 领设备', x: 640, y: 418, owner: 'IT', days: 2,
      note: {
        steps: [
          { text: '开通邮箱、内网、代码仓库权限', done: false },
          { text: '领笔记本 + 工牌', done: false },
        ],
        contact: 'IT 服务台',
      } },

    { id: 'done', title: '完成入职', shape: 'terminator', x: 640, y: 494 },
  ],
  edges: [
    { source: 'offer',   target: 'collect' },
    { source: 'collect', target: 'verify'  },
    { source: 'verify',  target: 'report'  },
    { source: 'report',  target: 'pass'    },
    { source: 'pass',    target: 'it',   label: '是' },
    { source: 'pass',    target: 'stop', label: '否', dashed: true },
    { source: 'it',      target: 'done'    },
  ],
};

/** 费用报销：最常见的「审批不过就退回重来」结构 ——
 *  回环是虚线，排版对有环的图会退化成按原始顺序分层，不会崩。 */
const expense: FlowDoc = {
  title: '费用报销',
  direction: 'TB',
  nodes: [
    { id: 'go', title: '发起报销', shape: 'terminator' },

    { id: 'fill', title: '填单 · 传票据', owner: '申请人', days: 1,
      note: {
        steps: [
          { text: '报销系统里新建单据，选对费用类型', done: false },
          { text: '发票原件拍照上传，纸质票留好', done: false },
          { text: '超 500 元的单笔支出，附审批邮件截图', done: false },
        ],
        fields: [{ label: '报销单号' }, { label: '合计金额' }],
        links: [{ label: '报销系统入口', url: '#' }],
        contact: '财务小助手（企业微信）',
        text: '发票抬头必须是公司全称，写错了财务会直接退回，一来一回多等一周。',
      } },

    { id: 'lead', title: '主管审批', owner: '主管', days: 1 },
    { id: 'ok',   title: '主管通过？', shape: 'decision' },
    { id: 'back', title: '退回修改', muted: true },

    { id: 'fin', title: '财务复核', owner: '财务', days: 2,
      note: {
        steps: [
          { text: '核对发票真伪与连号', done: false },
          { text: '金额、类型与票据一致', done: false },
          { text: '录入记账凭证', done: false },
        ],
        text: '**单张发票超过 5000** 走大额通道，财务会另外联系经办人。',
      } },

    { id: 'pay',  title: '打款', owner: '财务', days: 3 },
    { id: 'done', title: '报销完成', shape: 'terminator' },
  ],
  edges: [
    { source: 'go',   target: 'fill' },
    { source: 'fill', target: 'lead' },
    { source: 'lead', target: 'ok'   },
    { source: 'ok',   target: 'fin',  label: '是' },
    { source: 'ok',   target: 'back', label: '否', dashed: true },
    { source: 'back', target: 'fill', label: '改完重交', dashed: true },
    { source: 'fin',  target: 'pay'  },
    { source: 'pay',  target: 'done' },
  ],
};

/** 客户工单处理：进来先分级，紧急的走快车道，最后由客户确认关单。 */
const ticket: FlowDoc = {
  title: '客户工单处理',
  direction: 'TB',
  nodes: [
    { id: 'in', title: '收到工单', shape: 'terminator' },

    { id: 'triage', title: '分类定级', owner: '客服', days: 1,
      note: {
        steps: [
          { text: '判断类型：咨询 / 故障 / 投诉', done: false },
          { text: '在系统里定级 P1–P3，写清影响范围', done: false },
        ],
        contact: '值班群「工单调度」',
      } },

    { id: 'urgent', title: '是 P1 紧急？', shape: 'decision' },

    { id: 'now', title: '立即响应', owner: '值班工程师', days: 1,
      note: { text: '**30 分钟内**必须给客户第一响应 —— 哪怕只是一句「我们在查」。' } },

    { id: 'queue', title: '排期处理', owner: '客服', days: 2 },

    { id: 'fix', title: '处理并回复', owner: '工程师', days: 2,
      note: {
        steps: [
          { text: '复现问题，定位原因', done: false },
          { text: '给出结论或解决方案', done: false },
          { text: '回复客户，附操作截图', done: false },
        ],
        fields: [{ label: '工单号' }],
      } },

    { id: 'happy', title: '客户确认解决？', shape: 'decision' },
    { id: 'close', title: '关闭工单', shape: 'terminator' },
  ],
  edges: [
    { source: 'in',     target: 'triage' },
    { source: 'triage', target: 'urgent' },
    { source: 'urgent', target: 'now',   label: '是' },
    { source: 'urgent', target: 'queue', label: '否' },
    { source: 'now',    target: 'fix' },
    { source: 'queue',  target: 'fix' },
    { source: 'fix',    target: 'happy' },
    { source: 'happy',  target: 'close', label: '是' },
    { source: 'happy',  target: 'fix',   label: '否 · 继续跟进', dashed: true },
  ],
};

export const TEMPLATES: Template[] = [
  {
    id: 'onboarding',
    name: '新员工入职',
    desc: '8 步 · 3 个部门 · 含判断分支和附注',
    build: () => autoLayout(structuredClone(onboarding)),
  },
  {
    id: 'expense',
    name: '费用报销',
    desc: '8 步 · 审批分支 · 含退回重交回环',
    build: () => autoLayout(structuredClone(expense)),
  },
  {
    id: 'ticket',
    name: '客户工单处理',
    desc: '8 步 · 紧急分流 · 客户确认后才关单',
    build: () => autoLayout(structuredClone(ticket)),
  },
];
