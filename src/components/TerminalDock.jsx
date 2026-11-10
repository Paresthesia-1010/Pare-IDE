import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { VscTerminalCmd, VscClearAll, VscRefresh } from 'react-icons/vsc';

export default function TerminalDock() {
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);

  const handleRestart = () => {
    if (xtermRef.current) {
      xtermRef.current.clear();
    }
    window.pareAPI?.restartTerminal();
  };

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      theme: {
        background: '#141414',
        foreground: '#cccccc',
        cursor: '#aeafad',
        selectionBackground: '#264f78'
      },
      fontFamily: 'Consolas, "Cascadia Code", monospace',
      fontSize: 12,
      lineHeight: 1.25,
      cursorBlink: true,
      convertEol: true,
      allowProposedApi: true
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();
    xtermRef.current = term;

    let lineBuffer = '';
    const history = [];
    let historyIdx = -1;

    // 한글 등 전각 문자(2칸 너비) 판별 함수 (백스페이스 시 정확한 커서 지우기용)
    const isFullWidth = (char) => {
      if (!char) return false;
      const code = char.charCodeAt(0);
      return (code >= 0x1100 && code <= 0x115f) ||
             (code >= 0x2e80 && code <= 0xa4cf) ||
             (code >= 0xac00 && code <= 0xd7a3) ||
             (code >= 0xf900 && code <= 0xfaff) ||
             (code >= 0xfe30 && code <= 0xfe6f) ||
             (code >= 0xff00 && code <= 0xff60) ||
             (code >= 0xffe0 && code <= 0xffe6);
    };

    const eraseLastChar = () => {
      if (lineBuffer.length === 0) return;
      const lastChar = lineBuffer.slice(-1);
      lineBuffer = lineBuffer.slice(0, -1);
      if (isFullWidth(lastChar)) {
        term.write('\b\b  \b\b');
      } else {
        term.write('\b \b');
      }
    };

    const clearCurrentLine = () => {
      while (lineBuffer.length > 0) {
        eraseLastChar();
      }
    };

    // ★ 복사(Ctrl+C) 및 붙여넣기(Ctrl+V) 키보드 제어
    term.attachCustomKeyEventHandler((arg) => {
      if (arg.type === 'keydown') {
        // Ctrl+C: 선택 영역이 있을 땐 클립보드 복사만 수행
        if (arg.ctrlKey && !arg.shiftKey && !arg.altKey && (arg.key === 'c' || arg.key === 'C')) {
          if (term.hasSelection()) {
            navigator.clipboard.writeText(term.getSelection());
            return false;
          }
          return true; // 선택 없으면 interrupt(실행 중단)로 통과
        }

        // Ctrl+V: 클립보드 텍스트 붙여넣기
        if (arg.ctrlKey && !arg.shiftKey && !arg.altKey && (arg.key === 'v' || arg.key === 'V')) {
          navigator.clipboard.readText().then((clipText) => {
            if (clipText) {
              const sanitized = clipText.replace(/\r?\n/g, '');
              lineBuffer += sanitized;
              term.write(sanitized);
            }
          });
          return false;
        }
      }
      return true;
    });

    // ★ 마우스 우클릭 시 붙여넣기 / 선택 영역 복사 (VS Code 터미널 방식)
    const handleContextMenu = (e) => {
      e.preventDefault();
      if (term.hasSelection()) {
        navigator.clipboard.writeText(term.getSelection());
        term.clearSelection();
      } else {
        navigator.clipboard.readText().then((clipText) => {
          if (clipText) {
            const sanitized = clipText.replace(/\r?\n/g, '');
            lineBuffer += sanitized;
            term.write(sanitized);
          }
        });
      }
    };

    const containerEl = terminalRef.current;
    containerEl?.addEventListener('contextmenu', handleContextMenu);

    // ★ 실시간 로컬 에코 & 명령어 버퍼 처리 (모든 키코드 및 엔터 완벽 대응)
    term.onData((data) => {
      const isEnter = data === '\r' || data === '\n' || data === '\r\n' || (data.length === 1 && data.charCodeAt(0) === 13);
      const isBackspace = data === '\x7f' || data === '\b' || (data.length === 1 && data.charCodeAt(0) === 8);

      if (isEnter) {
        term.write('\r\n');
        const cmdToSend = lineBuffer;
        lineBuffer = '';

        // cls / clear: 즉시 터미널 화면 지우고 프롬프트 갱신
        if (cmdToSend.trim().toLowerCase() === 'cls' || cmdToSend.trim().toLowerCase() === 'clear') {
          term.clear();
          window.pareAPI?.execTerminal('');
          return;
        }

        if (cmdToSend.trim()) {
          history.push(cmdToSend);
          historyIdx = history.length;
        }

        // 백엔드 실행 엔진으로 명령어 전송 (빈 엔터 시 프롬프트만 즉시 반환)
        window.pareAPI?.execTerminal(cmdToSend);
      } else if (isBackspace) {
        // 백스페이스
        eraseLastChar();
      } else if (data === '\x03') {
        // Ctrl+C: 실행 중인 프로세스 강제 종료(taskkill) 및 프롬프트 복귀
        lineBuffer = '';
        term.write('^C\r\n');
        window.pareAPI?.interruptTerminal();
      } else if (data === '\x1b[A') {
        // 위쪽 방향키: 이전 히스토리
        if (history.length > 0 && historyIdx > 0) {
          historyIdx--;
          clearCurrentLine();
          lineBuffer = history[historyIdx];
          term.write(lineBuffer);
        }
      } else if (data === '\x1b[B') {
        // 아래쪽 방향키: 다음 히스토리
        if (historyIdx < history.length - 1) {
          historyIdx++;
          clearCurrentLine();
          lineBuffer = history[historyIdx];
          term.write(lineBuffer);
        } else if (historyIdx === history.length - 1) {
          historyIdx = history.length;
          clearCurrentLine();
        }
      } else if (!data.startsWith('\x1b') && (data.charCodeAt(0) >= 32 || data === '\t')) {
        // ESC 제어 시퀀스를 배제한 순수 텍스트(한글, 영문, 숫자, 기호 등)만 버퍼에 추가
        lineBuffer += data;
        term.write(data);
      }
    });

    if (window.pareAPI) {
      window.pareAPI.initTerminal();
      window.pareAPI.onTerminalData((data) => {
        term.write(data);
      });
    }

    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      containerEl?.removeEventListener('contextmenu', handleContextMenu);
      term.dispose();
    };
  }, []);

  return (
    <div className="terminal-dock">
      <div className="terminal-tab-bar">
        <div className="terminal-tabs">
          <span className="terminal-tab active">
            <VscTerminalCmd size={13} color="#60a5fa" />
            명령 프롬프트 (CMD - UTF-8)
          </span>
          <span className="terminal-tab">출력</span>
          <span className="terminal-tab">오류 목록</span>
        </div>
        <div className="panel-actions">
          <button
            className="icon-btn"
            onClick={handleRestart}
            title="터미널 재시작 (먹통 복구)"
          >
            <VscRefresh size={14} />
          </button>
          <button
            className="icon-btn"
            onClick={() => xtermRef.current?.clear()}
            title="터미널 지우기"
          >
            <VscClearAll size={14} />
          </button>
        </div>
      </div>
      <div className="terminal-body" ref={terminalRef}></div>
    </div>
  );
}