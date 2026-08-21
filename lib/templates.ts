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

export const TEMPLATES: Template[] = [
  {
    id: 'onboarding',
    name: '新员工入职',
    desc: '9 步 · 3 个部门 · 含判断分支和附注',
    build: () => autoLayout(structuredClone(onboarding)),
  },
];
