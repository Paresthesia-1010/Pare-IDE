import React, { useState, useRef, useEffect } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { sanitizeAiText } from './js/chatformat';
import MarkdownView from './js/markdown';
import 'xterm/css/xterm.css';
import {
  VscSparkle,
  VscAccount,
  VscSend,
  VscClearAll,
  VscChevronRight,
  VscChevronDown,
  VscCheck,
  VscDiffAdded,
  VscDiffModified,
  VscDiffRemoved,
  VscSaveAll,
  VscTerminalCmd,
  VscFileCode,
  VscError,
  VscRefresh
} from 'react-icons/vsc';

function extractUserText(raw) {
  if (!raw) return '';
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed.user) return parsed.user;
  } catch (e) {}

  const match = raw.match(/\{"user"\s*:\s*("(?:\\.|[^"\\])*")\}/);
  if (match) {
    try {
      return JSON.parse(match[1]);
    } catch (e) {
      return match[1].slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"');
    }
  }

  const secMatch = raw.match(/\[사용자 요청\]\s*([\s\S]*?)(?=\n\[|$)/);
  if (secMatch) return secMatch[1].trim();
  return raw;
}

function renderMultilineText(text) {
  if (!text) return null;
  const normalized = text.replace(/\\n/g, '\n');
  return normalized.split('\n').map((line, idx, arr) => (
    <React.Fragment key={idx}>
      {line}
      {idx < arr.length - 1 && <br />}
    </React.Fragment>
  ));
}

function getInProgressStatus(rawText) {
  if (!rawText) return null;
  const hasEnd = rawText.includes('</end>') || rawText.includes('<end>');
  if (hasEnd) return null;

  const hasEdit = rawText.includes('<edit');
  const hasWrite = rawText.includes('<write');

  if (hasEdit && hasWrite) return '파일 생성 및 수정 중...';
  if (hasEdit) return '수정 중...';
  if (hasWrite) return '생성 중...';
  return null;
}

// ★ 말풍선 내부 인라인 xterm.js 터미널 컴포넌트
function InlineBubbleTerminal({ cmdId, command, initialStatus, initialCode }) {
  const termContainerRef = useRef(null);
  const termRef = useRef(null);
  const [status, setStatus] = useState(initialStatus || 'running'); // running, success, failed
  const [exitCode, setExitCode] = useState(initialCode);
  const [healingAlert, setHealingAlert] = useState(false);

  useEffect(() => {
    if (!termContainerRef.current) return;

    const term = new Terminal({
      theme: {
        background: '#0c0c0e',
        foreground: '#e4e4e7',
        cursor: '#71717a'
      },
      fontFamily: 'Consolas, "Cascadia Code", monospace',
      fontSize: 11,
      lineHeight: 1.25,
      convertEol: true,
      disableStdin: true
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(termContainerRef.current);
    fitAddon.fit();
    termRef.current = term;

    term.writeln(`\x1b[38;2;96;165;250m$ ${command}\x1b[0m\r\n`);

    const handleData = (evt) => {
      if (evt.cmdId === cmdId && termRef.current) {
        termRef.current.write(evt.data);
      }
    };

    const handleEnd = (evt) => {
      if (evt.cmdId === cmdId) {
        setStatus(evt.success ? 'success' : 'failed');
        setExitCode(evt.code);
        if (termRef.current) {
          if (evt.success) {
            termRef.current.writeln(`\r\n\x1b[38;2;74;222;128m[Process exited with code 0]\x1b[0m`);
          } else {
            termRef.current.writeln(`\r\n\x1b[38;2;248;113;113m[Process exited with code ${evt.code}]\x1b[0m`);
          }
        }
      }
    };

    const handleHealing = (evt) => {
      if (evt.cmdId === cmdId) {
        setHealingAlert(true);
      }
    };

    if (window.pareAPI) {
      window.pareAPI.onCmdData(handleData);
      window.pareAPI.onCmdEnd(handleEnd);
      window.pareAPI.onCmdHealing(handleHealing);
    }

    return () => {
      term.dispose();
    };
  }, [cmdId]);

  return (
    <div className={`bubble-terminal-box ${status}`}>
      <div className="bubble-terminal-header">
        <div className="terminal-header-title">
          <VscTerminalCmd size={13} color="#38bdf8" />
          <span className="terminal-cmd-text">$ {command}</span>
        </div>
        <div className="terminal-header-status">
          {status === 'running' && (
            <span className="status-pill running">
              <span className="pulse-dot-sm" /> 실행 중
            </span>
          )}
          {status === 'success' && (
            <span className="status-pill success">
              <VscCheck size={12} /> 성공 (code 0)
            </span>
          )}
          {status === 'failed' && (
            <span className="status-pill failed">
              <VscError size={12} /> 실패 (code {exitCode})
            </span>
          )}
        </div>
      </div>

      <div className="bubble-terminal-surface" ref={termContainerRef}></div>

      {/* AI 자가 수리 루프 발동 알림 배지 */}
      {healingAlert && (
        <div className="healing-alert-card">
          <VscRefresh size={13} className="spin-icon" color="#c084fc" />
          <span>오류 내용이 AI에게 자동 전송되었습니다. 해결책을 분석하여 자동 수리 중입니다...</span>
        </div>
      )}
    </div>
  );
}

export default function ChatWindow() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [expandedThoughts, setExpandedThoughts] = useState({});
  const [expandedDiffs, setExpandedDiffs] = useState({});
  const [appliedMap, setAppliedMap] = useState({});
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const scrollAreaRef = useRef(null);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages, expandedThoughts, expandedDiffs]);

  const toggleThought = (id) => {
    setExpandedThoughts((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleDiff = (id) => {
    setExpandedDiffs((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleApplyAll = async (msgId, actions) => {
    if (!window.pareAPI?.applyAllDiffs) return;
    try {
      await window.pareAPI.applyAllDiffs(actions);
      setAppliedMap((prev) => ({ ...prev, [msgId]: true }));
    } catch (err) {
      alert(`모두 반영 실패: ${err.message}`);
    }
  };

  useEffect(() => {
    if (window.pareAPI?.onAiHistory) {
      window.pareAPI.onAiHistory((incomingTurns) => {
        if (!incomingTurns || incomingTurns.length === 0) return;

        setMessages((prev) => {
          if (prev.length === 0) {
            return incomingTurns.map((t, idx) => ({
              id: t.id || `hist-${idx}`,
              role: t.role,
              text: t.role === 'user' ? extractUserText(t.text) : (t.text || ''),
              thoughtText: t.thoughtText || '',
              isThinking: Boolean(t.isThinking),
              time: t.time || '',
              actions: t.actions || []
            }));
          }

          const updated = [...prev];
          incomingTurns.forEach((turn, idx) => {
            const turnId = turn.id || `hist-${idx}`;
            const existingIdx = updated.findIndex((m) => m.id === turnId);

            if (existingIdx !== -1) {
              if (updated[existingIdx].role === 'assistant') {
                updated[existingIdx] = {
                  ...updated[existingIdx],
                  text: turn.text || updated[existingIdx].text,
                  thoughtText: turn.thoughtText || updated[existingIdx].thoughtText,
                  isThinking: Boolean(turn.isThinking),
                  actions: turn.actions || updated[existingIdx].actions
                };
              }
            } else {
              updated.push({
                id: turnId,
                role: turn.role,
                text: turn.role === 'user' ? extractUserText(turn.text) : (turn.text || ''),
                thoughtText: turn.thoughtText || '',
                isThinking: Boolean(turn.isThinking),
                time: turn.time || '',
                actions: turn.actions || []
              });
            }
          });

          return updated;
        });
      });
    }

    if (window.pareAPI?.onAiStream) {
      window.pareAPI.onAiStream(({ id, text, thoughtText, isThinking, actions }) => {
        setMessages((prev) => {
          const existingIndex = prev.findIndex((m) => m.id === id);

          if (existingIndex !== -1) {
            const updated = [...prev];
            updated[existingIndex] = {
              ...updated[existingIndex],
              text: text || '',
              thoughtText: thoughtText || updated[existingIndex].thoughtText || '',
              isThinking: Boolean(isThinking),
              actions: actions || updated[existingIndex].actions || []
            };
            return updated;
          } else {
            return [
              ...prev,
              {
                id: id,
                role: 'assistant',
                text: text || '',
                thoughtText: thoughtText || '',
                isThinking: Boolean(isThinking),
                actions: actions || [],
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              }
            ];
          }
        });
      });
    }

    if (window.pareAPI?.requestHistory) {
      window.pareAPI.requestHistory();
    }
  }, []);

  const handleInputChange = (e) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  };

  const handleSend = () => {
    if (!input.trim()) return;

    const currentText = input;
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '42px';
    }

    const userMsg = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: currentText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);

    if (window.pareAPI?.sendPromptToExtension) {
      window.pareAPI.sendPromptToExtension(currentText);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isValidMessage = (msg) => {
    if (msg.role === 'user') return Boolean(msg.text && msg.text.trim());
    const cleaned = sanitizeAiText(msg.text);
    const inProgress = getInProgressStatus(msg.text);
    return Boolean(msg.isThinking || msg.thoughtText || cleaned || inProgress || (msg.actions && msg.actions.length > 0));
  };

  const displayMessages = messages.filter(isValidMessage);

  return (
    <div className="chat-window-container">
      <header className="chat-header">
        <div className="chat-header-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img
            src="https://cdn.discordapp.com/attachments/1568748845825921024/1569779758231851068/logo.png?ex=6af4b2d3&is=6af36153&hm=cf91f56b97922311acd961ffaafcb6f8f7d6d5c7b230d47cde83d6347b7d6168&"
            alt="Pare AI"
            style={{ width: '16px', height: '16px', objectFit: 'contain' }}
            onError={(e) => { e.currentTarget.src = '/icon.ico'; }}
          />
          <span>Pare AI Agent</span>
          <span className="chat-badge">Terminal & Self-Healing</span>
        </div>
        <button className="icon-btn" onClick={() => setMessages([])} title="화면 대화 지우기">
          <VscClearAll size={15} />
        </button>
      </header>

      <div className="chat-messages-area" ref={scrollAreaRef}>
        {displayMessages.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#71717a', fontSize: '12px', marginTop: '40px' }}>
            요청하시면 AI가 파일 수정, 파일 내용 조회, 터미널 명령어를 자율 수행합니다.
          </div>
        ) : (
          displayMessages.map((msg) => {
            const isUser = msg.role === 'user';
            const hasThought = Boolean(msg.isThinking || msg.thoughtText);
            const isExpanded = Boolean(expandedThoughts[msg.id]);
            const cleanedText = isUser ? msg.text : sanitizeAiText(msg.text);
            const isDiffExpanded = Boolean(expandedDiffs[msg.id]);
            const isApplied = Boolean(appliedMap[msg.id]);
            const hasDiffActions = msg.actions && msg.actions.some(a => a.type === 'diff_modified' || a.type === 'created' || a.type === 'modified');
            const runCmdActions = msg.actions ? msg.actions.filter(a => a.type === 'run_command') : [];
            const inProgressStatus = !isUser ? getInProgressStatus(msg.text) : null;

            return (
              <div key={msg.id} className={`chat-message-row ${isUser ? 'user' : 'assistant'}`}>
                <div className="chat-avatar">
                  {isUser ? <VscAccount size={13} color="#60a5fa" /> : <VscSparkle size={13} color="#a78bfa" />}
                </div>
                <div className="chat-bubble-wrapper">
                  <div className="chat-bubble">
                    {!isUser && hasThought && (
                      <div className={`thought-accordion ${isExpanded ? 'open' : ''}`}>
                        <button
                          type="button"
                          className="thought-header-btn"
                          onClick={() => toggleThought(msg.id)}
                          title="생각 내용 펼치기/접기"
                        >
                          <div className="thought-header-left">
                            {msg.isThinking ? (
                              <>
                                <span className="thinking-pulse-dot" />
                                <span className="thought-status-text thinking">생각 중...</span>
                              </>
                            ) : (
                              <>
                                <VscCheck size={13} color="#4ade80" />
                                <span className="thought-status-text done">생각 완료</span>
                              </>
                            )}
                          </div>
                          <div className="thought-header-right">
                            {isExpanded ? <VscChevronDown size={13} color="#9ca3af" /> : <VscChevronRight size={13} color="#9ca3af" />}
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="thought-body-content">
                            {msg.thoughtText ? (
                              renderMultilineText(msg.thoughtText)
                            ) : (
                              <span style={{ color: '#6b7280', fontStyle: 'italic' }}>
                                생각을 정리하는 중입니다...
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {cleanedText && (
                      <div className="chat-text-content">
                        <MarkdownView content={cleanedText} />
                      </div>
                    )}

                    {inProgressStatus && (
                      <div
                        className="in-progress-badge"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          background: 'rgba(59, 130, 246, 0.1)',
                          border: '1px solid rgba(59, 130, 246, 0.25)',
                          color: '#60a5fa',
                          fontSize: '12px',
                          fontWeight: 500,
                          margin: '6px 0'
                        }}
                      >
                        <VscRefresh size={13} className="spin-icon" />
                        <span>{inProgressStatus}</span>
                      </div>
                    )}

                    {/* ★ 1. 말풍선 내부 인라인 터미널 UI */}
                    {!isUser && runCmdActions.length > 0 && (
                      <div className="inline-terminals-wrapper">
                        {runCmdActions.map((cmdAct) => (
                          <InlineBubbleTerminal
                            key={cmdAct.cmdId}
                            cmdId={cmdAct.cmdId}
                            command={cmdAct.command}
                            initialStatus={cmdAct.status}
                          />
                        ))}
                      </div>
                    )}

                    {/* 2. 파일 변경 사항 목록 */}
                    {!isUser && msg.actions && msg.actions.length > 0 && (
                      <div className="file-actions-card">
                        <div className="file-actions-header" onClick={() => toggleDiff(msg.id)} style={{ cursor: 'pointer' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <VscCheck size={13} color="#4ade80" />
                            <span>반영된 작업 ({msg.actions.length}건)</span>
                          </div>
                          {isDiffExpanded ? <VscChevronDown size={12} color="#a1a1aa" /> : <VscChevronRight size={12} color="#a1a1aa" />}
                        </div>
                        <div className="file-actions-list">
                          {msg.actions.map((act, i) => (
                            <div key={i} className="file-action-wrapper">
                              <div className={`file-action-item ${act.type}`}>
                                {act.type === 'diff_modified' && <VscDiffModified size={13} color="#34d399" />}
                                {act.type === 'created' && <VscDiffAdded size={13} color="#4ade80" />}
                                {act.type === 'modified' && <VscDiffModified size={13} color="#60a5fa" />}
                                {act.type === 'read_file' && <VscFileCode size={13} color="#c084fc" />}
                                {act.type === 'run_command' && <VscTerminalCmd size={13} color="#38bdf8" />}
                                {act.type === 'deleted' && <VscDiffRemoved size={13} color="#f87171" />}
                                
                                <span className={`action-type-badge ${act.type}`}>
                                  {act.type === 'diff_modified' && 'Diff 수정'}
                                  {act.type === 'created' && '파일 생성'}
                                  {act.type === 'modified' && '파일 수정'}
                                  {act.type === 'read_file' && '파일 조회'}
                                  {act.type === 'run_command' && 'CMD 실행'}
                                  {act.type === 'deleted' && '삭제'}
                                </span>
                                <span className="action-path">{act.path || act.command}</span>
                              </div>

                              {isDiffExpanded && act.diffBlocks && (
                                <div className="diff-detail-blocks">
                                  {act.diffBlocks.map((d, dIdx) => (
                                    <div key={dIdx} className="diff-block-row">
                                      <div className="diff-search-snippet">
                                        <span className="diff-tag del">- 기존:</span>
                                        <code>{d.search.trim().slice(0, 120)}</code>
                                      </div>
                                      <div className="diff-replace-snippet">
                                        <span className="diff-tag add">+ 변경:</span>
                                        <code>{d.replace.trim().slice(0, 120)}</code>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* [모두 반영] 일괄 저장 버튼 */}
                        {hasDiffActions && (
                          <div className="apply-all-container">
                            <button
                              className={`apply-all-btn ${isApplied ? 'applied' : ''}`}
                              onClick={() => handleApplyAll(msg.id, msg.actions)}
                              disabled={isApplied}
                            >
                              {isApplied ? (
                                <>
                                  <VscCheck size={13} color="#4ade80" />
                                  <span>모두 반영됨 (저장 완료)</span>
                                </>
                              ) : (
                                <>
                                  <VscSaveAll size={13} />
                                  <span>모두 반영 (일괄 저장)</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {msg.time && <span className="chat-time">{msg.time}</span>}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <div className="chat-input-box">
          <textarea
            ref={textareaRef}
            className="chat-textarea"
            rows="1"
            placeholder="수정할 내용을 요청하세요... (Enter: 전송 / Shift+Enter: 줄바꿈)"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
          />
          <div className="chat-input-footer">
            <span className="chat-hint">Shift + Enter로 줄내림</span>
            <button className="chat-send-btn" onClick={handleSend} disabled={!input.trim()}>
              <VscSend size={13} />
              <span>전송</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}