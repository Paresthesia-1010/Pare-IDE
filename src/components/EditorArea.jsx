import React, { useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { VscFile, VscClose, VscPass } from 'react-icons/vsc';

function getLanguage(fileName) {
  if (!fileName) return 'javascript';
  const ext = fileName.split('.').pop().toLowerCase();
  switch (ext) {
    case 'js':
    case 'jsx': return 'javascript';
    case 'ts':
    case 'tsx': return 'typescript';
    case 'json': return 'json';
    case 'html': return 'html';
    case 'css': return 'css';
    case 'py': return 'python';
    case 'md': return 'markdown';
    default: return 'plaintext';
  }
}

export default function EditorArea({
  openTabs,
  activePath,
  activeTab,
  onSelectTab,
  onCloseTab,
  onChangeCode,
  cursorPos,
  setCursorPos,
  onSaveActiveTab,
  pendingDiff
}) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const decorationsRef = useRef([]);

  // ★ Stale Closure 방지용 최신 핸들러 Ref
  // ★ 에디터 화면의 실제 글자를 실시간으로 뽑아서 저장
  const onSaveRef = useRef();
  onSaveRef.current = () => {
    if (!editorRef.current) return;
    const currentCode = editorRef.current.getValue();
    const targetPath = activeTab?.path || activePath;

    if (targetPath) {
      onSaveActiveTab(targetPath, currentCode);
      if (decorationsRef.current) {
        decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, []);
      }
    }
  };

  const handleEditorMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    editor.onDidChangeCursorPosition((e) => {
      setCursorPos({ line: e.position.lineNumber, col: e.position.column });
    });

    // Monaco 에디터 내 Ctrl+S 단축키
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (onSaveRef.current) onSaveRef.current();
    });
  };

  // 전역 Ctrl+S 리스너
  useEffect(() => {
    const handleGlobalSave = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (onSaveRef.current) onSaveRef.current();
      }
    };
    window.addEventListener('keydown', handleGlobalSave);
    return () => window.removeEventListener('keydown', handleGlobalSave);
  }, []);

  // AI Diff 실시간 치환 및 초록색 하이라이트 적용 (Ctrl+Z / Ctrl+Y 가능)
  useEffect(() => {
    if (!pendingDiff || !editorRef.current || !monacoRef.current || !activeTab) return;

    const normDiffPath = pendingDiff.fullPath.replace(/\\/g, '/').toLowerCase();
    const normActivePath = activeTab.path.replace(/\\/g, '/').toLowerCase();
    if (normDiffPath !== normActivePath) return;

    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor.getModel();
    if (!model) return;

    const newDecorations = [];

    if (pendingDiff.diffBlocks && pendingDiff.diffBlocks.length > 0) {
      pendingDiff.diffBlocks.forEach((block) => {
        const searchMatches = model.findMatches(block.search, true, false, false, null, false);
        if (searchMatches.length > 0) {
          const targetRange = searchMatches[0].range;

          editor.executeEdits('ai-diff-agent', [
            {
              range: targetRange,
              text: block.replace,
              forceMoveMarkers: true
            }
          ]);
          editor.pushUndoStop();

          const lineCount = block.replace.split('\n').length;
          const startLine = targetRange.startLineNumber;
          const endLine = startLine + lineCount - 1;

          newDecorations.push({
            range: new monaco.Range(startLine, 1, endLine, 1),
            options: {
              isWholeLine: true,
              className: 'ai-diff-line-highlight',
              linesDecorationsClassName: 'ai-diff-gutter-marker'
            }
          });
        } else {
          const fullRange = model.getFullModelRange();
          editor.executeEdits('ai-diff-agent', [
            {
              range: fullRange,
              text: pendingDiff.newContent,
              forceMoveMarkers: true
            }
          ]);
          editor.pushUndoStop();
        }
      });
    }

    if (newDecorations.length > 0) {
      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations);
    }

    onChangeCode(editor.getValue());
  }, [pendingDiff]);

  return (
    <div className="editor-section">
      <div className="tabs-container">
        {openTabs.map((tab) => {
          const isActive = tab.path.replace(/\\/g, '/').toLowerCase() === activePath?.replace(/\\/g, '/').toLowerCase();
          return (
            <div
              key={tab.path}
              className={`tab-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTab(tab.path)}
            >
              <VscFile size={13} color={isActive ? '#569cd6' : '#9cdcfe'} />
              <span>{tab.name}</span>
              {tab.isDirty && <span className="dirty-indicator" title="미저장 (Ctrl+S로 저장)">●</span>}
              <span className="tab-close" onClick={(e) => onCloseTab(e, tab.path)}>
                <VscClose size={13} />
              </span>
            </div>
          );
        })}
      </div>

      <div className="editor-surface">
        {activeTab ? (
          <Editor
            height="100%"
            theme="vs-dark"
            language={getLanguage(activeTab.name)}
            value={activeTab.content}
            onChange={onChangeCode}
            onMount={handleEditorMount}
            options={{
              fontSize: 13,
              fontFamily: 'Consolas, "Cascadia Code", monospace',
              lineHeight: 20,
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              automaticLayout: true,
              renderWhitespace: 'selection'
            }}
          />
        ) : (
          <div style={{ padding: '30px', color: '#6e6e6e', fontSize: '13px' }}>
            솔루션 탐색기에서 파일을 선택하여 편집을 시작하세요.
          </div>
        )}
      </div>

      <div className="editor-footer-bar">
        <div className="editor-footer-group">
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <VscPass size={13} color="#4ec9b0" /> 문제가 검색되지 않음
          </span>
        </div>
        <div className="editor-footer-group">
          <span>줄: {cursorPos.line}, 문자: {cursorPos.col}</span>
          <span>SPC</span>
          <span>CRLF</span>
          <span style={{ color: '#4ec9b0', fontWeight: 600 }}>UTF-8</span>
        </div>
      </div>
    </div>
  );
}