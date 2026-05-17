import logging

logger = logging.getLogger(__name__)


def check_patch_policy(patch_content: str, crash) -> tuple:
    """
    Check if a patch is safe to deploy based on policy rules.
    Returns (is_safe: bool, rejection_reasons: list[str]).
    Never raises.

    For the demo: Patch 1 should be rejected because it still has
    data['user_id'] without .get() — meaning it doesn't validate input.
    """
    reasons = []

    # Rule 1: Check for hardcoded dummy values
    dummy_patterns = ['= "unknown"', "= 'unknown'"]
    for pattern in dummy_patterns:
        if pattern in patch_content:
            reasons.append(f"Introduces hardcoded dummy value: {pattern}")

    # Rule 2: Check for broad exception handling without re-raise
    if "except Exception:" in patch_content or "except:" in patch_content:
        # Look at the except block — if there's no raise within 200 chars after except
        parts = patch_content.split("except")
        for part in parts[1:]:
            block = part[:200]
            if "raise" not in block:
                reasons.append("Adds broad except without re-raise (swallows errors)")
                break

    # Rule 3: Root function must be present in patch
    if crash.function_name and crash.function_name != "unknown":
        if crash.function_name not in patch_content:
            reasons.append(
                f"Does not modify the crashing function: {crash.function_name}"
            )

    # Rule 4: Direct dict access without .get() — key validation missing
    if "data['user_id']" in patch_content or 'data["user_id"]' in patch_content:
        if "data.get(" not in patch_content:
            reasons.append(
                "Does not validate input field existence (still uses direct dict access)"
            )

    is_safe = len(reasons) == 0
    if not is_safe:
        logger.info(f"Patch rejected: {reasons}")
    else:
        logger.info("Patch passed policy check")

    return (is_safe, reasons)
