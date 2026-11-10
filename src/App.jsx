import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import EditorArea from './components/EditorArea';
import SolutionExplorer from './components/SolutionExplorer';
import TerminalDock from './components/TerminalDock';
import SettingsModal from './components/SettingsModal';

const isSamePath = (p1, p2) => p1 && p2 && p1.replace(/\\/g, '/').toLowerCase() === p2.replace(/\\/g, '/').toLowerCase();

export default function App() {
  const [solution, setSolution] = useState(null);
  const [openTabs, setOpenTabs] = useState([]);
  const [activePath, setActivePath] = useState(null);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [pendingDiff, setPendingDiff] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const activeTab = openTabs.find((t) => isSamePath(t.path, activePath));

  const refreshWorkspace = async () => {
    if (!window.pareAPI) return;
    const res = await window.pareAPI.getWorkspaceTree();
    if (res) setSolution(res);
  };
  // 현재 에디터에 열린 활성 파일 경로를 백엔드에 동기화
  useEffect(() => {
    if (activePath && window.pareAPI?.setActivePath) {
      window.pareAPI.setActivePath(activePath);
    }
  }, [activePath]);

  useEffect(() => {
    if (window.pareAPI?.onWorkspaceUpdated) {
      window.pareAPI.onWorkspaceUpdated((data) => {
        setSolution(data);

        if (data.actions && data.actions.length > 0) {
          data.actions.forEach((act) => {
            if (act.newContent) {
              const fullTarget = act.fullPath || `${data.rootPath}\\${act.path.replace(/\//g, '\\')}`;
              const fileName = act.path.split('/').pop();

              // ★ 이미 디스크에 즉시 저장되었으므로 isDirty: false 로 탭 동기화
              setOpenTabs((prev) => {
                const exists = prev.find((t) => isSamePath(t.path, fullTarget));
                if (!exists) {
                  return [...prev, { name: fileName, path: fullTarget, content: act.newContent, isDirty: false }];
                }
                return prev.map((t) => isSamePath(t.path, fullTarget) ? { ...t, content: act.newContent, isDirty: false } : t);
              });

              setActivePath(fullTarget);

              // 에디터 화면에 초록색 변경 줄 하이라이트 표시
              if (act.type === 'diff_modified' && act.diffBlocks) {
                setPendingDiff({
                  fullPath: fullTarget,
                  relPath: act.path,
                  diffBlocks: act.diffBlocks,
                  newContent: act.newContent,
                  timestamp: Date.now()
                });
              }
            }
          });
        }
      });
    }
    refreshWorkspace();
  }, [activePath]);

  const handleOpenFolder = async () => {
    if (!window.pareAPI) return;
    const res = await window.pareAPI.openFolder();
    if (res) setSolution(res);
  };

  const handleFileSelect = async (node) => {
    if (!window.pareAPI || node.isDirectory) return;

    const existing = openTabs.find((t) => isSamePath(t.path, node.path));
    if (existing) {
      setActivePath(node.path);
      return;
    }

    try {
      const content = await window.pareAPI.readFile(node.path);
      setOpenTabs((prev) => [...prev, { ...node, content, isDirty: false }]);
      setActivePath(node.path);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCloseTab = (e, path) => {
    e.stopPropagation();
    const filtered = openTabs.filter((t) => !isSamePath(t.path, path));
    setOpenTabs(filtered);
    if (isSamePath(activePath, path)) {
      setActivePath(filtered.length > 0 ? filtered[filtered.length - 1].path : null);
    }
  };

    // ★ 수동 저장 핸들러 (디스크에 강제 저장 후 상태바에 확인 표시)
  const [saveStatus, setSaveStatus] = useState('');

  const handleSaveActiveTab = async (targetPath, explicitContent) => {
    const filePath = targetPath || activeTab?.path || activePath;
    const contentToSave = typeof explicitContent === 'string' 
      ? explicitContent 
      : (activeTab?.content ?? '');

    if (!filePath || !window.pareAPI) return;

    try {
      await window.pareAPI.writeFile(filePath, contentToSave);
      const timeStr = new Date().toLocaleTimeString();
      const fileName = filePath.split(/[/\\]/).pop();
      setSaveStatus(`저장 완료: ${fileName} (${timeStr})`);
      setTimeout(() => setSaveStatus(''), 3000);

      // 열려있는 탭 상태 갱신 (점 표시 제거)
      setOpenTabs((prev) =>
        prev.map((t) =>
          isSamePath(t.path, filePath)
            ? { ...t, content: contentToSave, isDirty: false }
            : t
        )
      );
      refreshWorkspace();
    } catch (err) {
      alert(`[저장 실패] ${err.message}`);
    }
  };

  const handleEditorChange = (value) => {
    if (!activePath) return;
    setOpenTabs((prev) =>
      prev.map((t) => (isSamePath(t.path, activePath) ? { ...t, content: value || '', isDirty: true } : t))
    );
  };

  return (
    <div className="ide-root">
      <Header
        solution={solution}
        activeTab={activeTab}
        onOpenFolder={handleOpenFolder}
        onSave={() => handleSaveActiveTab()}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <div className="workspace-wrapper">
        <EditorArea
          openTabs={openTabs}
          activePath={activePath}
          activeTab={activeTab}
          onSelectTab={setActivePath}
          onCloseTab={handleCloseTab}
          onChangeCode={handleEditorChange}
          cursorPos={cursorPos}
          setCursorPos={setCursorPos}
          onSaveActiveTab={handleSaveActiveTab}
          pendingDiff={pendingDiff}
        />

        <SolutionExplorer
          solution={solution}
          onSelectFile={handleFileSelect}
          activePath={activePath}
          onRefresh={refreshWorkspace}
        />
      </div>

      <TerminalDock />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      <footer className="status-bar">
        <div className="status-bar-left">
          <span>준비</span>
        </div>
        <div className="status-bar-right">
          <span>Pare Engine (Live Save Mode)</span>
          <span>main</span>
        </div>
      </footer>
    </div>
  );
}