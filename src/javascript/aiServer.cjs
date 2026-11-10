// src/javascript/aiServer.cjs
const http = require('http');
const { executeAiCommands, hasUnescapedEndTag } = require('./agentExecutor.cjs');

function initAiServer(context, port = 39281) {
  let sseClients = [];
  let cachedTurns = [];
  const executedTurnIds = new Set();

  const broadcastSse = (data) => {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    sseClients.forEach(res => res.write(`data: ${payload}\n\n`));
  };

  context.broadcastSse = broadcastSse;

  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.url === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      res.write('data: {"type":"CONNECTED"}\n\n');
      sseClients.push(res);
      req.on('close', () => { sseClients = sseClients.filter(c => c !== res); });
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');

          if (req.url === '/api/sync-history') {
            cachedTurns = payload.turns || [];
            const chatWindow = context.getChatWindow();
            if (chatWindow && !chatWindow.isDestroyed()) {
              chatWindow.webContents.send('ai:history', cachedTurns);
            }
          }

          if (req.url === '/api/stream') {
            const { id, text } = payload;
            const currentRoot = context.getCurrentRootPath();

            // </end> 감지 시 일괄 실행
            const hasEndSignal = hasUnescapedEndTag(text) || /<\/end>|<end>|\[end\]/i.test(text || '');

            if (text && hasEndSignal && !executedTurnIds.has(id)) {
              const actions = executeAiCommands(text, currentRoot, context);
              if (actions.length > 0) {
                executedTurnIds.add(id);
                payload.actions = actions;

                const mainWindow = context.getMainWindow();
                if (mainWindow && !mainWindow.isDestroyed()) {
                  const updatedTree = context.readDirTree(currentRoot);
                  mainWindow.webContents.send('fs:workspaceUpdated', {
                    rootPath: currentRoot,
                    tree: updatedTree,
                    actions: actions
                  });
                }

                // <next_turn> 자동 발송
                const nextTurnAction = actions.find(a => a.type === 'next_turn');
                if (nextTurnAction && nextTurnAction.prompt) {
                  console.log('[Pare Agent] 자율 루프 감지: 다음 턴 자동 진행 ->', nextTurnAction.prompt);

                  setTimeout(() => {
                    broadcastSse({
                      type: 'PROMPT',
                      text: `[자율 루프 연속 실행 지시]\n${nextTurnAction.prompt}\n\n[종료 규칙]\n모든 목표가 완료되면 <next_turn> 없이 </end>만 출력하여 종료하세요.`
                    });

                    const chatWindow = context.getChatWindow();
                    if (chatWindow && !chatWindow.isDestroyed()) {
                      chatWindow.webContents.send('ai:stream', {
                        id: `loop-${Date.now()}`,
                        role: 'user',
                        text: `🤖 [자율 연속 실행] ${nextTurnAction.prompt}`
                      });
                    }
                  }, 600);
                }
              }
            }

            const chatWindow = context.getChatWindow();
            if (chatWindow && !chatWindow.isDestroyed()) {
              chatWindow.webContents.send('ai:stream', payload);
            }
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(400);
          res.end();
        }
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`[Pare Server] running on http://127.0.0.1:${port}`);
  });

  return { server, broadcastSse };
}

module.exports = { initAiServer };