import { validCategory, validAction, workActions } from '../../lib/work-labels.mjs';

// These rules run locally. Return enums only; never retain the text being examined.
export function classifyPrompt(text) {
  if (typeof text !== 'string') return 'general';
  const s = text.slice(0,12000);
  for (const [category, pattern] of [
    ['debugging', /除錯|排查|修復|修正.{0,8}(問題|錯誤|bug)|debug|fix\s+(?:the\s+)?(?:bug|error)|報錯/i],
    ['review', /程式審查|代碼審查|code\s*review|review\s+(?:this|the|my)\s+(?:code|pr|changes)/i],
    ['testing', /測試|驗證|跑.{0,5}檢查|\b(?:unit|integration|e2e)\s+tests?\b|\brun\s+(?:the\s+)?tests?\b/i],
    ['deployment', /部署|發布|上線|deploy|publish/i],
    ['documentation', /文件|說明書|README|撰寫.{0,5}說明|documentation/i],
    ['design', /介面|視覺|排版|配色|UI\s*design|layout/i],
    ['research', /研究|查詢|查找|搜尋|比較|調查|research|look\s*up|investigate/i],
    ['development', /開發|實作|新增|功能|修改|建置|implement|build|feature|refactor/i],
  ]) if (pattern.test(s)) return category;
  return 'general';
}

export function toolWork(name, input) {
  if (typeof name !== 'string') return null;
  const tool = name.toLowerCase();
  // Codex App may wrap native calls in an exec script. Inspect locally, never execute.
  if (['exec','functions.exec'].includes(tool) && typeof input === 'string') {
    const script=input.slice(0,100_000);
    if (/tools\.apply_patch\s*\(/.test(script)) return {category:'development',action:'editing'};
    if (/tools\.\w*sites_\w*(?:deploy|publish)\w*\s*\(/.test(script)) return {category:'deployment',action:'publishing'};
    if (/tools\.web__run\s*\(/.test(script)) return {category:'research',action:'searching'};
    if (/tools\.exec_command\s*\(/.test(script)) return toolWork('shell',{command:script});
  }
  if (/apply_patch|edit_file|write_file|writefile|replace|edit$|^write$|notebookedit/.test(tool)) return { category:'development', action:'editing' };
  if (/deploy|publish/.test(tool)) return { category:'deployment', action:'publishing' };
  if (/web|search|browse|fetch/.test(tool)) return { category:'research', action:'searching' };
  if (/read|open_file|glob|grep|list_dir/.test(tool)) return { category:'general', action:'reading' };
  if (/exec_command|shell|bash|run_shell_command|terminal/.test(tool)) {
    let args = input;
    if (typeof args === 'string' && args.length < 100_000) { try { args=JSON.parse(args); } catch { args=null; } }
    const cmd = typeof args?.command === 'string' ? args.command : typeof args?.cmd === 'string' ? args.cmd : '';
    if (/\b(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:test|build|check|lint|typecheck)\b|\b(?:pytest|vitest|jest|tsc)\b|\bnode\s+--test\b|\bgo\s+test\b|\bcargo\s+test\b/.test(cmd)) return {category:'testing', action:'checking'};
    if (/\bgit\s+(?:diff|show|log|status)\b/.test(cmd)) return {category:'review', action:'reviewing'};
    if (/\b(?:cat|sed|rg|head|tail|ls)\b/.test(cmd)) return {category:'general', action:'reading'};
    return {category:'general',action:'executing'};
  }
  return null;
}

export function taskSummary(status, category, action) {
  const act = workActions[validAction(action)];
  const messages = {
    working:`正在${act}`, blocked:`${act}，等待你在原工具中確認`, done:`本輪已結束 · 最近${act}`,
    idle:'等待下一個任務', offline:`工作階段已結束 · 最近${act}`, unknown:`最近${act} · 目前狀態未確認`,
  };
  return messages[status] ?? '狀態待確認';
}

export function mergeWork(previous, event) {
  const newTurn = (event.resetWork && event.observedAt !== previous?.observedAt) || (event.turn && previous?.turn && event.turn !== previous.turn);
  let category = newTurn ? 'general' : validCategory(previous?.category);
  const incoming = validCategory(event.category);
  // Prompt intent wins over incidental tools (a deployment may run tests or edit files).
  let categoryFromPrompt = newTurn ? false : Boolean(previous?.categoryFromPrompt);
  if (event.categoryFromPrompt && incoming !== 'general') { category=incoming; categoryFromPrompt=true; }
  else if (!categoryFromPrompt && incoming !== 'general') category=incoming;
  const action = event.action ? validAction(event.action) : newTurn ? 'processing' : validAction(previous?.action);
  return {category, categoryFromPrompt, action};
}
