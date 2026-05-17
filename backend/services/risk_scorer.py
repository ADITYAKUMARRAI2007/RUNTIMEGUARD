import logging

logger = logging.getLogger(__name__)


def compute_risk_score(patch_content: str, sandbox_passed: bool, crash) -> tuple:
    """
    Compute risk score 0-100 (higher = safer).
    Returns (score: int, label: str).
    Never raises.
    """
    score = 100

    # Sandbox result (most important signal)
    if not sandbox_passed:
        score -= 50

    # Lines changed — large patches are riskier
    lines = patch_content.count("\n")
    if lines > 50:
        score -= 10
    elif lines > 30:
        score -= 5

    # Sensitive keywords — touching auth/payment code is riskier
    sensitive_keywords = ["password", "secret", "token", "auth", "payment", "credit"]
    for kw in sensitive_keywords:
        if kw in patch_content.lower():
            score -= 10
            break

    # Hardcoded values — sign of a lazy patch
    if '"unknown"' in patch_content or "'unknown'" in patch_content:
        score -= 15

    # Proper error handling (bonus) — shows the patch is robust
    if "HTTPException" in patch_content or "raise" in patch_content:
        score += 5

    # Clamp to 0-100
    score = max(0, min(100, score))

    # Assign label
    if score >= 80:
        label = "Low Risk"
    elif score >= 50:
        label = "Medium Risk"
    else:
        label = "High Risk"

    logger.info(f"Risk score: {score}/100 ({label})")
    return (score, label)
