"""
Knowledge memory - stores and retrieves solved incident patterns.
Uses SQLite directly for simplicity.
"""
import json
import logging
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

DB_PATH = Path("runtimeguard.db")


def _get_conn():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_knowledge_table():
    """Create knowledge_patterns table if not exists."""
    with _get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS knowledge_patterns (
                pattern_id TEXT PRIMARY KEY,
                incident_type TEXT NOT NULL,
                root_cause TEXT,
                evidence_signature TEXT,
                fix_strategy TEXT,
                files_changed_pattern TEXT,
                test_strategy TEXT,
                success_count INTEGER DEFAULT 0,
                last_seen_at TEXT
            )
        """)
        conn.commit()


def store_pattern(incident_type: str, root_cause: str, evidence_signature: str, fix_strategy: str, files_pattern: str, test_strategy: str) -> str:
    """Store a solved incident pattern. Returns pattern_id."""
    init_knowledge_table()

    # Create a signature-based ID
    pattern_id = f"{incident_type}_{hash(evidence_signature) % 100000:05d}"

    with _get_conn() as conn:
        existing = conn.execute("SELECT pattern_id, success_count FROM knowledge_patterns WHERE pattern_id = ?", (pattern_id,)).fetchone()

        if existing:
            conn.execute(
                "UPDATE knowledge_patterns SET success_count = ?, last_seen_at = ? WHERE pattern_id = ?",
                (existing['success_count'] + 1, datetime.utcnow().isoformat(), pattern_id)
            )
        else:
            conn.execute("""
                INSERT INTO knowledge_patterns
                (pattern_id, incident_type, root_cause, evidence_signature, fix_strategy, files_changed_pattern, test_strategy, success_count, last_seen_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
            """, (pattern_id, incident_type, root_cause, evidence_signature, fix_strategy, files_pattern, test_strategy, datetime.utcnow().isoformat()))

        conn.commit()

    logger.info(f"Knowledge pattern stored: {pattern_id}")
    return pattern_id


def find_similar(incident_type: str, evidence_signature: str) -> Optional[Dict[str, Any]]:
    """Find a similar previously solved incident."""
    init_knowledge_table()

    with _get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM knowledge_patterns WHERE incident_type = ? ORDER BY success_count DESC LIMIT 1",
            (incident_type,)
        ).fetchone()

        if row:
            return dict(row)
    return None


def get_all_patterns() -> list:
    """Return all stored patterns."""
    init_knowledge_table()
    with _get_conn() as conn:
        rows = conn.execute("SELECT * FROM knowledge_patterns ORDER BY last_seen_at DESC").fetchall()
        return [dict(r) for r in rows]
