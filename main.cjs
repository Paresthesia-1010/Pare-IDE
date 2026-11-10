const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');
const { initAiServer } = require('./src/javascript/aiServer.cjs');
const { registerPromptHandler } = require('./src/javascript/promptHandler.cjs');

// 자동 업데이트 설정
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function sendUpdateStatus(status, data = {}) {
  const payload = { status, ...data };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:updateStatus', payload);
  }
}

autoUpdater.on('checking-for-update', () => {
  sendUpdateStatus('checking');
});

autoUpdater.on('update-available', (info) => {
  sendUpdateStatus('available', { version: info.version, releaseNotes: info.releaseNotes });
});

autoUpdater.on('update-not-available', (info) => {
  sendUpdateStatus('not-available', { version: info.version });
});

autoUpdater.on('download-progress', (progressObj) => {
  sendUpdateStatus('downloading', {
    percent: Math.round(progressObj.percent),
    bytesPerSecond: progressObj.bytesPerSecond,
    transferred: progressObj.transferred,
    total: progressObj.total
  });
});

autoUpdater.on('update-downloaded', (info) => {
  sendUpdateStatus('downloaded', { version: info.version });
});

autoUpdater.on('error', (err) => {
  sendUpdateStatus('error', { error: err.message });
});

ipcMain.handle('app:checkUpdate', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, updateInfo: result?.updateInfo };
  } catch (err) {
    sendUpdateStatus('error', { error: err.message });
    return { success: false, error: err.message };
  }
});

ipcMain.on('app:quitAndInstall', () => {
  autoUpdater.quitAndInstall();
});

// 자동 업데이트 설정
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function sendUpdateStatus(status, data = {}) {
  const payload = { status, ...data };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:updateStatus', payload);
  }
}

autoUpdater.on('checking-for-update', () => {
  sendUpdateStatus('checking');
});

autoUpdater.on('update-available', (info) => {
  sendUpdateStatus('available', { version: info.version, releaseNotes: info.releaseNotes });
});

autoUpdater.on('update-not-available', (info) => {
  sendUpdateStatus('not-available', { version: info.version });
});

autoUpdater.on('download-progress', (progressObj) => {
  sendUpdateStatus('downloading', {
    percent: Math.round(progressObj.percent),
    bytesPerSecond: progressObj.bytesPerSecond,
    transferred: progressObj.transferred,
    total: progressObj.total
  });
});

autoUpdater.on('update-downloaded', (info) => {
  sendUpdateStatus('downloaded', { version: info.version });
});

autoUpdater.on('error', (err) => {
  sendUpdateStatus('error', { error: err.message });
});

const agentContext = {
  getMainWindow: () => mainWindow,
  getChatWindow: () => chatWindow,
  getCurrentRootPath: () => currentRootPath,
  getActiveFilePath: () => activeFilePath,
  readDirTree,
  getProjectFileList
};

Menu.setApplicationMenu(null);

let mainWindow;
let chatWindow = null;
let ptyProcess = null;
let sseClients = [];
let cachedTurns = [];
let currentRootPath = process.cwd();
let activeFilePath = null; // 현재 에디터에 열린 파일 경로 저장용
let executedTurnIds = new Set();
let runningCommands = new Map();

function getProjectFileList(dir, baseDir = dir) {
  try {
    let result = [];
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (['node_modules', '.git', 'dist', '.vscode', 'release', 'pare-extension', '.vs'].includes(item.name)) continue;
      const fullPath = path.join(dir, item.name);
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      if (item.isDirectory()) {
        result.push(`${relPath}/`);
        result = result.concat(getProjectFileList(fullPath, baseDir));
      } else {
        result.push(relPath);
      }
    }
    return result;
  } catch (e) {
    return [];
  }
}

// 기존 getProjectFileList 함수 바로 밑에 추가
function isProtectedPath(relPath) {
  if (!relPath || relPath === '.' || relPath === '') return true;
  const protectedItems = ['node_modules', '.git', 'dist', '.vscode', 'release', 'pare-extension', '.vs'];
  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const rootItem = normalized.split('/')[0];
  return protectedItems.includes(rootItem);
}

function hasUnescapedEndTag(text) {
  if (!text) return false;
  let cleaned = text.replace(/```[\s\S]*?```/g, '');
  cleaned = cleaned.replace(/`[^`\n]*`/g, '');
  return /<\/end>/i.test(cleaned);
}

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

// ★ 말풍선 내부 전용 명령어 실행 및 오류 시 AI 자가 수리 전송 루프
function runBubbleCommand(cmdId, command) {
  const targetRoot = currentRootPath || process.cwd();
  let fullOutput = '';

  const proc = spawn(process.env.ComSpec || 'cmd.exe', ['/c', command], {
    cwd: targetRoot,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', LANG: 'ko_KR.UTF-8' }
  });

  runningCommands.set(cmdId, proc);

  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.webContents.send('ai:cmdStart', { cmdId, command });
  }

  proc.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    fullOutput += text;
    if (chatWindow && !chatWindow.isDestroyed()) {
      chatWindow.webContents.send('ai:cmdData', { cmdId, data: text });
    }
  });

  proc.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    fullOutput += text;
    if (chatWindow && !chatWindow.isDestroyed()) {
      chatWindow.webContents.send('ai:cmdData', { cmdId, data: text, isError: true });
    }
  });

  proc.on('close', (code) => {
    runningCommands.delete(cmdId);
    const success = (code === 0);

    if (chatWindow && !chatWindow.isDestroyed()) {
      chatWindow.webContents.send('ai:cmdEnd', { cmdId, command, code, success });
    }

    // ★ 오류 발생 시 AI에게 자동으로 오류 로그 전송 (Self-Healing Loop)
    if (!success) {
      console.log(`[Pare Agent] 명령어 실패 (코드 ${code}). AI에게 자가 복구 요청 전송.`);
      
      const errorPrompt = `[명령어 실행 오류 발생 - 자동 복구 요청]
실행한 명령어: ${command}
종료 코드: ${code}
출력된 오류 로그:
${fullOutput.slice(-1500)}

위 오류를 분석하고 문제를 해결하기 위한 수정(Diff) 또는 올바른 해결 명령어를 제시하여 실행하세요.`;

      const payload = JSON.stringify({ type: 'PROMPT', text: errorPrompt });
      sseClients.forEach(res => res.write(`data: ${payload}\n\n`));

      if (chatWindow && !chatWindow.isDestroyed()) {
        chatWindow.webContents.send('ai:cmdHealing', { cmdId, command, code });
      }
    }
  });
}


const { server } = initAiServer(agentContext);
registerPromptHandler(agentContext);

// 사용자가 프롬프트를 보낼 때 현재 열린 파일의 실제 소스코드를 자동 동봉
registerPromptHandler(agentContext);

// 에디터에서 선택된 활성 파일 경로 수신 리스너
ipcMain.on('workspace:setActivePath', (_, filePath) => {
  activeFilePath = filePath;
});

function getAppIcon() {
  const icoPath = path.join(__dirname, 'public', 'icon.ico');
  if (fs.existsSync(icoPath)) return icoPath;
  const pngPath = path.join(__dirname, 'public', 'logo.png');
  if (fs.existsSync(pngPath)) return pngPath;
  return undefined;
}

function createWindow() {
  const appIcon = getAppIcon();
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1000,
    minHeight: 650,
    backgroundColor: '#1b1b1c',
    autoHideMenuBar: true,
    title: 'Pare IDE',
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.removeMenu();
  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
    // 패키징된 실행 파일일 경우 앱 시작 4초 후 자동 업데이트 검사 실행
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 4000);
  }
}

function openChatWindow() {
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.focus();
    return;
  }

  const appIcon = getAppIcon();
  chatWindow = new BrowserWindow({
    width: 580,
    height: 820,
    minWidth: 420,
    minHeight: 520,
    title: 'Pare AI Assistant',
    backgroundColor: '#181818',
    autoHideMenuBar: true,
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  chatWindow.removeMenu();
  const isDev = !app.isPackaged;
  if (isDev) {
    chatWindow.loadURL('http://localhost:5173/#chat');
  } else {
    chatWindow.loadFile(path.join(__dirname, 'dist', 'index.html'), { hash: 'chat' });
  }

  chatWindow.on('closed', () => { chatWindow = null; });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (ptyProcess) ptyProcess.kill();
    server.close();
    app.quit();
  }
});

function readDirTree(dirPath, maxDepth = 4, depth = 0) {
  if (depth > maxDepth) return [];
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    return items
      .filter(item => !['node_modules', '.git', 'dist', '.vscode', 'release', 'pare-extension', '.vs'].includes(item.name))
      .map(item => {
        const fullPath = path.join(dirPath, item.name);
        return {
          name: item.name,
          path: fullPath,
          isDirectory: item.isDirectory(),
          children: item.isDirectory() ? readDirTree(fullPath, maxDepth, depth + 1) : null
        };
      })
      .sort((a, b) => (b.isDirectory - a.isDirectory) || a.name.localeCompare(b.name));
  } catch (err) {
    return [];
  }
}

ipcMain.handle('dialog:openFolder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (canceled || filePaths.length === 0) return null;
  currentRootPath = filePaths[0];
  const tree = readDirTree(currentRootPath);

  // 하단 CMD 터미널도 열린 폴더로 즉시 디렉터리 변경
  if (ptyProcess && ptyProcess.stdin) {
    ptyProcess.stdin.write(`cd /d "${currentRootPath}"\r\n`);
  }

  return { rootPath: currentRootPath, name: path.basename(currentRootPath), tree };
});

ipcMain.handle('fs:readFile', async (_, filePath) => {
  return fs.readFileSync(filePath, 'utf8');
});

// ★ 수동 저장 IPC (어떤 형태로 인자가 넘어와도 무조건 디스크에 저장)
ipcMain.handle('fs:writeFile', async (_, arg1, arg2) => {
  let filePath, content;
  if (typeof arg1 === 'object' && arg1 !== null) {
    filePath = arg1.filePath;
    content = arg1.content;
  } else {
    filePath = arg1;
    content = arg2;
  }

  if (!filePath) {
    console.error('[Pare IDE] 저장 실패: 파일 경로가 없습니다.');
    return false;
  }

  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content ?? '', 'utf8');
    console.log(`[Pare IDE] ★ 수동 디스크 저장 완료: ${filePath} (${content?.length || 0} bytes)`);
    return true;
  } catch (err) {
    console.error('[Pare IDE] 디스크 쓰기 오류:', err);
    throw new Error('디스크 저장 실패: ' + err.message);
  }
});

// [모두 반영] 일괄 저장 IPC
ipcMain.handle('fs:applyAllDiffs', async (_, actions) => {
  if (!actions || actions.length === 0) return false;
  const targetRoot = currentRootPath || process.cwd();

  actions.forEach((act) => {
    if ((act.type === 'diff_modified' || act.type === 'modified' || act.type === 'created') && act.newContent) {
      const fullPath = act.fullPath || path.resolve(targetRoot, act.path);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, act.newContent, 'utf8');
      console.log(`[Pare IDE] 일괄 저장 완료: ${fullPath}`);
    }
  });

  if (mainWindow && !mainWindow.isDestroyed()) {
    const updatedTree = readDirTree(currentRootPath);
    mainWindow.webContents.send('fs:allSaved', {
      rootPath: currentRootPath,
      tree: updatedTree,
      actions: actions
    });
  }

  return true;
});

ipcMain.handle('fs:createFile', async (_, targetPath) => {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, '', 'utf8');
  return true;
});

ipcMain.handle('fs:createDir', async (_, targetPath) => {
  fs.mkdirSync(targetPath, { recursive: true });
  return true;
});

ipcMain.handle('fs:rename', async (_, { oldPath, newPath }) => {
  fs.renameSync(oldPath, newPath);
  return true;
});

ipcMain.handle('fs:copy', async (_, { src, dest }) => {
  if (!src || !dest) return false;
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(src, dest, { recursive: true, force: true });
    return true;
  } catch (err) {
    console.error('[Pare IDE] 복사 실패:', err);
    throw err;
  }
});

ipcMain.handle('fs:delete', async (_, arg) => {
  // 프론트에서 path 문자열로 넘기든, { targetPath } / { path } 객체로 넘기든 모두 대응
  const targetPath = (typeof arg === 'object' && arg !== null) ? (arg.targetPath || arg.path) : arg;

  if (!targetPath) {
    console.error('[Pare IDE] 삭제 실패: 대상 경로가 없습니다.');
    return false;
  }

  const rel = path.relative(currentRootPath, targetPath);

  if (!rel || rel === '.' || rel.startsWith('..')) {
    throw new Error('프로젝트 루트 및 상위 경로는 삭제할 수 없습니다.');
  }

  if (isProtectedPath(rel)) {
    throw new Error('보호된 파일/폴더는 삭제할 수 없습니다.');
  }

  try {
    if (fs.existsSync(targetPath)) {
      fs.rmSync(targetPath, { recursive: true, force: true });
      console.log(`[Pare IDE] 디스크 삭제 완료: ${targetPath}`);
    }

    // 삭제 후 파일 트리 즉시 갱신
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('fs:workspaceUpdated', {
        rootPath: currentRootPath,
        tree: readDirTree(currentRootPath),
        actions: [{ type: 'deleted', path: rel, fullPath: targetPath, success: true }]
      });
    }

    return true;
  } catch (err) {
    console.error('[Pare IDE] 삭제 오류:', err);
    throw err;
  }
});

ipcMain.handle('workspace:getTree', async () => {
  if (!currentRootPath) return null;
  return { rootPath: currentRootPath, name: path.basename(currentRootPath), tree: readDirTree(currentRootPath) };
});

ipcMain.on('window:openChat', () => {
  openChatWindow();
});

let currentTerminalDir = process.cwd();
let activeTerminalProc = null;

function sendToTerminal(win, text) {
  if (win && !win.isDestroyed()) {
    win.send('terminal:data', text);
  }
}

function getTerminalPrompt() {
  return `${currentTerminalDir}> `;
}

ipcMain.on('terminal:init', (event) => {
  currentTerminalDir = currentRootPath || process.cwd();
  if (activeTerminalProc) {
    try { activeTerminalProc.kill(); } catch (e) {}
    activeTerminalProc = null;
  }
  // 초기 윈도우 배너 및 프롬프트 출력
  const banner = 'Microsoft Windows [Version 10.0.19045.6466]\r\n(c) Microsoft Corporation. All rights reserved.\r\n\r\n';
  sendToTerminal(event.sender, banner + getTerminalPrompt());
});

ipcMain.on('terminal:restart', (event) => {
  if (activeTerminalProc) {
    try {
      spawn('taskkill', ['/F', '/T', '/PID', activeTerminalProc.pid.toString()], { windowsHide: true });
    } catch (e) {}
    activeTerminalProc = null;
  }
  currentTerminalDir = currentRootPath || process.cwd();
  sendToTerminal(event.sender, '\r\n' + getTerminalPrompt());
});

let activeReplProc = null;

ipcMain.on('terminal:interrupt', (event) => {
  // 실행 중인 REPL(python, node) 또는 일반 작업 강제 종료
  if (activeReplProc && activeReplProc.pid) {
    try { spawn('taskkill', ['/F', '/T', '/PID', activeReplProc.pid.toString()], { windowsHide: true }); } catch (e) {}
    activeReplProc = null;
  }
  if (activeTerminalProc && activeTerminalProc.pid) {
    try { spawn('taskkill', ['/F', '/T', '/PID', activeTerminalProc.pid.toString()], { windowsHide: true }); } catch (e) {}
    activeTerminalProc = null;
  }
  sendToTerminal(event.sender, '\r\n' + getTerminalPrompt());
});

// ★ 실시간 명령어 및 대화형 REPL(Python, Node) 지원 엔진
ipcMain.on('terminal:exec', (event, rawCommand) => {
  const command = (rawCommand || '').trim();

  // 1. 만약 현재 Python이나 Node REPL 세션 내부라면 입력을 해당 REPL stdin으로 전달
  if (activeReplProc && activeReplProc.stdin) {
    if (command === 'exit()' || command === 'exit' || command === '.exit') {
      try { activeReplProc.kill(); } catch (e) {}
      activeReplProc = null;
      sendToTerminal(event.sender, '\r\n' + getTerminalPrompt());
      return;
    }
    activeReplProc.stdin.write(rawCommand + '\n');
    return;
  }

  // 2. 빈 엔터
  if (!command) {
    sendToTerminal(event.sender, getTerminalPrompt());
    return;
  }

  // 3. cd 디렉터리 이동 처리
  const cdMatch = command.match(/^cd(?:\s*\/d)?\s*(.*)$/i);
  if (cdMatch) {
    const target = cdMatch[1].trim().replace(/^["']|["']$/g, '');
    if (!target) {
      sendToTerminal(event.sender, currentTerminalDir + '\r\n\r\n' + getTerminalPrompt());
      return;
    }
    const resolved = path.resolve(currentTerminalDir, target);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      currentTerminalDir = resolved;
      sendToTerminal(event.sender, getTerminalPrompt());
    } else {
      sendToTerminal(event.sender, `지정된 경로를 찾을 수 없습니다.\r\n\r\n` + getTerminalPrompt());
    }
    return;
  }

  // 4. python / py 단독 실행 시 대화형 REPL 진입
  if (command === 'python' || command === 'py') {
    const pyExe = command === 'py' ? 'py.exe' : 'python.exe';
    const pyProc = spawn(pyExe, ['-i', '-q'], {
      cwd: currentTerminalDir,
      env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' }
    });

    activeReplProc = pyProc;

    pyProc.stdout.on('data', (d) => sendToTerminal(event.sender, d.toString('utf8')));
    pyProc.stderr.on('data', (d) => sendToTerminal(event.sender, d.toString('utf8')));
    pyProc.on('close', () => {
      activeReplProc = null;
      sendToTerminal(event.sender, '\r\n' + getTerminalPrompt());
    });

    sendToTerminal(event.sender, '>>> ');
    return;
  }

  // 5. node 단독 실행 시 대화형 REPL 진입
  if (command === 'node') {
    const nodeProc = spawn('node.exe', ['-i'], {
      cwd: currentTerminalDir,
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });

    activeReplProc = nodeProc;

    nodeProc.stdout.on('data', (d) => sendToTerminal(event.sender, d.toString('utf8')));
    nodeProc.stderr.on('data', (d) => sendToTerminal(event.sender, d.toString('utf8')));
    nodeProc.on('close', () => {
      activeReplProc = null;
      sendToTerminal(event.sender, '\r\n' + getTerminalPrompt());
    });

    sendToTerminal(event.sender, '> ');
    return;
  }

  // 6. 일반 명령어 실행 (help, dir, kk, git, python script.py, node app.js 등 UTF-8 완벽 보장)
  const proc = spawn('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-Command',
    `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${command}`
  ], {
    cwd: currentTerminalDir,
    windowsHide: true,
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8'
    }
  });

  activeTerminalProc = proc;

  proc.stdout.on('data', (chunk) => {
    sendToTerminal(event.sender, chunk.toString('utf8'));
  });

  proc.stderr.on('data', (chunk) => {
    sendToTerminal(event.sender, chunk.toString('utf8'));
  });

  proc.on('close', () => {
    activeTerminalProc = null;
    sendToTerminal(event.sender, '\r\n' + getTerminalPrompt());
  });

  proc.on('error', (err) => {
    activeTerminalProc = null;
    sendToTerminal(event.sender, `\r\n명령 실행 오류: ${err.message}\r\n` + getTerminalPrompt());
  });
});

