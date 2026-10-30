# Eric’s Agent Office

一間用 Three.js 從零畫出的辦公室，集中顯示 Windows、Mac、Codex、Claude Code、Gemini CLI 的工作狀態。

網站： https://eric-agent-office.aglowant130.chatgpt.site （維持擁有者私人存取）

## 0.2 版的連線方式

```text
家裡 Windows：Codex App / CLI、Claude Code、Gemini CLI
                         ↓ 本機收集器
                  同一間雲端 Agent Office
                         ↑ 本機收集器
公司 Mac：Codex App / CLI、Claude Code、Gemini CLI
```

網站顯示電腦、工具、工作階段、狀態與最近回報。每個工作階段是一位夥伴；同一台電腦同一個 Codex session 同時出現在 App 和 CLI 時使用相同 ID，不會重複算人。3D 場景每次顯示 8 位，點其他工作階段會換到對應座位，清單不再只保留 8 筆。

- **工具 hooks（主要接法）**：接收開始、等待確認、完成與結束等事件。程式只觀察，不自動同意權限、不阻止任務、不注入模型上下文。
- **Codex 工作紀錄（相容模式）**：觀察既有 App／CLI 的本機 JSONL 中明確的 `task_started`、`task_complete`、`turn_aborted` 事件。畫面標示「工作紀錄 · 相容模式」，不能憑此判斷所有權限等待；工作紀錄久未更新時顯示「狀態未確認」。
- Claude、Gemini 的一般網頁聊天不屬於此連線範圍；Claude 指 **Claude Code**，Gemini 指 **Gemini CLI**。
- 遠端／雲端執行的工作必須在實際執行環境安裝收集器；不會僅靠桌面 App 的畫面推測遠端狀態。

相容模式依賴非穩定的工作紀錄格式，版本改動可能需要更新 reader。程式只解析已知狀態事件，不以檔案修改時間直接推斷任務完成。支援範圍是最近 24 小時有更新的工作紀錄（掃描最近三個 UTC 日期資料夾）。

## 每台電腦只需設定一次

前提：Node.js **22.13 以上**、Git，以及你要連接的 Agent 工具已安裝。可在終端執行下列指令，也可讓該電腦上的 Codex 依本文件代辦。

```text
git clone https://github.com/erict0205/agent-office.git
cd agent-office
npm ci
```

已下載的專案先更新即可，不要在既有檔案上重複 clone。

**公司 Mac：**

```text
npm run office:setup -- --device company-mac --name "公司 Mac" --tools codex,claude,gemini
```

**家裡 Windows（PowerShell 或終端機）：**

```text
npm run office:setup -- --device home-windows --name "家裡 Windows" --tools codex,claude,gemini
```

只使用 Codex 時，把工具清單改成 `--tools codex`。安裝器使用同一份 Node 程式；Windows 命令路徑會正規化，Codex 另外寫入 `commandWindows`。Windows 若使用 WSL，須在工具實際執行的環境安裝與啟動；原生 Windows 與 WSL 的使用者目錄預設並不相同。

安裝器先驗證所有 JSON，再備份、合併設定，保留原有 hooks 與其他設定。重跑不會重複加入同一份回報 hook。使用的檔案：

| 用途 | 路徑 |
|---|---|
| 裝置設定 | `~/.agent-office/device.json` |
| Codex hooks | `~/.codex/hooks.json` |
| Claude Code hooks | `~/.claude/settings.json` |
| Gemini CLI hooks | `~/.gemini/settings.json` |

hooks 指向此 repo 的安裝位置；搬移資料夾後請重跑設定指令。

`~` 在 Windows 代表使用者目錄。備份在原檔旁，檔名包含 `.agent-office-時間.bak`。裝置設定只含裝置資訊與本機收集器金鑰，**不保存 Sites 服務憑證**。

### 夥伴名稱、工作分類與退場

每個 session 會依固定 ID 取得人名（例如 Milo Chen）。App／CLI 觀察到同一個 session 時沿用同一個名字，重啟收集器與重新整理也不會改名；不同 session 可能剛好同名，可用電腦、工具及工作識別區分。

分類包含功能開發、問題排查、測試驗證、資料研究、文件整理、程式審查、介面設計、部署發布及一般任務。本機依使用者輸入中的關鍵字與工具事件推測分類，網站只收到固定分類與動作摘要（讀取檔案、修改程式、執行檢查等）。不呼叫模型，不上傳原始輸入、命令、路徑或輸出。分類是粗略提示，可能不準確；讀取或執行某個工具不代表操作成功。無法辨識的事件保留一般任務／處理任務。

同一輪任務若能辨識使用者意圖，就保留該分類，直到下一輪重設；例如部署時順便跑測試，分類仍為部署發布，最近動作顯示執行檢查。Codex App 的紀錄相容模式支援已知的使用者訊息及工具呼叫格式；格式改變時可能只剩生命週期狀態。

辦公室預設只顯示工作中、等待確認、需要協助，及最近 5 分鐘內結束／閒置／狀態未確認的工作。超時工作與離線工作進入「歷史」清單，開始新工作就會回到座位。計時使用工作事件時間，裝置持續送心跳不會延後退場。歷史沿用現有的最近 200 個 session／200 筆動態上限，並非永久完整稽核紀錄。點選夥伴可以查看最近幾筆動作；3D 場景仍只呈現辦公室中的夥伴。

### Codex hooks 的信任

Codex 要求你在工具內執行 **`/hooks`**，檢閱並信任新 hook 定義。此專案不繞過信任檢查。修改 hook 定義後可能需要重新信任；現有聊天可能要在下一輪或重開工作階段後才載入。

未信任前，Codex App／CLI 可先用工作紀錄相容模式回報開始、完成、中斷；完整的「等待確認」仍以 hook 事件為準。Claude Code、Gemini CLI 也需要依各工具顯示的設定／信任提示完成載入；管理員停用 hooks 時，安裝器不會強制打開。

## 啟動收集器

每台電腦執行一個收集器即可，不必為每位 Agent 開一個，也不需要在家裡重建網站或資料庫。

```text
npm run office:start -- --stdin-config
```

由有 Sites 存取權的 Codex 讀取既有 Site：

- Site ID：`appgprj_6ae43a2aa7bc8191868f0aa413a150d6`
- 網址：`https://eric-agent-office.aglowant130.chatgpt.site`
- 透過 `get_site` 取得 `siwc_bypass_bearer_token`，只把 `{"token":"服務存取憑證"}` 傳入提示後的**隱藏 stdin**。

憑證只留在程序記憶體；不要貼入聊天、命令參數或設定檔。也支援外部安全注入的 `OFFICE_SITE_TOKEN` 環境變數。重啟收集器時需要重新提供存取憑證；目前不會替你把它永久存入電腦，也不會自動設定開機啟動。

收集器連上後，在網站選擇「即時連線」。它只對外發出 HTTPS；本機 hook 接收端綁定 `127.0.0.1`，要求獨立隨機金鑰，拒絕瀏覽器跨站送入事件，不需要開放公司或家裡的入站連接埠。

```text
npm run office:doctor
```

這會顯示工具是否存在、裝置設定、收集器是否運作、最近雲端同步時間，不會顯示金鑰。按 Control+C 停止收集器；45 秒未收到心跳後，Office 會顯示裝置／員工離線。

可用選項：

- 設定時 `--dry-run`：只檢查將修改的檔案，不寫入。
- 設定或啟動時 `--config /absolute/device.json`：使用另一份裝置設定。
- 設定或啟動時 `--no-codex-files`：停用 Codex 工作紀錄相容 reader，只依賴 hooks。
- 設定時 `--url http://127.0.0.1:5173`：只連本機開發網站，不需要 Sites 憑證。
- 設定時 `--port 47832`：變更收集器本機連接埠。

## 狀態、排序與隱私

收集器每 15 秒回報心跳，狀態變更後會提早同步；網站每 5 秒更新。事件用狀態時間排序，延遲到達的舊事件不能覆蓋新狀態。短暫斷線會保留記憶體內狀態並重試。每台收集器最多保留 64 個工作階段，雲端清單最多讀取 200 筆，最近動態保留 200 筆。

上傳白名單只有：雜湊工作階段 ID、工具、裝置別名、狀態、通用工作描述、來源與時間。不上傳 prompt、模型回覆、終端輸出、工具參數、專案路徑或帳號資料。工作階段原始 ID 只在本機使用；Office 使用雜湊識別。狀態收集使用一般 Node 程式，不額外呼叫模型。

「完成」代表收到本輪結束訊號，不能用它代替程式測試或業務驗收。相容 reader 沒有足夠訊號時顯示未知，不把沉默當成成功。

## 開發網站與驗證

新增的資料庫 migration 是 `drizzle/0001_curvy_sunfire.sql`，第一版既有 migration 不變。新本機資料庫按順序執行 `0000`、`0001`；已完成第一版資料庫只套用 `0001` 一次。

```text
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_crazy_harrier.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_curvy_sunfire.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_sharp_maria_hill.sql
npm run dev -- --host 127.0.0.1 --port 5173
```

```text
npm test
npx tsc --noEmit
node tests/http-smoke.mjs
node tests/ingest-smoke.mjs
```

HTTP smoke 測試只允許本機網址，會在本機資料庫建立測試員工。自動化測試涵蓋三種 hook、真實 hook 入口、設定合併與備份、Windows 路徑引號、部分 JSONL、隱私過濾、本機認證、斷線重試、跨裝置識別與舊事件排序。Windows 指令與路徑有測試覆蓋，但仍需在你的 Windows 電腦做實機驗證；Claude／Gemini 的完整工作回合也需在工具內載入 hooks 後驗證。

## 原始碼怎麼分工

| 檔案 | 責任 |
|---|---|
| `components/office-scene.ts` | 3D 房間與角色動畫 |
| `components/office.tsx` | 場景、清單、裝置／工具篩選 |
| `components/connect-panel.tsx` | Windows／Mac 連線說明與設定提示複製 |
| `bridge/collector/setup.mjs` | 裝置與工具設定、備份與合併 |
| `bridge/collector/hook.mjs` | 從工具事件挑出白名單資訊 |
| `bridge/collector/transcripts.mjs` | Codex App／CLI 相容 reader |
| `bridge/collector/server.mjs` | 本機認證、工作階段去重、批次上傳與重試 |
| `app/api/ingest/route.ts` | 接收裝置心跳與批次狀態 |
| `lib/server-office.ts` | 舊事件防護與狀態資料寫入 |

第一版的 `npm run agent` 仍保留，供需要透過程式啟動獨立唯讀 Codex 任務時使用；日常 App／CLI 的狀態監看改用收集器。

GitHub 保存使用者原始碼；Sites 使用自己的部署來源遠端。推送 GitHub 不會自動觸發部署。更新重用 `.openai/hosting.json` 中既有 Site ID，維持原本私人權限；正式 migration 由 Sites 部署套用，本機測試資料不會上傳。若未來要對其他人開放網站，先加入更新端授權與資料隔離，不能只切換分享設定。

官方參考：[Codex hooks](https://learn.chatgpt.com/docs/hooks)、[Claude Code hooks](https://code.claude.com/docs/en/hooks)、[Gemini CLI hooks](https://geminicli.com/docs/hooks/reference/)、[Sites](https://learn.chatgpt.com/docs/sites)。
