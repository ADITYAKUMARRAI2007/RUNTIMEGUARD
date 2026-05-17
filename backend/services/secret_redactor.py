import re
import logging
from typing import Tuple

logger = logging.getLogger(__name__)

PATTERNS = [
    # AWS keys
    (r"AKIA[0-9A-Z]{16}", "aws_access_key"),
    (r"(?i)(aws_secret_access_key|aws_secret)\s*=\s*['\"]?[A-Za-z0-9/+=]{40}", "aws_secret_key"),
    # GitHub tokens
    (r"gh[ps]_[A-Za-z0-9_]{36,}", "github_token"),
    (r"github_pat_[A-Za-z0-9_]{22,}", "github_pat"),
    # Stripe
    (r"sk_live_[A-Za-z0-9]{24,}", "stripe_secret"),
    (r"sk_test_[A-Za-z0-9]{24,}", "stripe_test"),
    # Generic passwords
    (r"(?i)(password|passwd|secret|pwd)\s*=\s*['\"][^'\"]+['\"]", "password_assignment"),
    # Bearer tokens
    (r"Bearer\s+[A-Za-z0-9\-._~+/]+=*", "bearer_token"),
    # Connection strings
    (r"(?i)(postgres|mysql|mongodb|redis)://[^\s'\"]+", "connection_string"),
    # Email addresses
    (r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", "email"),
    # Credit card numbers (basic)
    (r"\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b", "credit_card"),
]


def redact(source_code: str, file_path: str) -> Tuple[str, list]:
    """
    Replace secrets with [REDACTED]. Returns (redacted_code, events).
    Never raises — returns original code on error.
    """
    logger.info(f"Redacting secrets in {file_path}")
    events = []
    try:
        redacted = source_code
        for pattern, category in PATTERNS:
            for match in re.finditer(pattern, redacted):
                line_num = redacted[:match.start()].count('\n') + 1
                events.append({
                    "file": file_path,
                    "line": line_num,
                    "category": category,
                })
                redacted = redacted[:match.start()] + "[REDACTED]" + redacted[match.end():]

        if events:
            logger.info(f"Redacted {len(events)} secrets in {file_path}")
        return redacted, events
    except Exception as e:
        logger.warning(f"Redaction failed for {file_path}: {e}")
        return source_code, []
