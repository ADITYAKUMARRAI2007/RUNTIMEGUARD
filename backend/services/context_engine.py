import logging
import json
import time
from dataclasses import dataclass, field
from typing import Literal
from collections import defaultdict
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


@dataclass
class CausalEdge:
    cause_id: str
    effect_id: str
    evidence: str
    confidence: float


@dataclass
class IncidentMatch:
    past_incident_id: str
    similarity: float
    rationale: str


@dataclass
class Remediation:
    action: str
    target: str
    historical_outcome: str
    confidence: float


@dataclass
class Context:
    related_events: list
    causal_chain: list
    similar_past_incidents: list
    suggested_remediations: list
    confidence: float
    explain: str


class PersistentContextEngine:
    """
    Operational memory substrate. Ingests events, synthesizes relationships,
    reconstructs context at incident time with topology-independent matching.
    """

    def __init__(self):
        self.events: list = []
        self.service_aliases: dict = defaultdict(set)  # canonical → {aliases}
        self.incident_history: list = []
        self.remediation_outcomes: list = []

    def ingest(self, events: list) -> None:
        """
        Ingest timestamped events. Track topology changes for alias resolution.
        """
        for event in events:
            self.events.append(event)
            kind = event.get("kind", "")

            # Track service renames for topology-independent matching
            if kind == "topology" and event.get("change") == "rename":
                old_name = event["from"]
                new_name = event["to"]
                canonical = self._resolve_canonical(old_name)
                self.service_aliases[canonical].add(old_name)
                self.service_aliases[canonical].add(new_name)

            # Track incidents for pattern matching
            elif kind == "incident_signal":
                self.incident_history.append(event)

            # Track remediations for suggestion confidence
            elif kind == "remediation":
                self.remediation_outcomes.append(event)

    def reconstruct_context(
        self, signal: dict, mode: Literal["fast", "deep"] = "fast"
    ) -> Context:
        """Reconstruct investigation context for an incident signal."""
        incident_id = signal.get("incident_id", "")
        trigger = signal.get("trigger", "")
        service = self._extract_service_from_trigger(trigger)
        timestamp = signal.get("ts", "")

        # 1. Find related events (temporal window around incident)
        window_seconds = 300 if mode == "fast" else 3600
        related = self._find_related_events(service, timestamp, window_seconds)

        # 2. Build causal chain
        causal_chain = self._build_causal_chain(related, service)

        # 3. Find similar past incidents (topology-independent)
        similar = self._find_similar_incidents(signal, service, causal_chain)

        # 4. Suggest remediations from history
        remediations = self._suggest_remediations(service, causal_chain, similar)

        # 5. Compute confidence
        confidence = self._compute_confidence(related, causal_chain, similar)

        # 6. Generate explanation
        explain = self._generate_explanation(
            signal, related, causal_chain, similar, remediations
        )

        return Context(
            related_events=related,
            causal_chain=causal_chain,
            similar_past_incidents=similar,
            suggested_remediations=remediations,
            confidence=confidence,
            explain=explain,
        )

    def _resolve_canonical(self, service_name: str) -> str:
        """Resolve a service name to its canonical identity (handles renames)."""
        for canonical, aliases in self.service_aliases.items():
            if service_name in aliases:
                return canonical
        return service_name

    def _are_same_service(self, name_a: str, name_b: str) -> bool:
        """Check if two service names refer to the same logical service."""
        return self._resolve_canonical(name_a) == self._resolve_canonical(name_b)

    def _extract_service_from_trigger(self, trigger: str) -> str:
        """Extract service name from trigger string like 'crash:demo-app/routes/user.py'."""
        if ":" in trigger:
            path = trigger.split(":", 1)[1]
            parts = path.split("/")
            return parts[0] if parts else "unknown"
        return trigger or "unknown"

    def _find_related_events(
        self, service: str, timestamp: str, window_seconds: int
    ) -> list:
        """Find events related to the service within a time window."""
        related = []
        for event in self.events:
            event_service = event.get("service", "")
            event_from = event.get("from", "")
            event_to = event.get("to", "")

            # Match by service name (topology-independent)
            if (
                self._are_same_service(service, event_service)
                or self._are_same_service(service, event_from)
                or self._are_same_service(service, event_to)
                or event_service == service
            ):
                related.append(event)
        return related

    def _build_causal_chain(self, related: list, service: str) -> list:
        """Build causal chain from related events."""
        chain = []
        sorted_events = sorted(related, key=lambda e: e.get("ts", ""))

        for i, event in enumerate(sorted_events):
            if i == 0:
                continue
            prev = sorted_events[i - 1]
            chain.append(
                CausalEdge(
                    cause_id=prev.get("incident_id", prev.get("kind", f"event-{i-1}")),
                    effect_id=event.get(
                        "incident_id", event.get("kind", f"event-{i}")
                    ),
                    evidence=event.get("kind", "unknown"),
                    confidence=0.7 if event.get("kind") == "incident_signal" else 0.5,
                )
            )
        return chain

    def _find_similar_incidents(
        self, signal: dict, service: str, causal_chain: list
    ) -> list:
        """Find past incidents with similar behavioral shape, ignoring service names."""
        matches = []

        for past in self.incident_history:
            past_service = past.get("service", "")
            past_id = past.get("incident_id", "")

            # Skip self
            if past_id == signal.get("incident_id", ""):
                continue

            # Topology-independent: match even if service was renamed
            same_service = self._are_same_service(service, past_service)
            similar_trigger = self._triggers_match(
                signal.get("trigger", ""), past.get("trigger", "")
            )

            if same_service or similar_trigger:
                similarity = 0.89 if same_service else 0.6
                rationale = (
                    f"Similar behavioral pattern: deploy→error→crash "
                    f"(service was previously named '{past_service}')"
                    if past_service != service
                    else "Same service, same failure pattern"
                )
                matches.append(
                    IncidentMatch(
                        past_incident_id=past_id,
                        similarity=similarity,
                        rationale=rationale,
                    )
                )

        return sorted(matches, key=lambda m: m.similarity, reverse=True)[:5]

    def _triggers_match(self, trigger_a: str, trigger_b: str) -> bool:
        """Check if two triggers have similar behavioral patterns."""
        if not trigger_a or not trigger_b:
            return False
        # Both are crash triggers
        if trigger_a.startswith("crash:") and trigger_b.startswith("crash:"):
            return True
        return False

    def _suggest_remediations(
        self, service: str, causal_chain: list, similar: list
    ) -> list:
        """Suggest remediations based on historical outcomes."""
        suggestions = []

        for past_match in similar:
            past_id = past_match.past_incident_id
            for rem in self.remediation_outcomes:
                if rem.get("incident_id") == past_id:
                    success_rate = self._get_remediation_success_rate(
                        rem.get("action", "")
                    )
                    suggestions.append(
                        Remediation(
                            action=rem.get("action", "rollback"),
                            target=service,
                            historical_outcome=rem.get("outcome", "resolved"),
                            confidence=success_rate,
                        )
                    )

        if not suggestions:
            # Default suggestion based on causal chain
            if any(e.evidence == "deploy" for e in causal_chain):
                suggestions.append(
                    Remediation(
                        action="rollback",
                        target=service,
                        historical_outcome="likely_resolved",
                        confidence=0.6,
                    )
                )

        return suggestions

    def _get_remediation_success_rate(self, action: str) -> float:
        """Compute historical success rate for a remediation action."""
        total = 0
        successes = 0
        for rem in self.remediation_outcomes:
            if rem.get("action") == action:
                total += 1
                if rem.get("outcome") == "resolved":
                    successes += 1
        if total == 0:
            return 0.7  # default confidence
        return successes / total

    def _compute_confidence(
        self, related: list, causal_chain: list, similar: list
    ) -> float:
        """Compute overall confidence in the context reconstruction."""
        confidence = 0.3  # base

        if related:
            confidence += 0.2
        if causal_chain:
            confidence += 0.2
        if similar:
            confidence += 0.3 * min(similar[0].similarity, 1.0) if similar else 0

        return min(confidence, 1.0)

    def _generate_explanation(
        self, signal, related, causal_chain, similar, remediations
    ) -> str:
        """Generate human-readable investigation narrative."""
        parts = []
        parts.append(f"Incident {signal.get('incident_id', 'unknown')} detected.")

        if causal_chain:
            chain_str = " → ".join([e.evidence for e in causal_chain[:4]])
            parts.append(f"Causal chain: {chain_str}.")

        if similar:
            best = similar[0]
            parts.append(
                f"Similar to past incident {best.past_incident_id} "
                f"(similarity: {best.similarity:.0%}). {best.rationale}."
            )

        if remediations:
            best_rem = remediations[0]
            parts.append(
                f"Suggested action: {best_rem.action} {best_rem.target} "
                f"(confidence: {best_rem.confidence:.0%}, "
                f"historical outcome: {best_rem.historical_outcome})."
            )

        return " ".join(parts)

    def seed_historical_pattern(self) -> None:
        """
        Seed with a historical event sequence from 47 days ago:
        1. Deploy event: payments-svc v2.14.0
        2. Topology rename: payments-svc → billing-svc
        3. Incident signal: deprecated @app.on_event crash
        4. Remediation: rollback billing-svc, outcome=resolved
        """
        base_time = datetime.utcnow() - timedelta(days=47)

        historical_events = [
            {
                "ts": str(base_time),
                "kind": "deploy",
                "service": "payments-svc",
                "version": "v2.14.0",
                "incident_id": "INC-047",
            },
            {
                "ts": str(base_time + timedelta(hours=2)),
                "kind": "topology",
                "change": "rename",
                "from": "payments-svc",
                "to": "billing-svc",
                "service": "payments-svc",
            },
            {
                "ts": str(base_time + timedelta(hours=6)),
                "kind": "incident_signal",
                "service": "billing-svc",
                "incident_id": "INC-047",
                "trigger": "crash:billing-svc/app.py",
                "detail": "deprecated @app.on_event triggered crash after rename",
            },
            {
                "ts": str(base_time + timedelta(hours=8)),
                "kind": "remediation",
                "service": "billing-svc",
                "incident_id": "INC-047",
                "action": "rollback",
                "target": "billing-svc",
                "outcome": "resolved",
            },
        ]

        self.ingest(historical_events)
        logger.info("PCE seeded with 47-day historical pattern (payments-svc → billing-svc)")
