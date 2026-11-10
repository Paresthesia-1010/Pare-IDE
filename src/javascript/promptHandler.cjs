// src/javascript/promptHandler.cjs
const fs = require('fs');
const path = require('path');
const { ipcMain } = require('electron');

function registerPromptHandler(context) {
  ipcMain.on('ai:sendPrompt', (_, userPrompt) => {
    const targetRoot = context.getCurrentRootPath() || process.cwd();
    const files = context.getProjectFileList(targetRoot);
    const fileListStr = files.length > 0 ? files.join('\n') : '(단일 파일 모드)';
    const userJsonBlock = JSON.stringify({ user: userPrompt });

    // 활성 에디터 소스코드 추출
    let activeFileSnippet = '';
    const activeFilePath = context.getActiveFilePath();
    if (activeFilePath && fs.existsSync(activeFilePath)) {
      try {
        const activeRel = path.relative(targetRoot, activeFilePath).replace(/\\/g, '/');
        const activeCode = fs.readFileSync(activeFilePath, 'utf8');
        activeFileSnippet = `\n[현재 에디터에 열려 있는 파일: ${activeRel}]\n${activeCode}\n`;
      } catch (e) {}
    }

    const finalPrompt = `[현재 프로젝트 파일 목록]
${fileListStr}
${activeFileSnippet}
${userJsonBlock}

[에이전트 규칙 - Cursor Diff 방식 적용]
위 열려 있는 파일 내용을 확인하고, 수정이 필요한 경우 전체 파일이 아닌 수정할 부분만 아래 형식으로 출력하세요:
1. 파일 수정:
<edit_file path="상대경로/파일명">
<<<<<<< SEARCH
기존 코드 블록
=======
새로 교체될 코드 내용
>>>>>>> REPLACE
</edit_file>

2. 새 파일 생성:
<write_file path="상대경로/파일명">
새 파일 전체 내용
</write_file>

3. 파일 내용 조회 (특정 파일 코드가 필요할 때):
<read_file path="상대경로/파일명"/>
(위 태그를 출력하면 시스템이 파일 내용을 읽어 자동으로 다음 턴에 전달합니다.)

4. 쉘 명령어 실행 (말풍선 전용 터미널에서 실행되며, 실패 시 오류가 자동 보고됩니다):
<run_command>실행할 쉘 명령어 (예: npm test, python app.py)</run_command>

5. 파일 삭제:
<delete_file path="상대경로/파일명"/>

6. 다음 단계 자동 연속 실행 (사용자 개입 없이 다음 단계를 바로 이어서 진행할 때):
<next_turn>
다음 단계로 진행할 상세 작업 지시사항
</next_turn>

같은 파일명의 edit_file을 한 채팅턴에서 출력할수없습니다. 무조건 한개만 출력하며, 다음것도 필요할경우 </end> 보단위 맨하단에 sample.js 수정 중. [1/2] 이런식으로 표기하시오.

항상 To-dos를 를 같이 출력해주세요

예시:

- [ ] 완료 되지않은 Task
- [x] 완료 된 Task

[필수 규칙]
항상 맨마지막 단엔 </end> 태그를 출력하세요.`;

    if (context.broadcastSse) {
      context.broadcastSse({ type: 'PROMPT', text: finalPrompt });
    }
  });
}

module.exports = { registerPromptHandler };