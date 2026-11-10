import React, { useState, useRef, useEffect } from 'react';
import ContextMenu from './ContextMenu';
import {
  VscFolder,
  VscFile,
  VscChevronRight,
  VscChevronDown,
  VscRefresh,
  VscCollapseAll,
  VscNewFile,
  VscNewFolder
} from 'react-icons/vsc';

function TreeNode({
  node,
  onSelect,
  activePath,
  selectedPaths,
  depth = 0,
  onContextMenu,
  onDragStartNode,
  onDropOnNode
}) {
  const [isOpen, setIsOpen] = useState(depth === 0);
  const [isDragOver, setIsDragOver] = useState(false);

  const isSelected = selectedPaths.has(node.path) || (selectedPaths.size === 0 && activePath === node.path);

  const handleClick = (e) => {
    e.stopPropagation();
    onSelect(node, e);
    if (node.isDirectory && !e.ctrlKey && !e.metaKey) {
      setIsOpen(!isOpen);
    }
  };

  const handleDragStart = (e) => {
    e.stopPropagation();
    e.dataTransfer.setData('text/plain', node.path);
    e.dataTransfer.effectAllowed = 'move';
    onDragStartNode(node);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    onDropOnNode(node);
  };

  if (node.isDirectory) {
    return (
      <div>
        <div
          data-tree-path={node.path}
          className={`tree-row ${isSelected ? 'selected' : ''}`}
          style={{
            paddingLeft: `${depth * 14 + 8}px`,
            backgroundColor: isDragOver ? 'rgba(56, 189, 248, 0.25)' : undefined,
            outline: isDragOver ? '1px dashed #38bdf8' : 'none'
          }}
          draggable
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleClick}
          onContextMenu={(e) => onContextMenu(e, node)}
        >
          {isOpen ? <VscChevronDown size={13} /> : <VscChevronRight size={13} />}
          <VscFolder size={14} color="#dcb67a" />
          <span className="node-label">{node.name}</span>
        </div>
        {isOpen && node.children && (
          <div>
            {node.children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                onSelect={onSelect}
                activePath={activePath}
                selectedPaths={selectedPaths}
                depth={depth + 1}
                onContextMenu={onContextMenu}
                onDragStartNode={onDragStartNode}
                onDropOnNode={onDropOnNode}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      data-tree-path={node.path}
      className={`tree-row ${isSelected ? 'selected' : ''}`}
      style={{
        paddingLeft: `${depth * 14 + 20}px`,
        backgroundColor: isDragOver ? 'rgba(56, 189, 248, 0.25)' : undefined,
        outline: isDragOver ? '1px dashed #38bdf8' : 'none'
      }}
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      onContextMenu={(e) => onContextMenu(e, node)}
    >
      <VscFile size={13} color={isSelected ? '#569cd6' : '#9cdcfe'} />
      <span className="node-label">{node.name}</span>
    </div>
  );
}

function ExplorerModal({ modal, onClose, onSubmit }) {
  const inputRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const len = inputRef.current.value.length;
        inputRef.current.setSelectionRange(len, len);
      }
    }, 30);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const val = inputRef.current ? inputRef.current.value.trim() : '';
    if (!val) return;
    onSubmit(val);
  };

  return (
    <div className="ide-modal-backdrop" onClick={onClose}>
      <div className="ide-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="ide-modal-title">
          {modal.type === 'new_file' && '새 파일 생성'}
          {modal.type === 'new_folder' && '새 폴더 생성'}
          {modal.type === 'rename' && '이름 바꾸기'}
        </div>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            className="ide-modal-input"
            defaultValue={modal.inputVal || ''}
            placeholder="이름을 입력하세요..."
            autoFocus
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'Escape') onClose();
            }}
          />
          <div className="ide-modal-actions">
            <button type="button" className="vs-btn" onClick={onClose}>취소</button>
            <button type="submit" className="vs-btn primary">확인</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SolutionExplorer({ solution, onSelectFile, activePath, onRefresh }) {
  const [contextMenu, setContextMenu] = useState(null);
  const [modal, setModal] = useState(null);
  const [clipboard, setClipboard] = useState(null); // { nodes: [...] }
  const [selectedPaths, setSelectedPaths] = useState(new Set());
  const [selectionBox, setSelectionBox] = useState(null);

  const viewportRef = useRef(null);
  const isSelectingRef = useRef(false);
  const dragStartPosRef = useRef({ x: 0, y: 0 });
  const draggedNodesRef = useRef([]);

  // 경로로 노드 검색
  const findNodeByPath = (nodes, targetPath) => {
    if (!nodes) return null;
    for (const item of nodes) {
      if (item.path === targetPath) return item;
      if (item.children) {
        const found = findNodeByPath(item.children, targetPath);
        if (found) return found;
      }
    }
    return null;
  };

  const getParentDir = (filePath) => {
    const idx = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    return idx > -1 ? filePath.substring(0, idx) : solution?.rootPath;
  };

  // 선택된 노드 객체 목록 반환
  const getSelectedNodes = () => {
    const nodes = [];
    selectedPaths.forEach((p) => {
      const node = findNodeByPath(solution?.tree, p);
      if (node) nodes.push(node);
    });
    return nodes;
  };

  const handleSelectNode = (node, e) => {
    if (e.ctrlKey || e.metaKey) {
      setSelectedPaths((prev) => {
        const next = new Set(prev);
        if (next.has(node.path)) next.delete(node.path);
        else next.add(node.path);
        return next;
      });
    } else {
      setSelectedPaths(new Set([node.path]));
      onSelectFile(node);
    }
  };

  // 복사 실행 로직 (다중 선택 대응)
  const handleCopyNodes = (nodesToCopy) => {
    if (!nodesToCopy || nodesToCopy.length === 0) return;
    setClipboard({ nodes: nodesToCopy });
  };

  // 붙여넣기 실행 로직 (다중 복사 대응)
  const handlePasteNodes = async (targetNode) => {
    if (!clipboard?.nodes || clipboard.nodes.length === 0) return;
    const targetDir = targetNode
      ? (targetNode.isDirectory ? targetNode.path : getParentDir(targetNode.path))
      : solution?.rootPath;

    if (!targetDir) return;
    const sep = targetDir.includes('/') ? '/' : '\\';

    try {
      for (const source of clipboard.nodes) {
        let destName = source.name;
        let destPath = `${targetDir}${sep}${destName}`;

        if (destPath === source.path) {
          const dotIndex = destName.lastIndexOf('.');
          if (!source.isDirectory && dotIndex > 0) {
            const base = destName.substring(0, dotIndex);
            const ext = destName.substring(dotIndex);
            destName = `${base} - 복사본${ext}`;
          } else {
            destName = `${destName} - 복사본`;
          }
          destPath = `${targetDir}${sep}${destName}`;
        }
        await window.pareAPI?.copyPath(source.path, destPath);
      }
      onRefresh();
    } catch (err) {
      alert(`붙여넣기 실패: ${err.message}`);
    }
  };

  // 드래그 시작 (다중 항목 드래그 지원)
  const handleDragStartNode = (node) => {
    if (selectedPaths.has(node.path)) {
      draggedNodesRef.current = getSelectedNodes();
    } else {
      draggedNodesRef.current = [node];
      setSelectedPaths(new Set([node.path]));
    }
  };

  // 드롭 이동 처리 (선택된 노드들 일괄 이동)
  const handleDropOnNode = async (targetNode) => {
    const sources = draggedNodesRef.current;
    draggedNodesRef.current = [];
    if (!sources || sources.length === 0) return;

    const targetDir = targetNode
      ? (targetNode.isDirectory ? targetNode.path : getParentDir(targetNode.path))
      : solution?.rootPath;

    if (!targetDir) return;
    const sep = targetDir.includes('/') ? '/' : '\\';

    try {
      for (const source of sources) {
        if (source.path === targetNode?.path) continue;
        const normSource = source.path.replace(/\\/g, '/').toLowerCase();
        const normTarget = targetDir.replace(/\\/g, '/').toLowerCase();
        if (normTarget.startsWith(normSource + '/') || normTarget === normSource) {
          continue;
        }

        const newPath = `${targetDir}${sep}${source.name}`;
        if (newPath !== source.path) {
          await window.pareAPI?.renamePath(source.path, newPath);
        }
      }
      onRefresh();
    } catch (err) {
      alert(`항목 이동 실패: ${err.message}`);
    }
  };

  // 빈 곳 마우스 다운 -> 영역 드래그 선택 시작
  const handleViewportMouseDown = (e) => {
    if (e.button !== 0) return; // 좌클릭만 처리
    if (e.target.closest('.tree-row')) return; // 노드 위 클릭은 제외

    isSelectingRef.current = true;
    const vRect = viewportRef.current.getBoundingClientRect();
    const startX = e.clientX - vRect.left + viewportRef.current.scrollLeft;
    const startY = e.clientY - vRect.top + viewportRef.current.scrollTop;
    dragStartPosRef.current = { x: startX, y: startY, clientX: e.clientX, clientY: e.clientY };

    if (!e.ctrlKey && !e.metaKey) {
      setSelectedPaths(new Set());
    }
  };

  // 전역 마우스 이동 & 마우스 업 이벤트로 드래그 선택 박스 계산
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isSelectingRef.current || !viewportRef.current) return;

      const vRect = viewportRef.current.getBoundingClientRect();
      const currentX = e.clientX - vRect.left + viewportRef.current.scrollLeft;
      const currentY = e.clientY - vRect.top + viewportRef.current.scrollTop;

      const left = Math.min(dragStartPosRef.current.x, currentX);
      const top = Math.min(dragStartPosRef.current.y, currentY);
      const width = Math.abs(currentX - dragStartPosRef.current.x);
      const height = Math.abs(currentY - dragStartPosRef.current.y);

      // 드래그 거리 4px 이상일 때만 박스 표시
      if (width > 4 || height > 4) {
        setSelectionBox({ left, top, width, height });

        // 사각형 영역과 교차하는 트리 행 찾기
        const boxScreenRect = {
          left: Math.min(dragStartPosRef.current.clientX, e.clientX),
          top: Math.min(dragStartPosRef.current.clientY, e.clientY),
          right: Math.max(dragStartPosRef.current.clientX, e.clientX),
          bottom: Math.max(dragStartPosRef.current.clientY, e.clientY)
        };

        const rows = viewportRef.current.querySelectorAll('.tree-row[data-tree-path]');
        const matched = new Set();
        rows.forEach((row) => {
          const rRect = row.getBoundingClientRect();
          const overlap = !(
            rRect.right < boxScreenRect.left ||
            rRect.left > boxScreenRect.right ||
            rRect.bottom < boxScreenRect.top ||
            rRect.top > boxScreenRect.bottom
          );
          if (overlap) {
            const p = row.getAttribute('data-tree-path');
            if (p) matched.add(p);
          }
        });

        setSelectedPaths(matched);
      }
    };

    const handleMouseUp = () => {
      if (isSelectingRef.current) {
        isSelectingRef.current = false;
        setSelectionBox(null);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // 단축키 (Ctrl+C, Ctrl+V) 이벤트 처리
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      const isCtrl = e.ctrlKey || e.metaKey;
      if (!isCtrl) return;

      if (e.key.toLowerCase() === 'c') {
        let targets = getSelectedNodes();
        if (targets.length === 0 && activePath && solution) {
          const single = findNodeByPath(solution.tree, activePath);
          if (single) targets = [single];
        }
        if (targets.length > 0) {
          e.preventDefault();
          handleCopyNodes(targets);
        }
      } else if (e.key.toLowerCase() === 'v') {
        if (clipboard?.nodes?.length) {
          e.preventDefault();
          const activeNode = activePath && solution ? findNodeByPath(solution.tree, activePath) : null;
          const firstSelected = getSelectedNodes()[0] || activeNode;
          handlePasteNodes(firstSelected);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPaths, activePath, clipboard, solution]);

  const handleContextMenu = (e, node) => {
    e.preventDefault();
    e.stopPropagation();
    if (node && !selectedPaths.has(node.path)) {
      setSelectedPaths(new Set([node.path]));
    }
    setContextMenu({ x: e.clientX, y: e.clientY, targetNode: node });
  };

  const handleAction = (actionType, targetNode) => {
    setContextMenu(null);
    if (actionType === 'copy') {
      const targets = selectedPaths.size > 0 ? getSelectedNodes() : (targetNode ? [targetNode] : []);
      handleCopyNodes(targets);
      return;
    }
    if (actionType === 'paste') {
      handlePasteNodes(targetNode);
      return;
    }
    if (actionType === 'delete') {
      if (confirm(`'${targetNode.name}' 항목을 완전히 삭제하시겠습니까?`)) {
        window.pareAPI?.deletePath(targetNode.path).then(onRefresh).catch(err => alert(err.message));
      }
      return;
    }

    setModal({
      type: actionType,
      targetNode,
      inputVal: actionType === 'rename' ? targetNode.name : ''
    });
  };

  const handleModalSubmit = async (trimmedVal) => {
    if (!modal || !trimmedVal) return;

    const { type, targetNode } = modal;
    const baseDir = targetNode
      ? (targetNode.isDirectory ? targetNode.path : getParentDir(targetNode.path))
      : solution?.rootPath;

    const sep = baseDir.includes('/') ? '/' : '\\';

    try {
      if (type === 'new_file') {
        const fullPath = `${baseDir}${sep}${trimmedVal}`;
        await window.pareAPI?.createFile(fullPath);
      } else if (type === 'new_folder') {
        const fullPath = `${baseDir}${sep}${trimmedVal}`;
        await window.pareAPI?.createDir(fullPath);
      } else if (type === 'rename') {
        const parentDir = getParentDir(targetNode.path);
        const newPath = `${parentDir}${sep}${trimmedVal}`;
        await window.pareAPI?.renamePath(targetNode.path, newPath);
      }
      onRefresh();
    } catch (err) {
      alert(`작업 실패: ${err.message}`);
    } finally {
      setModal(null);
    }
  };

  return (
    <aside className="explorer-panel" onContextMenu={(e) => handleContextMenu(e, null)}>
      <div className="panel-header">
        <span>솔루션 탐색기</span>
        <div className="panel-actions">
          <button className="icon-btn" onClick={() => handleAction('new_file', null)} title="새 파일">
            <VscNewFile size={13} />
          </button>
          <button className="icon-btn" onClick={() => handleAction('new_folder', null)} title="새 폴더">
            <VscNewFolder size={13} />
          </button>
          <button className="icon-btn" onClick={onRefresh} title="새로고침">
            <VscRefresh size={13} />
          </button>
          <button className="icon-btn" title="모두 축소">
            <VscCollapseAll size={13} />
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="tree-viewport"
        onMouseDown={handleViewportMouseDown}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }}
        onDrop={(e) => {
          e.preventDefault();
          handleDropOnNode(null);
        }}
      >
        {selectionBox && (
          <div
            className="explorer-selection-box"
            style={{
              left: `${selectionBox.left}px`,
              top: `${selectionBox.top}px`,
              width: `${selectionBox.width}px`,
              height: `${selectionBox.height}px`
            }}
          />
        )}
        {solution ? (
          solution.tree.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              onSelect={handleSelectNode}
              activePath={activePath}
              selectedPaths={selectedPaths}
              onContextMenu={handleContextMenu}
              onDragStartNode={handleDragStartNode}
              onDropOnNode={handleDropOnNode}
            />
          ))
        ) : (
          <div style={{ padding: '16px', fontSize: '12px', color: '#6e6e6e' }}>
            열린 폴더가 없습니다.
          </div>
        )}
      </div>

      <div className="explorer-bottom-tabs">
        <span className="explorer-tab-link active">솔루션 탐색기</span>
        <span className="explorer-tab-link">속성</span>
        <span className="explorer-tab-link">Git 변경 내용</span>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          targetNode={contextMenu.targetNode}
          canPaste={Boolean(clipboard?.nodes?.length)}
          onClose={() => setContextMenu(null)}
          onAction={handleAction}
        />
      )}

      {modal && (
        <ExplorerModal
          modal={modal}
          onClose={() => setModal(null)}
          onSubmit={handleModalSubmit}
        />
      )}
    </aside>
  );
}