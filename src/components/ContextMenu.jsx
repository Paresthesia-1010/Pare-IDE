import React, { useEffect, useRef } from 'react';
import { VscNewFile, VscNewFolder, VscEdit, VscTrash, VscCopy, VscClippy } from 'react-icons/vsc';

export default function ContextMenu({ x, y, targetNode, canPaste, onClose, onAction }) {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ top: `${y}px`, left: `${x}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="context-menu-item" onClick={() => onAction('new_file', targetNode)}>
        <VscNewFile size={13} color="#4ade80" />
        <span>새 파일</span>
      </div>
      <div className="context-menu-item" onClick={() => onAction('new_folder', targetNode)}>
        <VscNewFolder size={13} color="#fbbf24" />
        <span>새 폴더</span>
      </div>
      <div className="context-menu-divider" />
      {targetNode && (
        <div className="context-menu-item" onClick={() => onAction('copy', targetNode)}>
          <VscCopy size={13} color="#38bdf8" />
          <span>복사</span>
          <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#888' }}>Ctrl+C</span>
        </div>
      )}
      <div
        className={`context-menu-item ${!canPaste ? 'disabled' : ''}`}
        style={!canPaste ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
        onClick={() => {
          if (canPaste) onAction('paste', targetNode);
        }}
      >
        <VscClippy size={13} color="#a78bfa" />
        <span>붙여넣기</span>
        <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#888' }}>Ctrl+V</span>
      </div>
      {targetNode && (
        <>
          <div className="context-menu-divider" />
          <div className="context-menu-item" onClick={() => onAction('rename', targetNode)}>
            <VscEdit size={13} color="#60a5fa" />
            <span>이름 바꾸기</span>
          </div>
          <div className="context-menu-item danger" onClick={() => onAction('delete', targetNode)}>
            <VscTrash size={13} color="#f87171" />
            <span>삭제</span>
          </div>
        </>
      )}
    </div>
  );
}