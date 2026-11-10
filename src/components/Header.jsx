import React from 'react';
import { VscFolderOpened, VscSave, VscPlay, VscSparkle, VscSettingsGear } from 'react-icons/vsc';

export default function Header({ solution, activeTab, onOpenFolder, onSave, onOpenSettings }) {
  return (
    <header className="top-menu-bar">
      <div className="menu-left" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <img
          src="https://cdn.discordapp.com/attachments/1568748845825921024/1569779758231851068/logo.png?ex=6af4b2d3&is=6af36153&hm=cf91f56b97922311acd961ffaafcb6f8f7d6d5c7b230d47cde83d6347b7d6168&"
          alt="Pare IDE Logo"
          style={{ width: '16px', height: '16px', objectFit: 'contain', userSelect: 'none' }}
          onError={(e) => { e.currentTarget.src = '/icon.ico'; }}
        />
        <span style={{ fontSize: '12px', fontWeight: '600', color: '#e4e4e7', userSelect: 'none' }}>
          Pare IDE
        </span>
        <button
          className="icon-btn header-settings-btn"
          onClick={onOpenSettings}
          title="환경 설정 (정보 / 업데이트)"
        >
          <VscSettingsGear size={14} />
        </button>
        <span style={{ color: '#3f3f46', fontSize: '12px' }}>|</span>
        {solution ? (
          <span style={{ fontSize: '11px', color: '#a1a1aa', maxWidth: '450px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {solution.rootPath}
          </span>
        ) : (
          <span style={{ fontSize: '11px', color: '#71717a' }}>
            열린 폴더 없음
          </span>
        )}
      </div>

      <div className="menu-right">
        <button
          className="vs-btn ai-trigger-btn"
          onClick={() => window.pareAPI?.openChat()}
          title="독립 AI 채팅창 열기"
        >
          <VscSparkle size={13} color="#c084fc" />
          <span>AI 채팅</span>
        </button>

        <button className="vs-btn" onClick={onOpenFolder}>
          <VscFolderOpened size={13} />
          <span>폴더 열기</span>
        </button>
        <button className="vs-btn" onClick={onSave} disabled={!activeTab}>
          <VscSave size={13} />
          <span>저장</span>
        </button>
        <button className="vs-btn primary">
          <VscPlay size={12} />
          <span>실행</span>
        </button>
      </div>
    </header>
  );
}