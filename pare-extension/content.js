console.log('[Pare Bridge] Content script loaded with Raw Newline Extractor.');

const statusBadge = document.createElement('div');
statusBadge.style.cssText = `
  position: fixed;
  bottom: 20px;
  right: 20px;
  background: #18181b;
  color: #a1a1aa;
  border: 1px solid #27272a;
  padding: 6px 12px;
  font-size: 11px;
  font-family: monospace;
  border-radius: 4px;
  z-index: 999999;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  transition: all 0.2s ease;
`;
statusBadge.innerHTML = '<span style="width:7px;height:7px;border-radius:50%;background:#ef4444;"></span> Pare IDE: 오프라인';
document.body.appendChild(statusBadge);

// DOM 내부의 줄바꿈(\n)을 뭉개지 않고 순수하게 추출하는 재귀 탐색기
function extractRawTextWithNewlines(node) {
  if (!node) return '';
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    const tag = node.tagName.toLowerCase();
    if (['ms-thought-chunk', 'mat-accordion', 'mat-expansion-panel'].includes(tag)) return '';
    if (node.classList.contains('actions-container') ||
        node.classList.contains('author-label') ||
        node.classList.contains('turn-footer')) return '';

    let text = '';
    for (const child of node.childNodes) {
      text += extractRawTextWithNewlines(child);
    }

    if (tag === 'br') return '\n';
    if (['p', 'div', 'pre', 'tr', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
      if (!text.endsWith('\n')) text += '\n';
    }
    return text;
  }
  return '';
}

function parseTurnElement(turnEl) {
  try {
    const id = turnEl.id || ('turn-' + Math.random().toString(36).substr(2, 9));
    
    let role = 'user';
    const roleAttr = turnEl.querySelector('[data-turn-role]')?.getAttribute('data-turn-role');
    
    if (roleAttr) {
      role = roleAttr.toLowerCase() === 'user' ? 'user' : 'assistant';
    } else {
      const authorText = (turnEl.querySelector('.author-label')?.innerText || '').toLowerCase();
      const isModel = authorText.includes('model') ||
                      turnEl.classList.contains('model') ||
                      Boolean(turnEl.querySelector('.model-prompt-container')) ||
                      Boolean(turnEl.querySelector('ms-thought-chunk'));
      role = isModel ? 'assistant' : 'user';
    }

    let thoughtText = '';
    let isThinking = false;

    const thoughtChunk = turnEl.querySelector('ms-thought-chunk');
    if (thoughtChunk) {
      const bodyEl = thoughtChunk.querySelector('.mat-expansion-panel-body') ||
                     thoughtChunk.querySelector('ms-text-chunk');
      if (bodyEl) {
        thoughtText = extractRawTextWithNewlines(bodyEl).trim();
      }

      const collapsedEl = thoughtChunk.querySelector('.thought-collapsed-text');
      const collapsedText = (collapsedEl?.innerText || '').toLowerCase();
      const topHeader = thoughtChunk.querySelector('.top-panel-header');
      const isExpanded = topHeader?.getAttribute('aria-expanded') === 'true';

      const hasExpandSignal = collapsedText.includes('expand');
      const hasCollapseSignal = collapsedText.includes('collapse');

      if (hasExpandSignal || (!isExpanded && thoughtText.length > 0)) {
        isThinking = false;
      } else if (hasCollapseSignal || isExpanded) {
        isThinking = true;
      } else {
        isThinking = false;
      }
    }

    // 본문 줄내림(\n) 온전히 추출
    const answerText = extractRawTextWithNewlines(turnEl).trim();

    if (answerText.length > 0 && !hasUnescapedEndTagInClient(answerText)) {
      // 텍스트는 작성 중이지만 아직 종료 태그 전
    }

    const timeEl = turnEl.querySelector('.timestamp');
    const time = timeEl ? (timeEl.innerText || '').trim() : '';

    return { 
      id, 
      role, 
      text: answerText, 
      thoughtText, 
      isThinking, 
      time 
    };
  } catch (err) {
    return {
      id: turnEl.id || ('turn-' + Math.random().toString(36).substr(2, 9)),
      role: 'assistant',
      text: extractRawTextWithNewlines(turnEl).trim(),
      thoughtText: '',
      isThinking: false,
      time: ''
    };
  }
}

function hasUnescapedEndTagInClient(text) {
  if (!text) return false;
  let cleaned = text.replace(/```[\s\S]*?```/g, '');
  cleaned = cleaned.replace(/`[^`\n]*`/g, '');
  return /<\/end>/i.test(cleaned);
}

function syncHistory() {
  const turnElements = document.querySelectorAll('ms-chat-turn');
  if (turnElements.length === 0) return;

  const turns = Array.from(turnElements).map(parseTurnElement);

  fetch('http://127.0.0.1:39281/api/sync-history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ turns })
  }).catch(() => {});
}

function waitForDomAndSync(retries = 20) {
  const turns = document.querySelectorAll('ms-chat-turn');
  if (turns.length > 0) {
    syncHistory();
  } else if (retries > 0) {
    setTimeout(() => waitForDomAndSync(retries - 1), 500);
  }
}

let lastTurnCount = 0;
let streamThrottleTimer = null;

function checkChanges() {
  const turns = document.querySelectorAll('ms-chat-turn');
  if (turns.length === 0) return;

  if (turns.length !== lastTurnCount) {
    lastTurnCount = turns.length;
    syncHistory();
    return;
  }

  if (streamThrottleTimer) return;
  streamThrottleTimer = setTimeout(() => {
    streamThrottleTimer = null;
    const latestTurn = turns[turns.length - 1];
    const parsed = parseTurnElement(latestTurn);

    if (parsed.role === 'assistant') {
      fetch('http://127.0.0.1:39281/api/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed)
      }).catch(() => {});
    }
  }, 50);
}

const observer = new MutationObserver(() => {
  checkChanges();
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true
});

function injectAngularValue(textarea, text) {
  textarea.focus();
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  nativeSetter.call(textarea, text);
  textarea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
}

function handlePromptExecution(promptText) {
  const textarea = document.querySelector('textarea[formcontrolname="promptText"]') ||
                   document.querySelector('ms-prompt-box textarea');

  if (!textarea) return;
  injectAngularValue(textarea, promptText);

  setTimeout(() => {
    const runBtn = document.querySelector('ms-run-button button') ||
                   document.querySelector('button.ctrl-enter-submits');

    if (runBtn && runBtn.getAttribute('aria-disabled') !== 'true') {
      runBtn.click();
    } else {
      const ctrlEnter = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        ctrlKey: true,
        bubbles: true,
        composed: true
      });
      textarea.dispatchEvent(ctrlEnter);
    }
  }, 300);
}

function connectToPare() {
  const evtSource = new EventSource('http://127.0.0.1:39281/events');

  evtSource.onopen = () => {
    statusBadge.innerHTML = '<span style="width:7px;height:7px;border-radius:50%;background:#22c55e;"></span> Pare IDE: 연결됨';
    statusBadge.style.borderColor = '#22c55e';
    waitForDomAndSync();
  };

  evtSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'PROMPT' && data.text) {
        handlePromptExecution(data.text);
      }
      if (data.type === 'REQUEST_HISTORY') {
        syncHistory();
      }
    } catch (e) {}
  };

  evtSource.onerror = () => {
    statusBadge.innerHTML = '<span style="width:7px;height:7px;border-radius:50%;background:#ef4444;"></span> Pare IDE: 재연결 중...';
    statusBadge.style.borderColor = '#ef4444';
    evtSource.close();
    setTimeout(connectToPare, 3000);
  };
}

connectToPare();