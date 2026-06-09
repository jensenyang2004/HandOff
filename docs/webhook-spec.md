# Webhook Feature Spec — GitHub Push

## Objective

Add a `POST /api/webhook/github` endpoint to `app.py` that receives a
GitHub push payload, matches the pusher to a system user, and writes
one `InboxSuggestion` row to the database. The existing inbox UI
(`GET /api/inbox`) already reads and displays these rows — no frontend
changes needed.

---

## Endpoint

```
POST /api/webhook/github
Content-Type: application/json
```

GitHub sends this automatically when a push is made to a watched repo.
For demo/testing, you can simulate it with `curl` (see Testing section).

---

## Input — GitHub push payload (relevant fields only)

```json
{
  "ref": "refs/heads/ocr-pipeline",
  "head_commit": {
    "id": "a1b2c3d4",
    "message": "fix: correct bounding box shrink ratio",
    "url": "https://github.com/org/repo/commit/a1b2c3d4"
  },
  "pusher": {
    "name": "jensen-park"
  },
  "repository": {
    "full_name": "org/repo"
  }
}
```

Full payload reference: https://docs.github.com/en/webhooks/webhook-events-and-payloads#push

---

## User matching

Match `payload["pusher"]["name"]` against `User.github_handle` in the database.

```python
user = User.query.filter_by(github_handle=payload["pusher"]["name"]).first()
# user may be None if no match — still create the InboxSuggestion, leave created_by blank
```

---

## Output — InboxSuggestion row to create

HandOff "branches" are feature tracks (e.g. "OCR Pipeline"), not git
branches. There is no reliable way to map a git branch name to a
HandOff branch automatically — the user will pick the correct HandOff
branch themselves in the inbox UI when they review the commit.

Leave `branch_slug` empty.

| Field | Value |
|---|---|
| `source` | `"git"` |
| `title` | `"[<short_sha>] <commit message>"` — e.g. `"[a1b2c3d] fix: correct bounding box shrink ratio"` |
| `raw_text` | Full commit message |
| `nodes_json` | `"[]"` — leave empty, AI group will populate this later |
| `branch_slug` | `""` — user assigns this in the UI |
| `dismissed` | `False` |

```python
suggestion = InboxSuggestion(
    source='git',
    title=f"[{sha[:7]}] {message}",
    raw_text=message,
    nodes_json='[]',
    branch_slug='',
)
db.session.add(suggestion)
db.session.commit()
```

---

## Response

Return `201` on success:

```json
{ "ok": true, "id": 5 }
```

Return `400` if the payload is missing required fields (`ref`, `head_commit`, `pusher`).

---

## Where to add the code

All changes go in **`app.py`** only. Add the new route near the existing inbox routes (around line 397). Import nothing new — `InboxSuggestion`, `User`, `Branch`, and `db` are already imported.

```python
@app.route('/api/webhook/github', methods=['POST'])
def webhook_github():
    # your implementation here
    ...
```

---

## Testing

### Option A — curl (no setup required)

Simulate a push payload directly while the server is running:

```bash
curl -X POST http://localhost:5001/api/webhook/github \
  -H "Content-Type: application/json" \
  -d '{
    "ref": "refs/heads/ocr",
    "head_commit": {
      "id": "a1b2c3d4e5f6",
      "message": "fix: correct bounding box shrink ratio",
      "url": "https://github.com/org/repo/commit/a1b2c3d4e5f6"
    },
    "pusher": { "name": "jensen-park" },
    "repository": { "full_name": "org/repo" }
  }'
```

Expected response: `{"ok": true, "id": <some number>}`

Then open the app, go to **My Log → Inbox**, and verify the new Git banner appears.

---

### Option B — real GitHub push via ngrok

To receive actual GitHub push events on localhost:

**1. Install and start ngrok**
```bash
brew install ngrok        # or download from https://ngrok.com
ngrok http 5001
```
ngrok will print a public URL like `https://abc123.ngrok-free.app`. Keep this terminal open.

**2. Register the webhook on GitHub**
- Go to your repo → **Settings → Webhooks → Add webhook**
- Payload URL: `https://abc123.ngrok-free.app/api/webhook/github`
- Content type: `application/json`
- Which events: **Just the push event**
- Click **Add webhook**

**3. Verify**
Push any commit to the repo. GitHub will call your local server through ngrok. Check the app inbox for the new Git banner.

> Note: the ngrok URL changes every time you restart ngrok (on the free plan). Update the GitHub webhook URL if you restart it.

---

## What is already done (do not re-implement)

- `InboxSuggestion` model — `models.py:150`
- `GET /api/inbox` — returns all undismissed suggestions — `app.py:397`
- `POST /api/inbox/<id>/dismiss` — `app.py:402`
- Frontend inbox UI — `frontend/personal-log.jsx`
- Seeded demo git entry — visible in inbox on fresh DB
