"""
Integration tests for User Authentication (Registration / Login)
and Project Branch / Node CRUD operations.

Run:
    .venv/bin/python -m pytest test/test_auth_and_branches.py -v
"""
import pytest

@pytest.fixture
def app(tmp_path, monkeypatch):
    db_path = tmp_path / "test_auth_branch.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")

    from app import create_app
    application = create_app()
    yield application

@pytest.fixture
def client(app):
    return app.test_client()

# ── Authentication Tests ──────────────────────────────────────────────────────

def test_register_success(client):
    r = client.post("/api/auth/register", json={
        "name": "Test User",
        "email": "test@example.com",
        "password": "securepassword123",
        "github_handle": "testuser",
        "slack_username": "test.user"
    })
    assert r.status_code == 201
    data = r.get_json()
    assert data["name"] == "Test User"
    assert data["email"] == "test@example.com"
    assert "password_hash" not in data  # password hash should not be in the dictionary
    assert data["role"] == "employee"

def test_register_missing_fields(client):
    r = client.post("/api/auth/register", json={
        "name": "Test User",
        # missing email and password
    })
    assert r.status_code == 400
    assert "error" in r.get_json()

def test_register_short_password(client):
    r = client.post("/api/auth/register", json={
        "name": "Test User",
        "email": "test@example.com",
        "password": "123",
    })
    assert r.status_code == 400
    assert "password must be at least 6 characters" in r.get_json()["error"]

def test_login_success(client):
    # First register a user
    client.post("/api/auth/register", json={
        "name": "Login User",
        "email": "login@example.com",
        "password": "mypassword",
    })

    # Try login
    r = client.post("/api/auth/login", json={
        "email": "login@example.com",
        "password": "mypassword"
    })
    assert r.status_code == 200
    data = r.get_json()
    assert data["email"] == "login@example.com"
    assert data["name"] == "Login User"

def test_login_invalid_credentials(client):
    # Try logging in with unregistered email
    r = client.post("/api/auth/login", json={
        "email": "nonexistent@example.com",
        "password": "password"
    })
    assert r.status_code == 401
    assert "invalid credentials" in r.get_json()["error"]

# ── Branch / Node CRUD Tests ──────────────────────────────────────────────────

def test_create_and_get_branch(client):
    r = client.post("/api/branches", json={
        "name": "Feature Auth Branch",
        "created_by": "jensen",
        "context_doc": "Implementing JWT auth"
    })
    assert r.status_code == 201
    branch = r.get_json()
    assert branch["name"] == "Feature Auth Branch"
    assert branch["slug"] == "feature-auth-branch"
    assert branch["parent_branch_id"] is None

    # Get branches list and check if our new branch is in it
    r_list = client.get("/api/branches")
    assert r_list.status_code == 200
    branches = r_list.get_json()
    assert any(b["id"] == branch["id"] for b in branches)

def test_create_branch_missing_name(client):
    r = client.post("/api/branches", json={
        "created_by": "jensen"
    })
    assert r.status_code == 400
    assert "name is required" in r.get_json()["error"]

def test_create_node_on_branch(client):
    # 1. Create a branch first
    r_branch = client.post("/api/branches", json={
        "name": "Database Migration Branch",
        "created_by": "jensen"
    })
    assert r_branch.status_code == 201
    branch_id = r_branch.get_json()["id"]

    # 2. Add a node to the branch
    r_node = client.post("/api/nodes", json={
        "branch_id": branch_id,
        "type": "decision",
        "content": "Migrate to PostgreSQL",
        "metadata": {
            "title": "Migrate to PostgreSQL",
            "rationale": "Better concurrent read/write and scalability."
        },
        "created_by": "jensen"
    })
    assert r_node.status_code == 201
    node = r_node.get_json()
    assert node["branch_id"] == branch_id
    assert node["type"] == "decision"
    assert node["content"] == "Migrate to PostgreSQL"
    assert node["metadata"]["rationale"] == "Better concurrent read/write and scalability."

    # 3. Retrieve nodes for this branch
    r_nodes = client.get(f"/api/nodes?branch_id={branch_id}")
    assert r_nodes.status_code == 200
    nodes = r_nodes.get_json()
    assert len(nodes) == 1
    assert nodes[0]["id"] == node["id"]
