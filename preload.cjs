const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pareAPI', {
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  setActivePath: (filePath) => ipcRenderer.send('workspace:setActivePath', filePath),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', { filePath, content }),
  applyAllDiffs: (actions) => ipcRenderer.invoke('fs:applyAllDiffs', actions),
  createFile: (filePath) => ipcRenderer.invoke('fs:createFile', filePath),
  createDir: (dirPath) => ipcRenderer.invoke('fs:createDir', dirPath),
  renamePath: (oldPath, newPath) => ipcRenderer.invoke('fs:rename', { oldPath, newPath }),
  copyPath: (src, dest) => ipcRenderer.invoke('fs:copy', { src, dest }),
  deletePath: (targetPath) => ipcRenderer.invoke('fs:delete', targetPath),
  getWorkspaceTree: () => ipcRenderer.invoke('workspace:getTree'),
  openChat: () => ipcRenderer.send('window:openChat'),
  checkUpdate: () => ipcRenderer.invoke('app:checkUpdate'),
  quitAndInstall: () => ipcRenderer.send('app:quitAndInstall'),
  onUpdateStatus: (callback) => {
    ipcRenderer.removeAllListeners('app:updateStatus');
    ipcRenderer.on('app:updateStatus', (_, data) => callback(data));
  },
  checkUpdate: () => ipcRenderer.invoke('app:checkUpdate'),
  quitAndInstall: () => ipcRenderer.send('app:quitAndInstall'),
  onUpdateStatus: (callback) => {
    ipcRenderer.removeAllListeners('app:updateStatus');
    ipcRenderer.on('app:updateStatus', (_, data) => callback(data));
  },
  sendPromptToExtension: (text) => ipcRenderer.send('ai:sendPrompt', text),
  requestHistory: () => ipcRenderer.send('ai:requestHistory'),
  onWorkspaceUpdated: (callback) => {
    ipcRenderer.removeAllListeners('fs:workspaceUpdated');
    ipcRenderer.on('fs:workspaceUpdated', (_, data) => callback(data));
  },
  onAllSaved: (callback) => {
    ipcRenderer.removeAllListeners('fs:allSaved');
    ipcRenderer.on('fs:allSaved', (_, data) => callback(data));
  },
  onAiHistory: (callback) => {
    ipcRenderer.removeAllListeners('ai:history');
    ipcRenderer.on('ai:history', (_, turns) => callback(turns));
  },
  onAiStream: (callback) => {
    ipcRenderer.removeAllListeners('ai:stream');
    ipcRenderer.on('ai:stream', (_, data) => callback(data));
  },
  // 인라인 터미널 스트리밍 이벤트
  onCmdStart: (callback) => {
    ipcRenderer.removeAllListeners('ai:cmdStart');
    ipcRenderer.on('ai:cmdStart', (_, data) => callback(data));
  },
  onCmdData: (callback) => {
    ipcRenderer.on('ai:cmdData', (_, data) => callback(data));
  },
  onCmdEnd: (callback) => {
    ipcRenderer.on('ai:cmdEnd', (_, data) => callback(data));
  },
  onCmdHealing: (callback) => {
    ipcRenderer.on('ai:cmdHealing', (_, data) => callback(data));
  },
  initTerminal: () => ipcRenderer.send('terminal:init'),
  restartTerminal: () => ipcRenderer.send('terminal:restart'),
  interruptTerminal: () => ipcRenderer.send('terminal:interrupt'),
  execTerminal: (cmd) => ipcRenderer.send('terminal:exec', cmd),
  writeTerminal: (cmd) => ipcRenderer.send('terminal:exec', cmd),
  onTerminalData: (callback) => {
    ipcRenderer.removeAllListeners('terminal:data');
    ipcRenderer.on('terminal:data', (_, data) => callback(data));
  }
});