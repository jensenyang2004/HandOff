# Support GitHub push webhook for inbox suggestions

Implemented `POST /api/webhook/github` to automatically capture push events from GitHub and queue them in the user's inbox.

### Changes
- **app.py**: Added `/api/webhook/github` endpoint.
  - Validates payload for `ref`, `pusher`, and `head_commit`.
  - Parses commit SHA, title, body, pusher, and branch.
  - Matches pusher username to system user via `User.github_handle` and associates it with the created node suggestion.
  - Populates the `nodes_json` list so the frontend timeline UI correctly reads and displays the commit title and hash.
- **seed.py**: Added `github_handle='Github_username'` to the 'user' seed data for realistic local testing.

### Testing
** NOTE: Webhook needs to be manually setup on GitHub.**
(The hook should point to "http://<the-public-url-that-we-dont-have-yet>:5001/api/webhook/github")

To test the webhook flow locally:
1. Start the server: `python app.py`
2. Send a mock GitHub push payload:
   ```bash
   curl -X POST http://localhost:5001/api/webhook/github \
     -H "Content-Type: application/json" \
     -d '{
       "ref": "refs/heads/main",
       "pusher": {"name": "jensenyang2004"},
       "head_commit": {
         "id": "7777777abc1234",
         "message": "Push for testing user matching in webhook",
         "url": "https://github.com/example/repo/commit/7777777"
       }
     }'
   ```
3. Verify validation error (should return 400):
   ```bash
   curl -i -X POST http://localhost:5001/api/webhook/github \
     -H "Content-Type: application/json" \
     -d '{"ref": "refs/heads/main"}'
   ```
4. Query the inbox endpoint to ensure the suggestion is added with the matched system user (`jensen`):
   ```bash
   curl -s http://localhost:5001/api/inbox | python3 -m json.tool
   ```
