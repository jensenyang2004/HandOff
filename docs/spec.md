# Handoff — Technical Specification v3

---

## Overview

A single-project node and branch management tool. Employees log decisions, commits, links, and notes onto branches. Managers monitor progress and assign tasks. AI is used in exactly three places: parsing free-form log input into structured nodes, maintaining branch context summaries, and generating the final export report.

---

## Data Model

### Project
```
Project
  id
  name
  created_at
  context_doc        (text, set by manager, injected into all AI calls)
```

### Branch
```
Branch
  id
  name
  parent_branch_id        (null if root, max depth 3)
  created_by
  created_at
  archived_at             (null if active)
  context_doc             (text, set at creation or edited later)
  running_summary         (text, auto-updated by Gemini)
  running_summary_updated_at
  node_count_since_last_summary   (integer, resets to 0 after each summary update)
```

### Node
```
Node
  id
  branch_id
  created_by
  created_at
  type                    (commit | link | note | idea | task)
  content                 (text or URL)
  metadata                (JSON: commit hash, link title, due date, etc.)
  assigned_to             (null or user_id)
  assignment_status       (null | pending | acknowledged | done)
  is_ai_generated         (boolean)
```

### User
```
User
  id
  name
  email
  role                    (employee | manager)
  github_handle           (optional)
```

---

## Context Architecture

Context lives at three layers. Every AI call receives all three as a system prompt prefix, in order.

**Layer 1 — Project Context**
Set once by manager at project setup. Describes what the project does, who it's for, and the technical stack. Rarely changed.

**Layer 2 — Branch Context**
Set when a branch is created, editable anytime. Describes why this branch exists, what problem it solves, and what done looks like.

**Layer 3 — Running Summary**
Auto-maintained by Gemini. Updated silently in the background every time `node_count_since_last_summary` reaches 5. Represents a concise, up-to-date narrative of what has happened on this branch so far.

Every Gemini call assembles context like this:
```
[Project Context]
[Branch Context]
[Running Summary]
[Task-specific instruction]
[Employee input or node data]
```

---

## Context Update Trigger and UI

### Trigger Logic

Every time a new node is saved to a branch, the backend increments `node_count_since_last_summary` by 1. When it reaches 5, a context update job is queued immediately after the node save response is returned to the client.

The client is notified via a server-sent event or a flag in the node save response: `context_updating: true`.

### Frontend Behavior

When `context_updating: true` is received, the branch label in the tree view shows a small animated indicator — a subtle pulsing dot next to the branch name. Clicking the branch while updating is in progress shows a progress bar inside the branch context panel.

**Progress bar behavior:**
The bar is not real-time. It is a staged fake progress that communicates "something is happening" without misleading the user about actual LLM latency.

```
Stage 1 (0–30%):   "Reading branch history..."     fills over 1.2s
Stage 2 (30–65%):  "Identifying key decisions..."  fills over 1.5s
Stage 3 (65–90%):  "Updating context..."           fills over 1.0s
Stage 4 (90–100%): holds at 90% until API returns
Stage 5:           jumps to 100%, bar fades out over 0.3s
```

If the API call returns before stage 4, it waits until the animation reaches 90% before jumping to 100%. If the API is slow, it holds at 90% until the response arrives. The user never sees it snap backwards.

**After completion:**
The branch context panel updates the running summary text with a subtle fade-in. A small timestamp appears below: "Context updated just now." The pulsing dot disappears.

**If the update fails:**
The progress bar fades out silently. No error shown to the user. The running summary retains its previous value. The node is still saved successfully — context update failure is non-blocking.

---

## Features

---

### 1. Branch Tree View (Both Roles)

The main screen. Horizontal timeline with lanes, one per branch. Branches indent to show parent-child relationships. Time flows left to right, defaulting to the last 30 days with a scrubber to zoom or pan.

**Branch structure:**
```
Project Root
├── OCR Pipeline
│   ├── Model Training
│   └── Post-processing
├── Data Preprocessing
└── Deployment
```

**Node circle colors by type:**
- Teal: commit
- Amber: experiment / idea
- Purple: link / reference
- Gray: note
- Blue: task (pending)
- Green: task (done)
- Red: task (overdue)

**Branch activity encoding:**
- Full opacity solid line: updated within 7 days
- 60% opacity solid line: 7–14 days
- 40% opacity dashed line: 14+ days

**Branch context panel:**
Each branch has a collapsible context panel accessible by clicking the branch label. It shows two sections:

```
Branch context
[editable text — why this branch exists]

Running summary
[auto-generated, last updated timestamp]
[flag as inaccurate button]
```

If `context_updating` is true for this branch, the running summary section is replaced by the progress bar UI described above.

**Interactions:**
- Click empty space on branch → manual node add drawer
- Click node circle → node detail drawer
- Click branch label → expand/collapse context panel
- "Add Branch" button in top bar → modal

---

### 2. Free Log Page (Employee)

A simple input page. Employee pastes or types anything. Gemini parses it into structured nodes using all three context layers.

**UI elements:**
- Branch selector dropdown at top
- Large textarea: "Paste links, commits, results, notes..."
- Submit button: "Add to branch"

**On submit:**
1. Content sent to Gemini with full context prefix
2. Gemini returns JSON array of nodes
3. Employee sees preview of parsed nodes with type badges
4. Employee confirms or edits individual nodes
5. On confirm, nodes are saved, `node_count_since_last_summary` incremented per node added

**Gemini prompt contract:**

System prefix:
```
[Project Context]
[Branch Context]
[Running Summary]
Instruction: Parse the following input into structured nodes.
Return strict JSON array only. No prose. No explanation.
```

Output schema:
```json
[
  {
    "type": "commit | link | note | idea | task",
    "content": "string",
    "metadata": {}
  }
]
```

---

### 3. Manual Node Add (Employee)

Triggered by clicking empty space on any branch in the tree view. A drawer opens from the right.

Fields:
- Type selector (commit / link / note / idea / task)
- Content field (text or URL)
- Assign to (user picker, optional)
- Due date (only if type is task)

If type is link, system fetches page title automatically and stores in metadata. No AI involved.

On save, `node_count_since_last_summary` increments. If it reaches 5, context update triggers.

---

### 4. Branch Creation

"Add Branch" button in top bar opens a modal with three fields:
- Branch name
- Parent branch (dropdown, optional)
- What is this branch for? (textarea, optional but prompted)

The third field populates `context_doc` on the branch. Can be edited later from the branch context panel.

---

### 5. Assign and Mention

On any node, an "Assign" button opens a user picker. Assigned user sees the node in their task list. Assignment states: pending → acknowledged → done.

---

### 6. Task List (Employee)

Separate tab. All nodes assigned to this employee across all branches.

Columns: branch name, content preview, type, due date, status, "Mark done" button.

Sorted by due date ascending, then created_at.

---

### 7. Weekly Digest Export (Employee)

Button: "Generate weekly digest"

Collects all nodes created by this employee in the past 7 days across all branches. Sends to Gemini with full context prefix.

**Gemini output:**
```
Week of [date]

What I worked on
[one paragraph per active branch]

Key decisions
[bullet list]

References used
[bullet list with links]

Dead ends
[bullet list]

Still in progress
[bullet list]
```

Employee reviews, edits, exports as markdown or copies to clipboard.

**This is distinct from the handover document.** Weekly digest is short, scoped to 7 days, written in first person, meant for team sync. It does not include gap analysis or cross-employee context.

---

### 8. Handover Document Export (Employee or Manager)

Visible to managers always. Visible to employee only when they mark themselves as departing in profile settings.

Select departing employee. Gemini receives all nodes ever created by or assigned to that employee, grouped by branch, with full context prefix for each branch.

**Gemini output:**
```
Handover Document — [Employee Name]
Generated: [date]

[Branch Name]
  Background
  [branch context doc + running summary, summarized]

  Key decisions
  [bullet list with dates]

  References used
  [bullet list with links]

  Dead ends and why
  [bullet list]

  Open tasks
  [bullet list with assignment status]

  Still in progress
  [bullet list]

────────────────────────
Coverage gaps

  [Branch name] — only [n] entries recorded
  [Branch name] — assigned but no entries recorded
```

Exported as markdown or PDF.

**This is distinct from the weekly digest.** Handover is comprehensive, covers all time, written in third person, includes gap analysis, meant for the next person taking over.

---

### 9. Manager Dashboard

**Team activity feed:**
Most recent 20 node updates across all team members. Shows employee name, branch, node type, content preview, timestamp. Read-only.

**Employee filter:**
Dropdown to select employee. Tree view highlights branches where that employee has nodes. Others dim but remain visible.

**Assignment table:**
All task nodes assigned by this manager. Columns: branch, content preview, assigned to, due date, status. Sortable by status and due date.

---

## AI Usage Summary

| Trigger | Context injected | Input | Output |
|---|---|---|---|
| Free log submit | Project + Branch + Running summary | Raw employee text | JSON array of nodes |
| node_count_since_last_summary reaches 5 | Project + Branch + all existing nodes on branch | — | Updated running summary |
| Weekly digest | Project + Branch + Running summary per branch | Nodes past 7 days | Markdown weekly summary |
| Handover export | Project + Branch + Running summary per branch | All nodes for employee | Markdown handover document |

---

## Out of Scope

- Multi-project support
- Real-time collaboration or live cursors
- GitHub OAuth or automatic commit detection
- Comments or threads on nodes
- Email or Slack notifications
- Mobile view

---

## Stack

Frontend: React. Backend: Flask. DB: Sqlite. For a MVP, we are just gonna run it on local. It's important that we don't have time to link ti github. So we might need to create a certain dataset of git commit, just showcasing we import the git. 