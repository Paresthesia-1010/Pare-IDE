import React, { useState, useEffect } from 'react';
import packageJson from '../../package.json';
import {
  VscClose,
  VscInfo,
  VscCloudDownload,
  VscCheck,
  VscRefresh,
  VscGithub,
  VscShield,
  VscRadioTower,
  VscArrowRight,
  VscWarning
} from 'react-icons/vsc';

const appVersion = packageJson.version || '1.0.0';

export default function SettingsModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('info'); // 'info' | 'update'
  const [updateState, setUpdateState] = useState({
    status: 'idle', // 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
    percent: 0,
    version: '',
    error: ''
  });

  useEffect(() => {
    if (window.pareAPI?.onUpdateStatus) {
      window.pareAPI.onUpdateStatus((data) => {
        setUpdateState((prev) => ({
          ...prev,
          status: data.status,
          percent: data.percent ?? prev.percent,
          version: data.version ?? prev.version,
          error: data.error ?? ''
        }));
      });
    }
  }, []);

  const handleCheckUpdate = async () => {
    setUpdateState((prev) => ({ ...prev, status: 'checking', error: '' }));
    try {
      await window.pareAPI?.checkUpdate();
    } catch (err) {
      setUpdateState((prev) => ({ ...prev, status: 'error', error: err.message }));
    }
  };

  const handleApplyUpdate = () => {
    window.pareAPI?.quitAndInstall();
  };

  if (!isOpen) return null;
return (
<div className="ide-modal-backdrop" onClick={onClose}>
<div className="settings-modal-box" onClick={(e) => e.stopPropagation()}>
{/* 모달 헤더 */}
<div className="settings-modal-header">
<div className="settings-header-title">
<span>환경 설정</span>
</div>
<button className="settings-close-btn" onClick={onClose} title="닫기">
<VscClose size={16} />
</button>
</div>
{/* 모달 본문 (좌측 탭 메뉴 + 우측 콘텐츠 영역) */}
    <div className="settings-modal-body">
      {/* 사이드 탭 네비게이션 */}
      <aside className="settings-sidebar">
        <button
          className={`settings-nav-item ${activeTab === 'info' ? 'active' : ''}`}
          onClick={() => setActiveTab('info')}
        >
          <VscInfo size={15} />
          <span>정보</span>
        </button>
        <button
          className={`settings-nav-item ${activeTab === 'update' ? 'active' : ''}`}
          onClick={() => setActiveTab('update')}
        >
          <VscCloudDownload size={15} />
          <span>업데이트</span>
        </button>
      </aside>

      {/* 콘텐츠 영역 */}
      <main className="settings-content">
        {activeTab === 'info' && (
          <div className="settings-panel">
            <div className="settings-section-title">Pare IDE 정보</div>

            <div className="info-brand-card">
              <img
                src="https://cdn.discordapp.com/attachments/1568748845825921024/1569779758231851068/logo.png?ex=6af4b2d3&is=6af36153&hm=cf91f56b97922311acd961ffaafcb6f8f7d6d5c7b230d47cde83d6347b7d6168&"
                alt="Logo"
                className="info-logo"
                onError={(e) => { e.currentTarget.src = '/icon.ico'; }}
              />
              <div>
                <h3 className="info-app-name">Pare IDE</h3>
                <p className="info-app-desc">Minimalist Professional Desktop IDE with Built-in AI Agent</p>
              </div>
            </div>

            <div className="info-meta-grid">
              <div className="meta-card">
                <span className="meta-label">버전</span>
                <span className="meta-value">v{appVersion}</span>
              </div>
              <div className="meta-card">
                <span className="meta-label">일렉트론 (Electron)</span>
                <span className="meta-value">v29.1.0</span>
              </div>
              <div className="meta-card">
                <span className="meta-label">엔진 코어</span>
                <span className="meta-value">Chromium / Node.js 20</span>
              </div>
              <div className="meta-card">
                <span className="meta-label">운영체제</span>
                <span className="meta-value">Windows x64</span>
              </div>
            </div>

            <div className="settings-section-title" style={{ marginTop: '20px' }}>오픈소스 & 라이선스</div>
            <div className="info-links-row">
              <div
                className="info-link-badge"
                style={{ cursor: 'pointer' }}
                onClick={() => window.open('https://github.com/paresthesia-1010/pare-ide', '_blank')}
              >
                <VscGithub size={14} />
                <span>github.com/paresthesia-1010/pare-ide</span>
              </div>
              <div className="info-link-badge">
                <VscShield size={14} />
                <span>MIT License</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'update' && (
          <div className="settings-panel">
            <div className="settings-section-title">소프트웨어 업데이트</div>

            <div className="update-status-card">
              <div className="update-status-icon">
                {updateState.status === 'error' ? (
                  <VscWarning size={20} color="#f87171" />
                ) : updateState.status === 'downloaded' || updateState.status === 'not-available' || updateState.status === 'idle' ? (
                  <VscCheck size={20} color="#4ade80" />
                ) : (
                  <VscRefresh size={20} className="spin-icon" color="#38bdf8" />
                )}
              </div>
              <div className="update-status-info">
                <div className="update-status-heading">
                  {updateState.status === 'checking' && 'GitHub에서 새 버전을 확인하는 중...'}
                  {updateState.status === 'available' && `새로운 버전(v${updateState.version}) 발견! 다운로드 준비 중...`}
                  {updateState.status === 'downloading' && `업데이트 다운로드 중... (${updateState.percent}%)`}
                  {updateState.status === 'downloaded' && `새 버전(v${updateState.version}) 다운로드 완료!`}
                  {updateState.status === 'not-available' && '현재 최신 버전을 사용 중입니다.'}
                  {updateState.status === 'error' && '업데이트 확인 중 오류가 발생했습니다.'}
                  {updateState.status === 'idle' && '현재 최신 버전을 사용 중입니다.'}
                </div>
                <div className="update-status-sub">
                  {updateState.error
                    ? updateState.error
                    : updateState.status === 'downloading'
                    ? '백그라운드에서 패키지를 다운로드하고 있습니다.'
                    : `현재 설치된 버전: v${appVersion} (GitHub Releases 연동)`}
                </div>
                {updateState.status === 'downloading' && (
                  <div style={{ marginTop: '8px', height: '4px', background: '#222', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${updateState.percent}%`, height: '100%', background: '#38bdf8', transition: 'width 0.2s ease' }} />
                  </div>
                )}
              </div>
              {updateState.status === 'downloaded' ? (
                <button className="vs-btn primary update-check-btn" onClick={handleApplyUpdate}>
                  <VscArrowRight size={12} />
                  <span>재시작 후 적용</span>
                </button>
              ) : (
                <button
                  className="vs-btn primary update-check-btn"
                  onClick={handleCheckUpdate}
                  disabled={updateState.status === 'checking' || updateState.status === 'downloading'}
                >
                  <VscRefresh size={12} className={updateState.status === 'checking' ? 'spin-icon' : ''} />
                  <span>{updateState.status === 'checking' ? '확인 중...' : '업데이트 확인'}</span>
                </button>
              )}
            </div>

            <div className="settings-section-title" style={{ marginTop: '22px' }}>자동 업데이트 파이프라인</div>

            <div className="settings-setting-row">
              <div>
                <div className="setting-label">GitHub 자동 배포 감지</div>
                <div className="setting-desc">새로운 소스코드가 커밋되면 자동으로 dist 실행 파일을 빌드 및 다운로드합니다.</div>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" defaultChecked />
                <span className="slider round"></span>
              </label>
            </div>

            <div className="settings-setting-row">
              <div>
                <div className="setting-label">시작 시 백그라운드 업데이트 확인</div>
                <div className="setting-desc">프로그램 실행 시 GitHub Release에서 새 버전을 확인합니다.</div>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" defaultChecked />
                <span className="slider round"></span>
              </label>
            </div>
          </div>
        )}
      </main>
    </div>
  </div>
</div>
);
}
