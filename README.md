# Eric’s Agent Office

從空白 GitHub repo 開始寫的 3D Agent 辦公室。用幾何物件組成房間、桌椅、植物與角色，並把 Codex 的工作狀態轉成角色動作。

網站： https://eric-agent-office.aglowant130.chatgpt.site （私人工作室，需要使用擁有者帳號登入）

## 目前可以做什麼

- 旋轉、縮放及重設 3D 辦公室視角。
- 點選員工或右側清單，查看職務與任務。
- 示範模式：切換工作、休息、待確認、完成，角色會改變動作，休息時走到休息區。
- 即時模式：顯示由本機連線程式回報的真實 Codex 狀態。
- 保存狀態變更動態；心跳 15 秒一次，45 秒未更新後顯示離線。
- 支援最多 8 位員工；示範資料不會寫入真實資料庫。

即時模式連接的是 **透過本專案啟動的 Codex 工作**，不會自動接管或觀察 Codex 桌面 App 裡的其他聊天。網站目前只顯示狀態，不會從雲端下達本機指令。

## 我們怎麼從零蓋出來

| 步驟 | 做法 | 主要檔案 |
| --- | --- | --- |
| 1. 建立骨架 | 使用 Sites 的 Vinext 起始架構，提供 React 頁面、Vite 建置與 Cloudflare Worker 後端 | `app/page.tsx`、`vite.config.ts` |
| 2. 畫出房間 | Three.js 場景、正交相機、光線、陰影；桌椅和人物由方塊與圓柱構成 | `components/office-scene.ts` |
| 3. 組成介面 | 員工清單、工作角落、狀態篩選、示範／即時切換 | `components/office.tsx`、`app/globals.css` |
| 4. 定義狀態 | 工作／休息／待確認／完成／失敗／離線，與動畫分開管理 | `lib/office-types.ts`、`lib/agent-protocol.mjs` |
| 5. 保存真實資料 | HTTP API 與 D1 資料庫；時間由伺服器產生，最多保存 100 筆變更 | `app/api/office/route.ts`、`db/schema.ts` |
| 6. 連接 Codex | 本機啟動 App Server，完成初始化與登入檢查，再接收工作事件並送出心跳 | `bridge/codex-agent.mjs` |
| 7. 發布 | 建置、檢查、同步 Sites 原始碼、保存版本、部署私人網站 | `.openai/hosting.json` |

參考專案提供了產品靈感；沒有複製它的房間、人物、原始碼或 Minecraft 功能。框架起始檔與套件維持各自授權。

## 本機開發

需要 Node.js 22.13 以上，建議使用 Node.js 22 的最新修補版本。

```bash
npm install
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_crazy_harrier.sql
npm run dev -- --host 127.0.0.1 --port 5173
```

資料表建立指令只需在新的本機資料庫執行一次。後續新增資料表時用 `npm run db:generate` 產生新 migration，再依序套用；不要重播已套用的 SQL。

開啟終端機顯示的本機網址。停止服務請按 Control+C。

```bash
npx tsc --noEmit
npm test
OFFICE_TEST_URL=http://127.0.0.1:5173 node tests/http-smoke.mjs
```

HTTP 檢查只接受本機網址，在本機資料庫寫入 `office-http-test` 測試員工。

## 連接真實 Codex

1. 安裝並登入 Codex CLI：`codex login`。本程式使用現有的 Codex 登入，不需要在網站存放 OpenAI API 金鑰。
2. 在本機設定 `OFFICE_URL`（工作室完整網址）。私人雲端工作室另外需要 `OFFICE_SITE_TOKEN`，由 Sites 的 `get_site` 回傳 `siwc_bypass_bearer_token` 取得；請讓有權限的 Codex 在記憶體中傳入，不要貼到對話或提交 Git。
3. 啟動連線檢查或一個工作。

本機開發模式不需要 Sites 憑證：

```bash
OFFICE_URL=http://127.0.0.1:5173 npm run agent -- --check
OFFICE_URL=http://127.0.0.1:5173 npm run agent -- --name Eric --prompt "閱讀專案並摘要結構"
```

雲端模式由有權限的 Codex 透過隱藏 stdin 傳入 `{ "url": "工作室網址", "token": "服務存取憑證" }`，對應參數為 `--stdin-config`。這個 JSON 不應寫入檔案、shell 參數或公開輸出。

其他參數：

| 參數 | 用途 |
| --- | --- |
| `--check` | 只檢查登入、App Server 與狀態上傳，不啟動模型工作 |
| `--name Eric` | 顯示姓名 |
| `--id codex-eric` | 員工識別碼；多個同時工作的實例要使用不同 ID |
| `--role "開發工程師"` | 顯示職務 |
| `--task "整理專案結構"` | 上傳到網站的簡短任務名稱；省略時使用通用描述，不上傳 prompt |
| `--cwd /absolute/project/path` | 讓 Codex 工作的專案資料夾 |
| `--keep-alive` | 工作完成後繼續回報心跳；Control+C 後顯示離線 |

初版的模型工作使用唯讀沙盒。需確認的操作會在互動終端詢問；沒有互動終端時拒絕操作，不會自動同意。

### 事件怎麼變成動畫

```text
Codex App Server
  turn/started       → working → 桌前工作
  需要確認的請求      → blocked → 舉手等待
  turn/completed
    completed        → done    → 完成待命
    failed           → error   → 需要協助
    interrupted      → idle    → 到休息區
  中斷／心跳逾時      → offline → 清單保留，角色離席
```

終端完整回覆保留在本機。伺服器只保存白名單欄位：ID、姓名、職務、狀態、簡短任務名稱、伺服器回報時間。資料庫及畫面不保存原始對話、終端輸出或本機檔案。

## GitHub 和 Sites 的關係

GitHub repo 保存你自己的程式碼。Sites 另有管理部署來源的遠端，部署工具會把同一個提交同步過去；**推送 GitHub 不會自行觸發 Sites 部署**。

`.openai/hosting.json` 保存既有 Site ID 與 D1 綁定；更新時重用它，不要重建另一個 Site。發布依序建置、同步原始碼、打包成品、保存版本並部署。D1 的正式 migration 由 Sites 部署套用，本機測試資料不會上傳。

工作室目前依靠 Sites 的擁有者私人存取控制保護共用狀態 API。若未來要開放給其他人或公開，必須先加入每位使用者／每個更新端的授權與資料隔離，不能只切換網站分享設定。

## 官方參考

- [Codex App Server](https://learn.chatgpt.com/docs/app-server)
- [ChatGPT Sites](https://learn.chatgpt.com/docs/sites)
- [Three.js](https://threejs.org/)
- [Vite](https://vite.dev/guide/)
