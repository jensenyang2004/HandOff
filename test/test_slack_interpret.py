"""
Unit tests for the Slack ingest -> interpret pipeline.

Run:
    .venv/bin/python -m pytest test/test_slack_interpret.py -v

Tests that exercise the real Gemini API (parse_log) are skipped if
GEMINI_API_KEY is not set, since the mock fallback can't satisfy the
structural assertions (multiple node types, empty-array on small talk).
"""
import os
import json
import pytest
from dotenv import load_dotenv

load_dotenv()

THIS_DIR = os.path.dirname(__file__)


@pytest.fixture
def app(tmp_path, monkeypatch):
    db_path = tmp_path / "test_slack.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")

    from app import create_app
    application = create_app()  # create_all() + seeding happens inside

    yield application


@pytest.fixture
def client(app):
    return app.test_client()


def load_messages(filename):
    with open(os.path.join(THIS_DIR, "slack_test_messages", filename)) as f:
        return json.load(f)


def post_messages(client, messages):
    for m in messages:
        r = client.post("/api/webhook/slack", json=m)
        assert r.status_code == 201, r.get_json()


# ── Ingest ──────────────────────────────────────────────────────────────────

def test_webhook_ingest_matches_known_user(client):
    r = client.post("/api/webhook/slack", json={
        "channel": "infra", "user": "diego", "text": "deploy is green again",
    })
    assert r.status_code == 201
    assert "id" in r.get_json()


def test_webhook_requires_channel_user_text(client):
    r = client.post("/api/webhook/slack", json={"channel": "infra", "user": "diego"})
    assert r.status_code == 400


def test_pending_groups_by_channel(client):
    post_messages(client, load_messages("messages_2.json"))

    r = client.get("/api/inbox/slack/pending")
    assert r.status_code == 200
    data = r.get_json()
    assert len(data) == 1
    assert data[0]["channel"] == "infra"
    assert data[0]["count"] == 14
    assert len(data[0]["messages"]) == 14
    assert data[0]["messages"][0]["name"]  # display_name resolved
    assert data[0]["messages"][0]["text"]


# ── Interpret: no pending ────────────────────────────────────────────────────

def test_interpret_with_no_pending_returns_400(client):
    r = client.post("/api/inbox/slack/interpret", json={
        "channel": "nonexistent", "branch_slug": "deploy",
    })
    assert r.status_code == 400


# ── Interpret: real AI calls ────────────────────────────────────────────────

GEMINI_AVAILABLE = bool(os.getenv("GEMINI_API_KEY"))
needs_gemini = pytest.mark.skipif(not GEMINI_AVAILABLE, reason="GEMINI_API_KEY not set")


@needs_gemini
def test_interpret_incident_thread_creates_suggestion(client):
    """A substantive multi-message incident thread should produce >=1 nodes
    and be cleared from pending."""
    post_messages(client, load_messages("messages_2.json"))

    r = client.post("/api/inbox/slack/interpret", json={
        "channel": "infra", "branch_slug": "deploy",
    })
    assert r.status_code == 201
    body = r.get_json()
    assert body["ok"] is True
    assert body["id"] is not None

    inbox = client.get("/api/inbox").get_json()
    item = next(i for i in inbox if i["id"] == body["id"])
    assert item["source"] == "slack"
    assert len(item["nodes"]) >= 1
    assert item["raw_text"]

    # all messages consumed
    pending = client.get("/api/inbox/slack/pending").get_json()
    assert pending == []


@needs_gemini
def test_interpret_small_talk_returns_no_nodes_and_stays_pending(client):
    """Pure small talk shouldn't hallucinate a node, and the messages
    should remain unprocessed for the next interpret."""
    post_messages(client, [
        {"channel": "random", "user": "jensen", "text": "anyone want to grab lunch later?"},
        {"channel": "random", "user": "maya", "text": "sure! how about 12:30 at the usual place"},
    ])

    r = client.post("/api/inbox/slack/interpret", json={
        "channel": "random", "branch_slug": "deploy",
    })
    assert r.status_code == 200
    body = r.get_json()
    assert body == {"ok": True, "id": None, "nodes": []}

    # messages were NOT marked processed
    pending = client.get("/api/inbox/slack/pending").get_json()
    assert pending == [{"channel": "random", "count": 2, "messages": pending[0]["messages"]}]
    assert pending[0]["count"] == 2


@needs_gemini
def test_interpret_mixed_signal_thread(client):
    """messages_1.json mixes a real architectural decision with off-topic
    coffee chat — the decision should still be extracted."""
    msgs = [m for m in load_messages("messages_1.json") if m["channel"] == "ml-team"]
    post_messages(client, msgs)

    r = client.post("/api/inbox/slack/interpret", json={
        "channel": "ml-team", "branch_slug": "train",
    })
    assert r.status_code == 201
    body = r.get_json()

    inbox = client.get("/api/inbox").get_json()
    item = next(i for i in inbox if i["id"] == body["id"])
    types = [n["type"] for n in item["nodes"]]
    assert len(types) >= 1
    # the thread explicitly says "we decided to switch the backbone..."
    assert "decision" in types
