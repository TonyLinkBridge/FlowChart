import type { FlowDoc } from '@/lib/types';

export const branchedFlow: FlowDoc = {
  title: '本地分支插入测试', direction: 'TB',
  nodes: [
    { id: 'notice', title: '通知用户裁决结果', x: 300, y: 100, note: {
      text: 'Dear Case Manager,\n完整英文邮件模板\nEND-MAIL-KEEP',
      steps: [{ text: '核对材料', done: false }], fields: [{ label: '案件', value: 'LOCAL-ONLY' }],
      links: [{ label: '参考', url: 'https://example.test' }], contact: '假联系人',
    } },
    { id: 'wait', title: '等待 10 个工作日', x: 300, y: 176, style: { fill: '#ad302b' } },
    { id: 'decision', title: '是否收到法院诉讼证明？', shape: 'decision', x: 330, y: 252 },
    { id: 'court', title: '告知机构暂停执行决定', x: 100, y: 400, note: { text: '暂停执行英文模板 END-COURT-KEEP' } },
    { id: 'execute', title: '执行裁决', x: 600, y: 400, note: { text: '交付通知 END-DELIVERY-KEEP' } },
    { id: 'join', title: '案件关闭', x: 300, y: 650, note: { text: '完成说明 END-CLOSE-KEEP' } },
    { id: 'unrelated', title: '独立分支不移动', x: 1000, y: 176, locked: true },
  ],
  edges: [
    { source: 'notice', target: 'wait' }, { source: 'wait', target: 'decision' },
    { source: 'decision', target: 'court', label: '是', dashed: true },
    { source: 'decision', target: 'execute', label: '否' },
    { source: 'court', target: 'join' }, { source: 'execute', target: 'join' },
  ],
};
