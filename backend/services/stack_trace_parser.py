import json
import logging
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

ERROR_CATEGORIES = {
    "KeyError": "missing_field",
    "TypeError": "null_access",
    "AttributeError": "null_access",
    "ValidationError": "schema_mismatch",
    "ImportError": "import_failure",
    "ModuleNotFoundError": "dependency_breakage",
    "ConnectionError": "api_contract_mismatch",
    "TimeoutError": "api_contract_mismatch",
}


@dataclass
class ParsedCrash:
    exception_type: str = "Unknown"
    exception_message: str = ""
    primary_file: str = "unknown"
    line_number: int = 0
    function_name: str = "unknown"
    endpoint: str = ""
    request_payload: str = "{}"
    related_files: list = field(default_factory=list)
    raw_trace: str = ""
    error_category: str = "unknown"
    suspected_cause: str = ""


def parse_crash(payload: dict) -> ParsedCrash:
    """Parse crash payload into structured bundle. Never raises."""
    logger.info("Parsing crash payload")
    try:
        frames = payload.get("stacktrace", [])
        user_frames = [f for f in frames if not _is_library_frame(f)]
        primary = user_frames[0] if user_frames else {}

        exception_type = payload.get("exception_type", "Unknown")
        exception_message = payload.get("exception_message", "")

        result = ParsedCrash(
            exception_type=exception_type,
            exception_message=exception_message,
            primary_file=primary.get("file", "unknown"),
            line_number=primary.get("line", 0),
            function_name=primary.get("function", "unknown"),
            endpoint=payload.get("endpoint", ""),
            request_payload=json.dumps(payload.get("payload", {})),
            related_files=[f.get("file", "") for f in user_frames[1:]],
            raw_trace=json.dumps(frames),
            error_category=ERROR_CATEGORIES.get(exception_type, "unknown"),
            suspected_cause=_generate_suspected_cause(exception_type, exception_message),
        )
        logger.info(f"Parsed crash: {result.exception_type} in {result.primary_file}:{result.line_number}")
        return result
    except Exception as e:
        logger.warning(f"Error parsing crash, returning defaults: {e}")
        return ParsedCrash(
            exception_type=payload.get("exception_type", "Unknown"),
            exception_message=payload.get("exception_message", ""),
        )


def _is_library_frame(frame: dict) -> bool:
    """Check if a stack frame is from a library (not user code)."""
    file_path = frame.get("file", "")
    library_indicators = [
        "site-packages",
        "venv/",
        ".venv/",
        "/lib/python",
        "\\lib\\python",
        "<frozen",
        "importlib",
        "asyncio/",
    ]
    return any(indicator in file_path for indicator in library_indicators)


def _generate_suspected_cause(error_type: str, message: str) -> str:
    """Generate a human-readable suspected cause."""
    if error_type == "KeyError":
        key = message.strip("'\"")
        return f"missing required request field '{key}'"
    elif error_type == "TypeError" and "NoneType" in message:
        return "accessing attribute on None value"
    elif error_type == "AttributeError":
        return f"accessing non-existent attribute: {message}"
    elif error_type == "ImportError" or error_type == "ModuleNotFoundError":
        return f"missing dependency: {message}"
    elif error_type == "ValidationError":
        return "request payload does not match expected schema"
    return f"unhandled {error_type}: {message}"
