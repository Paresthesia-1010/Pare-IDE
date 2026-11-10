/**
 * AI 응답에 포함된 파일 작업 및 제어 태그를 제거합니다.
 *
 * 사용:
 * import { sanitizeAiText } from './js/chatformat';
 */

export function sanitizeAiText(raw) {
  if (!raw) return '';

  let cleaned = String(raw);

  cleaned = cleaned.replace(/<edit_file[\s\S]*?(<\/edit_file>|$)/gi, '');
  cleaned = cleaned.replace(/<write_file[\s\S]*?(<\/write_file>|$)/gi, '');
  cleaned = cleaned.replace(/<read_file[\s\S]*?(<\/read_file>|\/?>|$)/gi, '');
  cleaned = cleaned.replace(/<run_command[\s\S]*?(<\/run_command>|\/?>|$)/gi, '');
  cleaned = cleaned.replace(/<delete_file[\s\S]*?(<\/delete_file>|\/?>|$)/gi, '');
  cleaned = cleaned.replace(/<create_dir[\s\S]*?(<\/create_dir>|\/?>|$)/gi, '');
  cleaned = cleaned.replace(/<list_files[\s\S]*?(<\/list_files>|\/?>|$)/gi, '');
  cleaned = cleaned.replace(/<next_turn[\s\S]*?(<\/next_turn>|$)/gi, '');
  cleaned = cleaned.replace(/<\/end>/gi, '');

  return cleaned.trim();
}

export default sanitizeAiText;
