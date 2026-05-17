import json
import logging
from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.incident import Incident
from backend.models.patch import Patch

logger = logging.getLogger(__name__)
router = APIRouter()


class PatchResponse(BaseModel):
    id: str
    candidate_num: int
    patch_content: str
    rejected: bool
    rejection_reasons: Optional[str] = None
    sandbox_status: str
    sandbox_output: Optional[str] = None
    risk_score: Optional[int] = None
    risk_label: Optional[str] = None
    selected: bool

    class Config:
        from_attributes = True


class IncidentResponse(BaseModel):
    id: str
    created_at: str
    exception_type: str
    exception_msg: str
    file_path: Optional[str] = None
    line_number: Optional[int] = None
    function_name: Optional[str] = None
    endpoint: Optional[str] = None
    request_payload: Optional[str] = None
    suspected_cause: Optional[str] = None
    severity: Optional[str] = None
    root_cause_explanation: Optional[str] = None
    replay_test_code: Optional[str] = None
    replay_test_before_result: Optional[str] = None
    status: str
    failure_reason: Optional[str] = None
    pr_url: Optional[str] = None
    pr_number: Optional[int] = None
    was_preventable: bool = False
    preventable_pr_number: Optional[int] = None
    preventable_pr_days_ago: Optional[int] = None
    pce_explain: Optional[str] = None
    pce_similar_incidents: Optional[str] = None
    pce_suggested_remediations: Optional[str] = None
    pce_causal_chain: Optional[str] = None
    patches: list[PatchResponse] = []

    class Config:
        from_attributes = True


@router.get("")
async def list_incidents(db: Session = Depends(get_db)):
    """Get all incidents ordered by created_at DESC with patches."""
    incidents = db.query(Incident).order_by(Incident.created_at.desc()).all()
    results = []
    for inc in incidents:
        inc_dict = {
            "id": inc.id,
            "created_at": str(inc.created_at) if inc.created_at else "",
            "exception_type": inc.exception_type,
            "exception_msg": inc.exception_msg,
            "file_path": inc.file_path,
            "line_number": inc.line_number,
            "function_name": inc.function_name,
            "endpoint": inc.endpoint,
            "request_payload": inc.request_payload,
            "suspected_cause": inc.suspected_cause,
            "severity": inc.severity,
            "root_cause_explanation": inc.root_cause_explanation,
            "replay_test_code": inc.replay_test_code,
            "replay_test_before_result": inc.replay_test_before_result,
            "status": inc.status,
            "failure_reason": inc.failure_reason,
            "pr_url": inc.pr_url,
            "pr_number": inc.pr_number,
            "was_preventable": inc.was_preventable or False,
            "preventable_pr_number": inc.preventable_pr_number,
            "preventable_pr_days_ago": inc.preventable_pr_days_ago,
            "pce_explain": inc.pce_explain,
            "pce_similar_incidents": inc.pce_similar_incidents,
            "pce_suggested_remediations": inc.pce_suggested_remediations,
            "pce_causal_chain": inc.pce_causal_chain,
            "patches": [
                {
                    "id": p.id,
                    "candidate_num": p.candidate_num,
                    "patch_content": p.patch_content,
                    "rejected": p.rejected or False,
                    "rejection_reasons": p.rejection_reasons,
                    "sandbox_status": p.sandbox_status or "pending",
                    "sandbox_output": p.sandbox_output,
                    "risk_score": p.risk_score,
                    "risk_label": p.risk_label,
                    "selected": p.selected or False,
                }
                for p in (inc.patches or [])
            ],
        }
        results.append(inc_dict)
    return results


@router.get("/{incident_id}")
async def get_incident(incident_id: str, db: Session = Depends(get_db)):
    """Get full incident detail with patches."""
    incident = db.query(Incident).filter_by(id=incident_id).first()
    if not incident:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Incident not found")

    return {
        "id": incident.id,
        "created_at": str(incident.created_at) if incident.created_at else "",
        "exception_type": incident.exception_type,
        "exception_msg": incident.exception_msg,
        "file_path": incident.file_path,
        "line_number": incident.line_number,
        "function_name": incident.function_name,
        "endpoint": incident.endpoint,
        "request_payload": incident.request_payload,
        "suspected_cause": incident.suspected_cause,
        "severity": incident.severity,
        "root_cause_explanation": incident.root_cause_explanation,
        "replay_test_code": incident.replay_test_code,
        "replay_test_before_result": incident.replay_test_before_result,
        "status": incident.status,
        "failure_reason": incident.failure_reason,
        "pr_url": incident.pr_url,
        "pr_number": incident.pr_number,
        "was_preventable": incident.was_preventable or False,
        "preventable_pr_number": incident.preventable_pr_number,
        "preventable_pr_days_ago": incident.preventable_pr_days_ago,
        "pce_explain": incident.pce_explain,
        "pce_similar_incidents": incident.pce_similar_incidents,
        "pce_suggested_remediations": incident.pce_suggested_remediations,
        "pce_causal_chain": incident.pce_causal_chain,
        "patches": [
            {
                "id": p.id,
                "candidate_num": p.candidate_num,
                "patch_content": p.patch_content,
                "rejected": p.rejected or False,
                "rejection_reasons": p.rejection_reasons,
                "sandbox_status": p.sandbox_status or "pending",
                "sandbox_output": p.sandbox_output,
                "risk_score": p.risk_score,
                "risk_label": p.risk_label,
                "selected": p.selected or False,
            }
            for p in (incident.patches or [])
        ],
    }
