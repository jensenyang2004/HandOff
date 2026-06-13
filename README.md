# HandOff

HandOff 是一套「專案交接與工程知識管理系統」。它的目標是把團隊平常散落在 commit、Slack、筆記、決策間的連結與任務中的資訊整理成可追蹤的分支時間軸，最後可以產生交接報告，降低成員離開或輪調時的知識流失。

這份 README 主要說明：

- 系統架構
- 程式碼結構
- EER Diagram
- 主要功能
- 如何啟動網站
- 功能設定說明
- Open API documentation
- 測試
- 補充文件
- User Stories Mapping
- Low fidelity Wireframes


## 系統架構

本專案是簡單的全端網站，主要由四層組成：

```text
Browser 使用者畫面
    ↓
Frontend React
    ↓
Backend Flask API
    ↓
SQLite Database
```

AI 服務不是獨立伺服器，而是由後端 Flask 在需要時呼叫 Gemini API。

```text
Frontend
    ↓ fetch API
Flask Backend
    ↓ read/write
SQLite Database
    ↓ when needed
Gemini AI API
```

## 程式碼結構

```text
HandOff/
├── app.py                    # Flask 後端入口，所有 API route 主要都在這裡
├── models.py                 # SQLAlchemy 資料庫模型
├── ai_service.py             # Gemini AI 呼叫與 prompt 設計
├── seed.py                   # 初始化 demo 資料
├── requirements.txt          # Python 套件需求
├── handoff.db                # 本機 SQLite 資料庫
├── frontend/                 # 主要前端程式
│   ├── index.html            # 前端 HTML 入口
│   ├── app.jsx               # 前端主 App
│   ├── api.js                # 前端呼叫後端 API 的地方
│   ├── timeline.jsx          # Timeline 畫面
│   ├── personal-log.jsx      # My Log / Inbox 畫面
│   ├── handover.jsx          # Handover 畫面
│   ├── manager-dashboard.jsx # Manager dashboard
│   ├── context.jsx           # Context 面板
│   └── styles.css            # 前端樣式
├── docs/                     # 補充規格文件
└── test/                     # pytest 測試
```
## EER Diagram
![image](https://github.com/jensenyang2004/HandOff/blob/main/截圖%202026-06-14%20凌晨1.02.04.png)

## 主要功能

HandOff 的核心功能是把團隊分散在 Slack、GitHub、筆記與任務中的資訊，整理成可以追蹤、可以搜尋、可以交接的專案記憶。

```text
Slack / GitHub / 手動紀錄
        ↓
Inbox 審核
        ↓
AI 解析成結構化節點
        ↓
Branch timeline
        ↓
Context / Decision linking / Handover report
```

### 1. 專案分支時間軸

系統以 branch 作為主要工作單位。每個 branch 可以代表一條功能線、研究方向或部署流程。而每個 branch 中可以包含多種 node：

```text
- Commit：
- Experiment：
- Reference：
- Note：
- Decision：
- Meeting：
- Milestone：
```

這些 node 會顯示在 timeline 上，讓使用者查看某個分支從過去到現在的發展脈絡。

### 2. Free log 解析

使用者可以在Timeline或是My Log 頁面，輸入任意與專案相關的紀錄，例如：

```text
We decided to use PostgreSQL because SQLite will not scale.
```

系統會透過 AI 將文字解析成 node 。 AI 會將輸入的文字拆成不同 node ，如 decision 以及 reference，並同時生成說明文字。而使用者可以先預覽 AI 解析結果，確認後再將該 node 新增到正式 timeline。

### 3. GitHub commit 匯入

系統提供 GitHub webhook endpoint，可以接收 GitHub push event。

當 GitHub 有新的 push 時，系統會在 My Log 中產生一筆 Git suggestion。使用者可以選擇要放入哪個 HandOff branch，再將其加入 timeline。

目前 GitHub 匯入會處理 push payload 中的 `head_commit`。也就是說，它會建立這次 push 的主要 commit 建議，不會逐一展開 payload 裡所有 commits。

### 4. Slack 訊息匯入

系統提供 Slack webhook endpoint，可以接收 Slack message event。

Slack 訊息不會立刻變成正式 node，而是先暫存在系統中。My log 中會顯示每個 channel 目前有多少 pending messages。使用者選擇 branch 並按下 Interpret 後，系統會把同一個 channel 中尚未處理的訊息整理成一段內容，交給 AI 解析成待新增節點。

目前 Slack message window 的判斷方式是：

```text
同一個 channel + processed == False 的所有訊息
```

也就是從上一次 interpret 之後，到這一次 interpret 之前，該 channel 的所有新訊息。


### 5. Inbox 審核機制

GitHub 與 Slack 匯入的資料都會先進入 Inbox，不會直接寫入 timeline。

使用者可以在 Inbox 中確認內容、選擇 branch、Interpret Slack 訊息、加入 timeline、或 dismiss 不需要的項目。

這樣可以避免外部訊息自動污染正式專案紀錄。

### 6. Branch context 管理

每個 branch 都有自己的 context，用來描述該分支的目的、目前狀態、技術細節、重要決策與未解問題。

系統可以透過 AI 根據 branch 中的 nodes 產生或更新 context。這讓後續 AI 解析、摘要與交接報告可以有更完整的背景資訊。

### 7. Decision linking

系統可以針對 decision node 找出可能相關的其他 nodes，例如：

```text
某個 commit 是否實作了這個 decision
某個 experiment 是否驗證了這個 decision
某個 meeting 是否促成了這個 decision
```

這些關係會以 `NodeLink` 的形式保存，幫助使用者理解技術決策與實際工作的關聯。

### 8. 任務管理

使用者可以在 My task 看見自己的任務有哪些、任務內容、被指派的人、任務狀態、due date。任務狀態可以是 pending、acknowledged、done。

### 9. Handover report 產生

當成員要交接工作時，系統可以根據 project、user、branch、node、task 等資料產生 handover report。

報告內容包含各 branch 的目前狀態、重要決策、參考資料、未完成任務、進行中的工作、可能風險。

### 10. Manager dashboard

管理者可以透過 manager dashboard 查看專案與團隊狀態，例如最近活動、分支進度、任務分配、尚未完成的工作、交接風險。

這讓管理者不需要逐一詢問成員，也能掌握專案脈絡。


## 安裝與啟動

### 1. 建立 Python virtual environment

```bash
python -m venv .venv
```

### 2. 啟用 virtual environment

macOS / Linux：

```bash
. .venv/bin/activate
```

Windows PowerShell：

```powershell
.venv\Scripts\Activate.ps1
```

### 3. 安裝套件

```bash
pip install -r requirements.txt
```

### 4. 設定環境變數

在專案根目錄建立 `.env`：

```bash
GEMINI_API_KEY=your_gemini_api_key
SLACK_SIGNING_SECRET=your_slack_signing_secret
DATABASE_URL=sqlite:///handoff.db
```

最小可啟動版本可以只放：

```bash
DATABASE_URL=sqlite:///handoff.db
```

如果沒有 `GEMINI_API_KEY`，AI 相關功能仍會有 mock fallback，但不會是真實 Gemini 結果。

### 5. 啟動伺服器

```bash
python app.py
```

啟動後打開：

```text
http://localhost:5001
```

## 功能設定說明

## 1. AI 功能

AI 功能需要設定：

```bash
GEMINI_API_KEY=your_gemini_api_key
```

使用的 model 定義在 `ai_service.py`：

```python
MODEL = 'gemini-3.1-flash-lite'
```

啟用後可使用：

- Free log 自動解析
- Branch context sync
- Decision linking
- Link description
- Weekly digest
- Handover generation

如果沒有設定 API key：

- 網站仍可啟動
- `parse_log()` 會使用簡單規則判斷
- `sync_context()` 會回傳簡化文字
- `generate_handover()` 不會產生真實 AI 報告

## 2. GitHub webhook

GitHub webhook endpoint：

```text
POST /api/webhook/github
```

本機測試可以用 curl：

```bash
curl -X POST http://localhost:5001/api/webhook/github \
  -H "Content-Type: application/json" \
  -d '{
    "ref": "refs/heads/main",
    "head_commit": {
      "id": "a1b2c3d4e5f6",
      "message": "fix: update handoff timeline",
      "url": "https://github.com/org/repo/commit/a1b2c3d4e5f6"
    },
    "pusher": { "name": "jensen-park" },
    "repository": { "full_name": "org/repo" }
  }'
```

成功後會在 Inbox 建立一筆 Git suggestion。

若要接真實 GitHub webhook，需要讓本機 server 暴露到公開網址，例如使用 ngrok：

```bash
ngrok http 5001
```

GitHub repository 設定：

```text
Settings → Webhooks → Add webhook
Payload URL: https://你的-ngrok-url/api/webhook/github
Content type: application/json
Events: Just the push event
```

## 3. Slack webhook

Slack webhook endpoint：

```text
POST /api/webhook/slack
```

本機測試可以用簡化 payload：

```bash
curl -X POST http://localhost:5001/api/webhook/slack \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "infra",
    "user": "diego",
    "display_name": "Diego Torres",
    "text": "deployment is green again",
    "ts": "2026-06-10T15:47:00"
  }'
```

送進來的 Slack 訊息會先存在 `SlackMessage`，並出現在 Inbox 的 pending Slack 區塊。使用者選擇 branch 後，才會呼叫 AI interpretation，把訊息整理成 node suggestion。

若要接真實 Slack Events API，需要設定：

```bash
SLACK_SIGNING_SECRET=your_slack_signing_secret
```

Slack app 設定：

```text
Event Subscriptions: Enable
Request URL: https://你的-ngrok-url/api/webhook/slack
Subscribe to bot events: message.channels 或需要的 message event
```
## AI Documentation
### AI 功能一覽

| 功能 | 後端方法 | API endpoint | 說明 |
| --- | --- | --- | --- |
| Free log 解析 | `AIService.parse_log()` | `POST /api/ai/parse-log` | 將自由文字解析成 structured nodes |
| Branch context sync | `AIService.sync_context()` | `POST /api/ai/sync-context/<branch_id>` | 根據 branch nodes 更新 AI context |
| Weekly digest | `AIService.generate_weekly_digest()` | `POST /api/ai/weekly-digest` | 產生使用者週報 |
| Handover report | `AIService.generate_handover()` | `POST /api/ai/handover` | 產生交接報告 |
| Decision branch scout | `AIService.scout_decision_branches()` | 由 decision linking 內部呼叫 | 判斷 decision 可能影響哪些 branch |
| Decision linking | `AIService.link_decision_to_nodes()` | `POST /api/ai/link-decisions` | 建立 decision 與其他 nodes 的關聯 |
| Link description | `AIService.describe_link()` | `POST /api/ai/describe-link/<link_id>` | 用一句話描述 node link 的原因 |

### `parse_log()` 輸入與輸出

前端呼叫：

```http
POST /api/ai/parse-log
Content-Type: application/json
```

Request body：

```json
{
  "branch_id": 1,
  "text": "We decided to use PostgreSQL because SQLite will not scale."
}
```

Response example：

```json
[
  {
    "type": "decision",
    "content": "Use PostgreSQL because SQLite will not scale.",
    "metadata": {
      "title": "Use PostgreSQL",
      "body": "We decided to use PostgreSQL because SQLite will not scale.",
      "note": "Database decision for future scalability.",
      "rationale": "SQLite will not scale."
    }
  }
]
```

AI 可能回傳的 node type：

```text
commit
link
note
idea
task
decision
meeting
milestone
```

### Prompt Context 組成方式

每次 AI 解析時，系統會盡量把專案與分支背景一起放入 prompt：

```text
Project Context
Branch Notes
Branch AI Context 或 Running Summary
Task-specific Instruction
User Input
```

這段邏輯在 `AIService.build_context_prefix()`。

### AI 使用限制

- AI 只負責文字解析、摘要與關聯判斷。
- AI 不直接寫入資料庫。
- AI 回傳結果會先給前端預覽或由後端檢查後再保存。
- Slack 訊息與 GitHub commit 目前不會自動配對；若 Slack 內容明確包含 commit hash 或 GitHub URL，AI 可能解析出相關 node，但沒有自動建立 commit-to-message matching。



## 測試

執行所有測試：

```bash
.venv/bin/python -m pytest -v
```

執行 Slack pipeline 測試：

```bash
.venv/bin/python -m pytest test/test_slack_interpret.py -v
```

目前 Slack 測試包含：

- Slack message ingest
- required fields validation
- pending messages grouping
- no pending messages error
- Gemini interpretation tests

其中 Gemini interpretation tests 需要 `GEMINI_API_KEY`。如果沒有設定，測試會自動 skipped。


## 補充文件

- `docs/spec.md`：原始系統規格與 context architecture。
- `docs/webhook-spec.md`：GitHub webhook 規格。
- `docs/slack-webhook-spec.md`：Slack webhook 規格。
- `docs/link_feat.md`：Decision linking 功能筆記。

## User Stories Mapping

Backbone / Activities：記錄工作 → 審核外部資訊 →  整理到分支 → 理解專案脈絡 → 管理與追蹤任務 → 產生交接


| Priority | 記錄工作 |審核外部資訊 |整理到分支 | 理解專案脈絡 | 管理任務 | 產生交接 |
| --- | --- | --- | --- | --- | --- | --- |
| **High**<br>MVP 必要 | 使用者可以手動新增 note、commit、reference、decision、meeting等node。 | GitHub push 會進入 Inbox，形成 commit suggestion。 | 使用者可以選擇 branch，將確認後的 node 加入 timeline。 | Timeline 可以依 branch 顯示所有 nodes。 | 使用者可以看到自己被指派的 task。 | 使用者可以產生基本 handover report。 |
| **High**<br>MVP 必要 | 使用者可以在 Free Log 貼上任意專案相關文字。 | Slack 訊息會先暫存，並在 Inbox 顯示 pending messages。 | 系統可以把 node 綁定到指定 branch。 | 使用者可以點開 node 查看詳細內容與 metadata。 | 使用者可以更新 task 狀態，例如 pending、acknowledged、done。 | 報告可以列出 branch 狀態、重要決策與未完成任務。 |
| **Medium**<br>重要但可分階段 | AI 可以將任意文字解析成 structured nodes。 | 使用者可以選擇 Slack channel window 並按 Interpret。 | 使用者可以建立新 branch 並填寫 branch context。 | AI 可以根據 branch nodes 產生 branch context。 | Manager 可以在 dashboard 查看任務分配。 | AI 可以根據 project、branch、nodes 產生更完整的交接內容。 |
| **Medium**<br>重要但可分階段 | 系統可以從輸入中辨識 link、commit hash、meeting、milestone。 | 使用者可以 dismiss 不需要的 Inbox item。 | 系統可以保存 node metadata，例如 hash、due date、rationale。 | 系統可以顯示 decision 與其他 nodes 的關聯。 | Manager 可以查看尚未完成或逾期任務。 | 交接報告可以整理 references、dead ends、open questions。 |
| **Low**<br>延伸功能 | 支援更完整的 Slack thread/window 判斷。 | 自動判斷 Slack 訊息可能對應哪個 commit。 | 支援 multi-project 或跨專案 branch。 | AI 自動偵測 branch 風險與 stale work。 | 任務提醒與通知整合。 | 匯出 PDF、Markdown 或分享連結。 |

### User Story Map Narrative

```text
Step 1
使用者先透過手動輸入、My Log、GitHub webhook 或 Slack webhook 捕捉工作資訊。

Step 2
外部資訊先進入 Inbox，由使用者檢查、選擇 branch、Interpret 或 dismiss。

Step 3
確認後的資訊被儲存為 node，並放到正確的 branch timeline。

Step 4
團隊透過 timeline、branch context、decision linking 理解專案脈絡。

Step 5
使用者與管理者追蹤任務狀態、負責人與 deadline。

Step 6
需要交接時，系統根據 branch、node、task 與 context 產生 handover report。
```

### MVP 範圍
- 手動新增與顯示 timeline nodes
- Free Log 自由文字解析
- GitHub commit suggestion
- Slack pending messages 與 Interpret
- Inbox 審核流程
- Branch context
- Task 狀態追蹤
- Handover report

## Low fidelity Wireframes 
![image](https://github.com/jensenyang2004/HandOff/blob/main/Add%20a%20little%20bit%20of%20body%20text.png)



