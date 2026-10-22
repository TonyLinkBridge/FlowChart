// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import * as arc from '@/components/arc/rich-text-editor/rich-text-editor';

describe('邮件兼容层：普通 Markdown API 不变，附注保留物理换行', () => {
  it('retains the official Markdown converter behavior for other consumers', () => {
    expect(arc.markdownToHtml('First\nsecond')).toBe('<p>First second</p>');
  });
  it.each([
    '', 'First\nsecond', '\nFirst\n\n\nSecond\n', '  缩进保留  \n结尾空格  \n',
    '# 标题\n\n**加粗** 和 `代码`\n', '- 一\n- 二\n', '> 第一行\n> 第二行',
    'Dear Case Manager,\n内容包含 <Complainant> & 原始符号\n\nEND-MAIL\n',
  ])('round-trips note text without normalizing whitespace: %j', text => {
    expect(arc.htmlToNoteMarkdown(arc.noteMarkdownToHtml(text))).toBe(text);
  });
  it('normalizes CRLF only in the browser representation, not the saved original', () => {
    expect(arc.htmlToNoteMarkdown(arc.noteMarkdownToHtml('A\r\n\r\nB\r\n'))).toBe('A\n\nB\n');
  });
  it('does not invent line breaks when native formatting wraps an empty-line placeholder in bold', () => {
    expect(arc.htmlToNoteMarkdown('<p><strong>A</strong></p><p><strong><br></strong></p><p><strong>B</strong></p><p><br></p>'))
      .toBe('**A**\n\n**B**\n');
  });
  it('keeps link sanitizing and rejects scripts and executable link protocols', () => {
    expect(arc.sanitizeHtml('<p>Hello<script>alert(1)</script><a href="javascript:alert(1)">bad</a></p>')).toBe('<p>Hellobad</p>');
  });
});
