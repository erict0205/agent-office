// Shared, finite labels: no prompt, path, tool input or model output reaches the site.
export const workCategories = {
  general: '一般任務', development: '功能開發', debugging: '問題排查', testing: '測試驗證',
  research: '資料研究', documentation: '文件整理', review: '程式審查', design: '介面設計', deployment: '部署發布',
};
export const workActions = {
  processing: '處理任務', reading: '讀取檔案', editing: '修改程式', checking: '執行檢查',
  searching: '搜尋資料', reviewing: '查看變更', publishing: '發布網站', writing: '編寫文件', executing:'執行本機指令',
};
export function validCategory(value) { return Object.hasOwn(workCategories, value) ? value : 'general'; }
export function validAction(value) { return Object.hasOwn(workActions, value) ? value : 'processing'; }
export function categoryLabel(value) { return workCategories[validCategory(value)]; }

const given = ['Milo','Luna','Leo','Nora','Owen','Iris','Theo','Maya','Finn','Ruby','Noah','Ella','Luca','Aria','Eli','Zoe','Hugo','Ada','Oscar','Cleo','Felix','Hazel','Jasper','Willow','Kai','Olive','Evan','Chloe','Alex','Emma','Robin','Lily'];
const family = ['Chen','Lin','Wu','Wang','Lee','Huang','Chang','Liu','Yang','Chou','Morgan','Parker','Reed','Brooks','Hayes','Rivera','Bennett','Collins','Foster','Bailey','Cooper','Sullivan','Harper','Quinn','Ellis','Taylor','Reese','Bell','Gray','Wells','Blake','Lane'];
export function humanName(id) {
  // Stable across collector restarts, devices, browsers and App/CLI views of a session.
  let hash = 2166136261;
  for (const char of String(id)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash,16777619) >>> 0; }
  return `${given[hash % given.length]} ${family[(hash >>> 8) % family.length]}`;
}

export { isInOffice } from './office-attendance.mjs';
