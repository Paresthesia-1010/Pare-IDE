import React, { useState } from 'react';
import { VscCopy, VscCheck, VscCode } from 'react-icons/vsc';

// 1. 코드 블록 컴포넌트 (언어 라벨 + 원클릭 복사 버튼)
function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = code;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="md-code-block-container" style={{
      margin: '8px 0',
      borderRadius: '6px',
      overflow: 'hidden',
      background: '#121216',
      border: '1px solid #27272a',
      fontSize: '12px'
    }}>
      <div className="md-code-header" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '5px 10px',
        background: '#18181b',
        borderBottom: '1px solid #27272a',
        color: '#a1a1aa'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', textTransform: 'lowercase' }}>
          <VscCode size={13} color="#38bdf8" />
          <span>{language || 'text'}</span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          style={{
            background: 'transparent',
            border: 'none',
            color: copied ? '#4ade80' : '#a1a1aa',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px',
            padding: '2px 6px',
            borderRadius: '4px',
            transition: 'all 0.15s ease'
          }}
          title="코드 복사"
        >
          {copied ? <VscCheck size={12} color="#4ade80" /> : <VscCopy size={12} />}
          <span>{copied ? '복사됨!' : '복사'}</span>
        </button>
      </div>
      <pre style={{
        margin: 0,
        padding: '10px 12px',
        overflowX: 'auto',
        fontFamily: 'Consolas, "Cascadia Code", "Fira Code", monospace',
        lineHeight: 1.45,
        color: '#e4e4e7',
        fontSize: '11.5px'
      }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

// 2. 인라인 마크다운 파서 (볼드, 이탤릭, 인라인코드, 취소선, 링크)
function parseInline(text) {
  if (!text) return null;

  // 토큰 분리를 위한 정규식 (인라인 코드, 볼드+이탤릭, 볼드, 이탤릭, 취소선, 링크)
  const regex = /(`[^`]+`|\*\*\*[^*]+\*\*\*|___[^_]+___|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*]+\*|_[^_]+_|\[(?:\\.|[^\]])+\]\((?:\\.|[^)])+\))/g;
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (!part) return null;

    // 인라인 코드: `code`
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code key={index} style={{
          background: '#27272a',
          color: '#f43f5e',
          padding: '2px 5px',
          borderRadius: '4px',
          fontSize: '0.88em',
          fontFamily: 'Consolas, monospace',
          margin: '0 2px'
        }}>
          {part.slice(1, -1)}
        </code>
      );
    }

    // 볼드 + 이탤릭: ***text*** 또는 ___text___
    if ((part.startsWith('***') && part.endsWith('***') && part.length >= 6) ||
        (part.startsWith('___') && part.endsWith('___') && part.length >= 6)) {
      return <strong key={index}><em>{parseInline(part.slice(3, -3))}</em></strong>;
    }

    // 볼드: **text** 또는 __text__
    if ((part.startsWith('**') && part.endsWith('**') && part.length >= 4) ||
        (part.startsWith('__') && part.endsWith('__') && part.length >= 4)) {
      return <strong key={index} style={{ color: '#fafafa', fontWeight: 600 }}>{parseInline(part.slice(2, -2))}</strong>;
    }

    // 취소선: ~~text~~
    if (part.startsWith('~~') && part.endsWith('~~') && part.length >= 4) {
      return <del key={index} style={{ color: '#71717a' }}>{parseInline(part.slice(2, -2))}</del>;
    }

    // 이탤릭: *text* 또는 _text_
    if ((part.startsWith('*') && part.endsWith('*') && part.length >= 2) ||
        (part.startsWith('_') && part.endsWith('_') && part.length >= 2)) {
      return <em key={index}>{parseInline(part.slice(1, -1))}</em>;
    }

    // 링크: [label](url)
    const linkMatch = part.match(/^\[((?:\\.|[^\]])+)\]\(((?:\\.|[^)])+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={index}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#38bdf8', textDecoration: 'underline', wordBreak: 'break-all' }}
        >
          {linkMatch[1]}
        </a>
      );
    }

    return part;
  });
}

// 3. 테이블 파싱 렌더링
function renderTable(lines, key) {
  if (lines.length < 2) return null;
  const headerCols = lines[0].split('|').map(c => c.trim()).filter((_, idx, arr) => idx !== 0 && idx !== arr.length - 1);
  const dataRows = lines.slice(2).map(line =>
    line.split('|').map(c => c.trim()).filter((_, idx, arr) => idx !== 0 && idx !== arr.length - 1)
  );

  return (
    <div key={key} style={{ overflowX: 'auto', margin: '8px 0' }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '11.5px',
        background: '#18181b',
        border: '1px solid #27272a',
        borderRadius: '4px'
      }}>
        <thead>
          <tr style={{ background: '#27272a', color: '#e4e4e7' }}>
            {headerCols.map((h, i) => (
              <th key={i} style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #3f3f46' }}>
                {parseInline(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataRows.map((row, rIdx) => (
            <tr key={rIdx} style={{ borderBottom: '1px solid #27272a' }}>
              {row.map((cell, cIdx) => (
                <td key={cIdx} style={{ padding: '6px 10px', color: '#d4d4d8' }}>
                  {parseInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 4. 메인 Markdown 컴포넌트
export default function MarkdownView({ content }) {
  if (!content) return null;

  const normalized = content.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const elements = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // (1) 코드 블록 (``` ~ ```)
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <CodeBlock
          key={`code-${i}`}
          language={lang}
          code={codeLines.join('\n')}
        />
      );
      i++;
      continue;
    }

    // (2) 수평선 (---, ***, ___)
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(line.trim())) {
      elements.push(
        <hr key={`hr-${i}`} style={{ border: 'none', borderTop: '1px solid #27272a', margin: '10px 0' }} />
      );
      i++;
      continue;
    }

    // (3) 헤딩 (# ~ ######)
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = headingMatch[2];
      const fontSizes = ['1.25em', '1.15em', '1.05em', '0.98em', '0.92em', '0.88em'];
      const Tag = `h${level}`;
      elements.push(
        <Tag
          key={`h-${i}`}
          style={{
            fontSize: fontSizes[level - 1],
            fontWeight: 700,
            margin: '8px 0 4px 0',
            color: level === 1 ? '#60a5fa' : level === 2 ? '#a78bfa' : '#f4f4f5',
            lineHeight: 1.3
          }}
        >
          {parseInline(title)}
        </Tag>
      );
      i++;
      continue;
    }

    // (4) 마크다운 테이블 (| col1 | col2 |)
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      elements.push(renderTable(tableLines, `tbl-${i}`));
      continue;
    }

    // (5) 인용구 (> quote)
    if (line.trim().startsWith('>')) {
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      elements.push(
        <blockquote
          key={`quote-${i}`}
          style={{
            margin: '6px 0',
            padding: '4px 10px',
            borderLeft: '3px solid #60a5fa',
            background: 'rgba(96, 165, 250, 0.08)',
            color: '#cbd5e1',
            borderRadius: '0 4px 4px 0',
            fontSize: '11.5px'
          }}
        >
          {quoteLines.map((q, qIdx) => (
            <div key={qIdx}>{parseInline(q)}</div>
          ))}
        </blockquote>
      );
      continue;
    }

    // (6) 체크박스 및 불릿 목록 (- [ ] , - [x] , - , * , + )
    const taskMatch = line.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/);
    if (taskMatch) {
      const checked = taskMatch[2].toLowerCase() === 'x';
      elements.push(
        <div key={`task-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '3px 0' }}>
          <input type="checkbox" checked={checked} readOnly style={{ accentColor: '#60a5fa', cursor: 'default' }} />
          <span style={{ textDecoration: checked ? 'line-through' : 'none', color: checked ? '#71717a' : '#d4d4d8' }}>
            {parseInline(taskMatch[3])}
          </span>
        </div>
      );
      i++;
      continue;
    }

    // 일반 불릿 목록 (- , * , + )
    const bulletMatch = line.match(/^(\s*)([-*+])\s+(.*)$/);
    if (bulletMatch) {
      const indent = bulletMatch[1].length * 10;
      elements.push(
        <div key={`bullet-${i}`} style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginLeft: `${indent + 4}px`, margin: '2px 0' }}>
          <span style={{ color: '#60a5fa', fontSize: '10px' }}>•</span>
          <span style={{ color: '#d4d4d8' }}>{parseInline(bulletMatch[3])}</span>
        </div>
      );
      i++;
      continue;
    }

    // (7) 번호 목록 (1. , 2. )
    const numMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (numMatch) {
      const indent = numMatch[1].length * 10;
      elements.push(
        <div key={`num-${i}`} style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginLeft: `${indent + 4}px`, margin: '2px 0' }}>
          <span style={{ color: '#a78bfa', fontSize: '11px', fontWeight: 600 }}>{numMatch[2]}.</span>
          <span style={{ color: '#d4d4d8' }}>{parseInline(numMatch[3])}</span>
        </div>
      );
      i++;
      continue;
    }

    // (8) 일반 텍스트 라인
    if (line.trim() === '') {
      elements.push(<div key={`br-${i}`} style={{ height: '6px' }} />);
    } else {
      elements.push(
        <div key={`line-${i}`} style={{ margin: '2px 0', wordBreak: 'break-word', lineHeight: 1.5 }}>
          {parseInline(line)}
        </div>
      );
    }
    i++;
  }

  return <div className="markdown-rendered-view">{elements}</div>;
}
