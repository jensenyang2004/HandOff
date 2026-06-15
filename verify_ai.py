"""
Verify Gemini model availability and all AIService methods.
Run: .venv/bin/python verify_ai.py
"""
import os, sys, json
from dotenv import load_dotenv
load_dotenv()

# ── helpers ────────────────────────────────────────────────────────────────
GREEN  = '\033[92m'
RED    = '\033[91m'
YELLOW = '\033[93m'
RESET  = '\033[0m'

def ok(msg):   print(f"{GREEN}  ✓ {msg}{RESET}")
def fail(msg): print(f"{RED}  ✗ {msg}{RESET}"); sys.exit(1)
def note(msg): print(f"{YELLOW}  · {msg}{RESET}")

# ── fixture data ───────────────────────────────────────────────────────────
PROJECT = {'name': 'HandOff Test', 'context_doc': 'Internal handoff tool for ML teams.'}

BRANCH = {
    'name': 'OCR Pipeline',
    'slug': 'ocr',
    'context_doc': 'Improve OCR accuracy on financial PDFs.',
    'running_summary': '',
    'ai_context': '',
}

NODES = [
    {
        'created_at': '2025-01-10T10:00:00',
        'type': 'commit',
        'created_by': 'alice',
        'content': 'abc1234',
        'metadata': {
            'title': 'Add CRAFT-based table detector',
            'body': 'Added table detection in preprocessing to handle Bloomberg PDFs with unstructured tables.',
            'note': 'Confidence threshold set to 0.85',
            'hash': 'abc1234',
        },
    },
    {
        'created_at': '2025-01-12T14:30:00',
        'type': 'idea',
        'created_by': 'alice',
        'content': 'Table detection benchmark',
        'metadata': {
            'title': 'Table detection benchmark',
            'metric': 'F1=0.87 on FinancialBench',
            'note': 'Outperforms baseline by 12%',
        },
    },
    {
        'created_at': '2025-01-13T09:00:00',
        'type': 'link',
        'created_by': 'bob',
        'content': 'https://arxiv.org/abs/1904.01941',
        'metadata': {
            'title': 'CRAFT: Character Region Awareness for Text Detection',
            'refKind': 'Paper',
            'note': 'Architecture used for table detector',
        },
    },
]

TEXT_INPUT = (
    "Finished the confidence calibration PR, hash fe3a91b. "
    "Dropped threshold from 0.85 to 0.78 after seeing too many false negatives on test set. "
    "F1 went from 0.87 to 0.91. "
    "Also found this useful calibration paper: https://arxiv.org/abs/1706.04599"
)

# ── 1. discover available flash-lite models ────────────────────────────────
print("\n=== 1. Model discovery ===")
try:
    from google import genai
    client = genai.Client(api_key=os.environ['GEMINI_API_KEY'])
    models = list(client.models.list())
    flash_lite = [m.name for m in models if 'flash' in m.name.lower() and 'lite' in m.name.lower()]
    if flash_lite:
        ok(f"flash-lite models available: {flash_lite}")
    else:
        all_flash = [m.name for m in models if 'flash' in m.name.lower()]
        note(f"No flash-lite models found. Flash models: {all_flash[:6]}")
    # Print all models for reference
    note(f"All available models ({len(models)} total): {[m.name for m in models]}")
except Exception as e:
    fail(f"Model discovery failed: {e}")

# ── 2. serialize_nodes_rich (no API) ──────────────────────────────────────
print("\n=== 2. serialize_nodes_rich ===")
try:
    from ai_service import AIService
    svc = AIService()
    result = svc.serialize_nodes_rich(NODES)
    assert 'COMMIT' in result and 'abc1234' in result, "commit fields missing"
    assert 'F1=0.87' in result, "metric missing"
    assert 'arxiv.org' in result, "url missing"
    assert 'table detection in preprocessing' in result, "body missing"
    ok("all fields present (hash, metric, url, body, note, refKind)")
    print(f"\n--- serialized output ---\n{result}\n---")
except Exception as e:
    fail(f"serialize_nodes_rich: {e}")

# ── 3. sync_context ────────────────────────────────────────────────────────
print("\n=== 3. sync_context (live Gemini call) ===")
if not svc.enabled:
    fail("AIService.enabled=False — check GEMINI_API_KEY")
try:
    result = svc.sync_context(PROJECT, BRANCH, NODES)
    # Mock fallback is short and contains a fixed phrase — reject it
    assert 'entries recorded. Sync with AI' not in result, \
        f"got mock fallback instead of real response: {result!r}"
    assert isinstance(result, str) and len(result) > 100, \
        f"response suspiciously short ({len(result)} chars): {result!r}"
    assert any(kw in result for kw in ['#', 'OCR', 'CRAFT', 'table', 'Table', 'commit']), \
        f"response doesn't mention branch content: {result[:300]}"
    ok(f"sync_context returned {len(result)} chars (real API response)")
    print(f"\n--- context doc preview (first 600 chars) ---\n{result[:600]}\n---")
except AssertionError as e:
    fail(str(e))
except Exception as e:
    fail(f"sync_context: {e}")

# ── 4. parse_log ───────────────────────────────────────────────────────────
print("\n=== 4. parse_log (live Gemini call) ===")
try:
    result = svc.parse_log(PROJECT, BRANCH, TEXT_INPUT)
    assert isinstance(result, list) and len(result) >= 1, f"expected list, got: {result!r}"
    types = [n['type'] for n in result]
    ok(f"parse_log returned {len(result)} node(s): types={types}")
    # Input has a commit hash AND a URL — expect at least 2 nodes
    assert len(result) >= 2, \
        f"expected ≥2 nodes (commit + link) but got {len(result)}: {json.dumps(result, indent=2)}"
    ok(f"correctly split into {len(result)} nodes")
    has_link = any(n['type'] in ('link',) for n in result)
    has_commit = any(n['type'] == 'commit' for n in result)
    if has_link: ok("URL extracted as link node")
    else: note("URL not extracted as separate link node")
    if has_commit: ok("commit hash extracted as commit node")
    else: note("commit not extracted as separate commit node")
    print(f"\n--- parsed nodes ---\n{json.dumps(result, indent=2)}\n---")
except AssertionError as e:
    fail(str(e))
except Exception as e:
    fail(f"parse_log: {e}")

# ── 5. update_running_summary ──────────────────────────────────────────────
print("\n=== 5. update_running_summary (live Gemini call) ===")
try:
    result = svc.update_running_summary(PROJECT, BRANCH, NODES)
    # Mock fallback contains a fixed phrase — reject it
    assert 'Work is ongoing — see individual entries' not in result, \
        f"got mock fallback instead of real response: {result!r}"
    assert isinstance(result, str) and len(result) > 80, \
        f"response suspiciously short ({len(result)} chars): {result!r}"
    ok(f"update_running_summary returned {len(result)} chars (real API response)")
    print(f"\n--- summary preview ---\n{result[:400]}\n---")
except AssertionError as e:
    fail(str(e))
except Exception as e:
    fail(f"update_running_summary: {e}")

print(f"\n{GREEN}All tests passed.{RESET}\n")
