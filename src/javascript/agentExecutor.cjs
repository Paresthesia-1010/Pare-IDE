// src/javascript/agentExecutor.cjs
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const runningCommands = new Map();

function normalizeContent(rawContent) {
  if (!rawContent) return '';
  let content = rawContent;
  if (content.startsWith('\r\n')) content = content.slice(2);
  else if (content.startsWith('\n')) content = content.slice(1);

  if (!content.includes('\n') && content.includes('\\n')) {
    content = content.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  }
  return content;
}

function hasUnescapedEndTag(text) {
  if (!text) return false;
  let cleaned = text.replace(/```[\s\S]*?```/g, '');
  cleaned = cleaned.replace(/`[^`\n]*`/g, '');
  return /<\/end>/i.test(cleaned);
}

// 말풍선 내부 전용 명령어 실행 및 오류 시 AI 자가 수리 전송 루프
function runBubbleCommand(cmdId, command, context) {
  const targetRoot = context.getCurrentRootPath() || process.cwd();
  let fullOutput = '';

  const proc = spawn(process.env.ComSpec || 'cmd.exe', ['/c', command], {
    cwd: targetRoot,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', LANG: 'ko_KR.UTF-8' }
  });

  runningCommands.set(cmdId, proc);

  const chatWindow = context.getChatWindow();
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.webContents.send('ai:cmdStart', { cmdId, command });
  }

  proc.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    fullOutput += text;
    const cw = context.getChatWindow();
    if (cw && !cw.isDestroyed()) {
      cw.webContents.send('ai:cmdData', { cmdId, data: text });
    }
  });

  proc.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    fullOutput += text;
    const cw = context.getChatWindow();
    if (cw && !cw.isDestroyed()) {
      cw.webContents.send('ai:cmdData', { cmdId, data: text, isError: true });
    }
  });

  proc.on('close', (code) => {
    runningCommands.delete(cmdId);
    const success = (code === 0);
    const cw = context.getChatWindow();

    if (cw && !cw.isDestroyed()) {
      cw.webContents.send('ai:cmdEnd', { cmdId, command, code, success });
    }

    // 오류 발생 시 AI에게 자동으로 오류 로그 전송 (Self-Healing Loop)
    if (!success) {
      console.log(`[Pare Agent] 명령어 실패 (코드 ${code}). AI에게 자가 복구 요청 전송.`);
      
      const errorPrompt = `[명령어 실행 오류 발생 - 자동 복구 요청]
실행한 명령어: ${command}
종료 코드: ${code}
출력된 오류 로그:
${fullOutput.slice(-1500)}

위 오류를 분석하고 문제를 해결하기 위한 수정(Diff) 또는 올바른 해결 명령어를 제시하여 실행하세요.`;

      context.broadcastSse({ type: 'PROMPT', text: errorPrompt });

      if (cw && !cw.isDestroyed()) {
        cw.webContents.send('ai:cmdHealing', { cmdId, command, code });
      }
    }
  });
}

function executeAiCommands(text, rootPath, context) {
  const targetRoot = rootPath || process.cwd();
  const actions = [];

  // 1. <read_file> 파일 내용 조회 자동응답
  const readRegex = /<read_file([^>]*)>([\s\S]*?)<\/read_file>|<read_file([^>]*)\/>/gi;
  let rMatch;
  while ((rMatch = readRegex.exec(text)) !== null) {
    const raw = `${rMatch[1] || ''} ${rMatch[2] || ''} ${rMatch[3] || ''}`.trim();
    const fileMatch = raw.match(/(?:path|filename)=["']([^"']+)["']/i) ||
                      raw.match(/"(?:filename|path)"\s*:\s*"([^"]+)"/i) ||
                      [null, raw.replace(/<[^>]+>/g, '').trim()];
    const targetFile = fileMatch[1];

    if (targetFile) {
      const relPath = targetFile.replace(/^[/\\]+/, '').replace(/^\.[/\\]+/, '');
      const fullPath = path.resolve(targetRoot, relPath);

      if (fs.existsSync(fullPath)) {
        const fileContent = fs.readFileSync(fullPath, 'utf8');
        actions.push({ type: 'read_file', path: relPath, success: true });

        context.broadcastSse({
          type: 'PROMPT',
          text: `[파일 내용 응답: ${relPath}]\n${fileContent}\n\n위 파일 내용을 바탕으로 요청된 수정을 Diff 형식으로 진행하세요.`
        });
        console.log(`[Pare Agent] 파일 본문 전체 전송 완료: ${relPath}`);
      }
    }
  }

  // 2. <run_command> 말풍선 인라인 터미널 실행
  const cmdRegex = /<run_command\s*(?:command=["']([^"']+)["'])?[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/run_command>/gi;
  let cmdMatch;
  while ((cmdMatch = cmdRegex.exec(text)) !== null) {
    const command = (cmdMatch[1] || cmdMatch[2] || '').trim();
    if (command) {
      const cmdId = `cmd-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      actions.push({ type: 'run_command', cmdId, command, status: 'running' });
      setTimeout(() => runBubbleCommand(cmdId, command, context), 100);
    }
  }

  // 3. <edit_file> Search/Replace Diff
  const editRegex = /<edit_file\s+[^>]*(?:path|filename)=["']([^"']+)["'][^>]*>([\s\S]*?)<\/edit_file>/gi;
  let editMatch;
  while ((editMatch = editRegex.exec(text)) !== null) {
    let relPath = editMatch[1].trim().replace(/^[/\\]+/, '').replace(/^\.[/\\]+/, '');
    const fullPath = path.resolve(targetRoot, relPath);
    if (!fs.existsSync(fullPath)) continue;

    const blockContent = editMatch[2];
    const diffBlocks = [];
    const diffRegex = /<<<<<<< SEARCH\s*\r?\n([\s\S]*?)\r?\n=======\s*\r?\n([\s\S]*?)\r?\n>>>>>>> REPLACE/gi;
    let dMatch;

    let originalCode = fs.readFileSync(fullPath, 'utf8');
    let modifiedCode = originalCode;
    let appliedCount = 0;

    while ((dMatch = diffRegex.exec(blockContent)) !== null) {
      const searchStr = normalizeContent(dMatch[1]);
      const replaceStr = normalizeContent(dMatch[2]);

      const normOriginal = modifiedCode.replace(/\r\n/g, '\n');
      const normSearch = searchStr.replace(/\r\n/g, '\n');

      let idx = normOriginal.indexOf(normSearch);
      if (idx === -1) {
        const trimmedSearch = normSearch.trim();
        idx = normOriginal.indexOf(trimmedSearch);
        if (idx !== -1) {
          modifiedCode = normOriginal.slice(0, idx) + replaceStr.replace(/\r\n/g, '\n') + normOriginal.slice(idx + trimmedSearch.length);
          appliedCount++;
          diffBlocks.push({ search: trimmedSearch, replace: replaceStr });
        }
      } else {
        modifiedCode = normOriginal.slice(0, idx) + replaceStr.replace(/\r\n/g, '\n') + normOriginal.slice(idx + normSearch.length);
        appliedCount++;
        diffBlocks.push({ search: normSearch, replace: replaceStr });
      }
    }

    if (appliedCount > 0) {
      try {
        fs.writeFileSync(fullPath, modifiedCode, 'utf8');
        console.log(`[Pare Agent] 디스크 즉시 저장 완료: ${fullPath}`);
      } catch (err) {
        console.error(`[Pare Agent] 디스크 저장 실패: ${fullPath}`, err);
      }

      actions.push({
        type: 'diff_modified',
        path: relPath,
        fullPath: fullPath,
        diffBlocks: diffBlocks,
        newContent: modifiedCode,
        success: true
      });
    }
  }

  // 4. <write_file> 새 파일 생성
  const writeRegex = /<write_file\s+[^>]*(?:path|filename)=["']([^"']+)["'][^>]*>([\s\S]*?)<\/write_file>/gi;
  let match;
  while ((match = writeRegex.exec(text)) !== null) {
    let relPath = match[1].trim().replace(/^[/\\]+/, '').replace(/^\.[/\\]+/, '');
    const content = normalizeContent(match[2]);
    const fullPath = path.resolve(targetRoot, relPath);
    const isModifying = fs.existsSync(fullPath);

    try {
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content, 'utf8');
      actions.push({
        type: isModifying ? 'modified' : 'created',
        path: relPath,
        fullPath: fullPath,
        newContent: content,
        success: true
      });
    } catch (err) {
      actions.push({ type: 'error', path: relPath, error: err.message });
    }
  }

  // 5. <delete_file> 파일 삭제
  const deleteRegex = /<delete_file\s+[^>]*(?:path|filename)=["']([^"']+)["'][^>]*\s*(?:\/?>|>.*?<\/delete_file>)/gi;
  while ((match = deleteRegex.exec(text)) !== null) {
    let relPath = match[1].trim().replace(/^[/\\]+/, '').replace(/^\.[/\\]+/, '');
    const fullPath = path.resolve(targetRoot, relPath);
    try {
      if (fs.existsSync(fullPath)) {
        fs.rmSync(fullPath, { recursive: true, force: true });
        actions.push({ type: 'deleted', path: relPath, fullPath: fullPath, success: true });
      }
    } catch (err) {
      actions.push({ type: 'error', path: relPath, error: err.message });
    }
  }

  // 6. <next_turn> 자율 루프 예약
  const nextTurnRegex = /<next_turn>([\s\S]*?)<\/next_turn>/gi;
  let nextMatch;
  while ((nextMatch = nextTurnRegex.exec(text)) !== null) {
    const nextPrompt = nextMatch[1].trim();
    if (nextPrompt) {
      actions.push({
        type: 'next_turn',
        prompt: nextPrompt
      });
    }
  }

  return actions;
}

module.exports = {
  executeAiCommands,
  runBubbleCommand,
  hasUnescapedEndTag,
  normalizeContent
};