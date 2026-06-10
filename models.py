from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timezone
import json

db = SQLAlchemy()


class Project(db.Model):
    __tablename__ = 'project'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    context_doc = db.Column(db.Text, default='')
    nodes_since_last_link = db.Column(db.Integer, default=0)
    last_linked_at = db.Column(db.DateTime, nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'created_at': self.created_at.isoformat(),
            'context_doc': self.context_doc or '',
            'nodes_since_last_link': self.nodes_since_last_link or 0,
            'last_linked_at': self.last_linked_at.isoformat() if self.last_linked_at else None,
        }


class User(db.Model):
    __tablename__ = 'user'
    id = db.Column(db.String(50), primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    email = db.Column(db.String(200), nullable=False, unique=True)
    role = db.Column(db.String(20), nullable=False, default='employee')
    github_handle = db.Column(db.String(100))
    slack_username = db.Column(db.String(100), default='')
    color = db.Column(db.String(7), default='#7F77DD')
    initials = db.Column(db.String(5))
    departing = db.Column(db.Boolean, default=False)
    last_day = db.Column(db.String(20))
    password_hash = db.Column(db.String(256), nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'email': self.email,
            'role': self.role,
            'github_handle': self.github_handle or '',
            'slack_username': self.slack_username or '',
            'color': self.color,
            'initials': self.initials or '',
            'departing': self.departing,
            'last_day': self.last_day,
        }


class Branch(db.Model):
    __tablename__ = 'branch'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    slug = db.Column(db.String(50), unique=True)
    parent_branch_id = db.Column(db.Integer, db.ForeignKey('branch.id'), nullable=True)
    created_by = db.Column(db.String(50), db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    archived_at = db.Column(db.DateTime, nullable=True)
    context_doc = db.Column(db.Text, default='')
    running_summary = db.Column(db.Text, default='')
    running_summary_updated_at = db.Column(db.DateTime, nullable=True)
    node_count_since_last_summary = db.Column(db.Integer, default=0)
    context_updating = db.Column(db.Boolean, default=False)
    ai_context = db.Column(db.Text, default='')
    ai_context_updated_at = db.Column(db.DateTime, nullable=True)
    nodes_since_context_sync = db.Column(db.Integer, default=0)

    nodes = db.relationship('Node', backref='branch', lazy=True,
                            foreign_keys='Node.branch_id',
                            order_by='Node.created_at')

    def to_dict(self):
        return {
            'id': self.id,
            'slug': self.slug or str(self.id),
            'name': self.name,
            'parent_branch_id': self.parent_branch_id,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat(),
            'archived_at': self.archived_at.isoformat() if self.archived_at else None,
            'context_doc': self.context_doc or '',
            'running_summary': self.running_summary or '',
            'running_summary_updated_at': (
                self.running_summary_updated_at.isoformat()
                if self.running_summary_updated_at else None
            ),
            'node_count_since_last_summary': self.node_count_since_last_summary,
            'context_updating': self.context_updating,
            'ai_context': self.ai_context or '',
            'ai_context_updated_at': (
                self.ai_context_updated_at.isoformat()
                if self.ai_context_updated_at else None
            ),
            'nodes_since_context_sync': self.nodes_since_context_sync,
        }


class NodeLink(db.Model):
    __tablename__ = 'node_link'
    id = db.Column(db.Integer, primary_key=True)
    from_id = db.Column(db.Integer, db.ForeignKey('node.id'), nullable=False)
    to_id = db.Column(db.Integer, db.ForeignKey('node.id'), nullable=False)
    rel = db.Column(db.String(30), nullable=False, default='implements')
    is_ai = db.Column(db.Boolean, default=True)
    status = db.Column(db.String(20), default='confirmed')  # pending | confirmed | rejected
    description = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    def to_dict(self):
        return {
            'id': self.id,
            'from_id': self.from_id,
            'to_id': self.to_id,
            'rel': self.rel,
            'is_ai': self.is_ai,
            'status': self.status or 'confirmed',
            'description': self.description or '',
            'created_at': self.created_at.isoformat(),
        }


class Contact(db.Model):
    __tablename__ = 'contact'
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('project.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    company = db.Column(db.String(100), default='')
    role = db.Column(db.String(100), default='')
    email = db.Column(db.String(200), default='')
    notes = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    def to_dict(self):
        return {
            'id': self.id,
            'project_id': self.project_id,
            'name': self.name,
            'company': self.company or '',
            'role': self.role or '',
            'email': self.email or '',
            'notes': self.notes or '',
            'created_at': self.created_at.isoformat(),
        }


class InboxSuggestion(db.Model):
    __tablename__ = 'inbox_suggestion'
    id = db.Column(db.Integer, primary_key=True)
    source = db.Column(db.String(20), nullable=False)   # 'git' | 'slack'
    title = db.Column(db.String(200), nullable=False)
    raw_text = db.Column(db.Text, default='')
    nodes_json = db.Column(db.Text, default='[]')
    branch_slug = db.Column(db.String(50), default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    dismissed = db.Column(db.Boolean, default=False)

    @property
    def nodes(self):
        try:
            return json.loads(self.nodes_json or '[]')
        except Exception:
            return []

    def to_dict(self):
        return {
            'id': self.id,
            'source': self.source,
            'title': self.title,
            'raw_text': self.raw_text or '',
            'nodes': self.nodes,
            'branch_slug': self.branch_slug or '',
            'created_at': self.created_at.isoformat(),
        }


class SlackMessage(db.Model):
    __tablename__ = 'slack_message'
    id = db.Column(db.Integer, primary_key=True)
    channel = db.Column(db.String(100), nullable=False)
    user_id = db.Column(db.String(50), db.ForeignKey('user.id'), nullable=True)
    display_name = db.Column(db.String(200), nullable=False)
    text = db.Column(db.Text, nullable=False)
    ts = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    processed = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    def to_dict(self):
        return {
            'id': self.id,
            'channel': self.channel,
            'user_id': self.user_id,
            'display_name': self.display_name,
            'text': self.text,
            'ts': self.ts.isoformat(),
            'processed': self.processed,
        }


class Node(db.Model):
    __tablename__ = 'node'
    id = db.Column(db.Integer, primary_key=True)
    branch_id = db.Column(db.Integer, db.ForeignKey('branch.id'), nullable=False)
    created_by = db.Column(db.String(50), db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    type = db.Column(db.String(20), nullable=False)   # commit|link|note|idea|task
    content = db.Column(db.Text, nullable=False)
    _metadata = db.Column('metadata', db.Text, default='{}')
    assigned_to = db.Column(db.String(50), db.ForeignKey('user.id'), nullable=True)
    assignment_status = db.Column(db.String(20), nullable=True)  # pending|acknowledged|done
    is_ai_generated = db.Column(db.Boolean, default=False)

    @property
    def meta(self):
        try:
            return json.loads(self._metadata or '{}')
        except Exception:
            return {}

    @meta.setter
    def meta(self, value):
        self._metadata = json.dumps(value)

    def to_dict(self):
        m = self.meta
        return {
            'id': self.id,
            'branch_id': self.branch_id,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat(),
            'type': self.type,
            'content': self.content,
            'metadata': m,
            'assigned_to': self.assigned_to,
            'assignment_status': self.assignment_status,
            'is_ai_generated': self.is_ai_generated,
        }
