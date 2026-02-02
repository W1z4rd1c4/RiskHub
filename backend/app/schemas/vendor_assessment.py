from __future__ import annotations

from enum import Enum
from datetime import datetime

from pydantic import BaseModel, Field


class VendorAssessmentStatusEnum(str, Enum):
    draft = "draft"
    submitted = "submitted"
    in_review = "in_review"
    committee_recommended = "committee_recommended"
    approved = "approved"
    rejected = "rejected"


class VendorAssessmentScopeEnum(str, Enum):
    standard = "standard"
    dora = "dora"


class VendorCommitteeRecommendationEnum(str, Enum):
    approve = "approve"
    approve_with_conditions = "approve_with_conditions"
    reject = "reject"


class VendorAssessmentRead(BaseModel):
    id: int
    vendor_id: int

    status: VendorAssessmentStatusEnum
    template_key: str
    template_version: str
    scope: VendorAssessmentScopeEnum

    answers_json: dict | None = None
    evidence_reference: str | None = None

    submitted_at: datetime | None = None
    reviewed_at: datetime | None = None
    decision_at: datetime | None = None

    submitted_by_user_id: int | None = None
    reviewed_by_user_id: int | None = None
    decided_by_user_id: int | None = None

    committee_recommendation: VendorCommitteeRecommendationEnum | None = None
    conditions_text: str | None = None

    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class VendorAssessmentCreate(BaseModel):
    """Create a new draft assessment."""

    template_version: str = Field("v1", max_length=20)


class VendorAssessmentDraftUpdate(BaseModel):
    answers_json: dict | None = None
    evidence_reference: str | None = None


class VendorAssessmentReview(BaseModel):
    """2nd line review payload."""

    notes: str | None = None


class VendorAssessmentCommitteeRecommend(BaseModel):
    committee_recommendation: VendorCommitteeRecommendationEnum
    conditions_text: str | None = None


class VendorAssessmentDecide(BaseModel):
    decision: VendorAssessmentStatusEnum
    decision_notes: str | None = None

    @staticmethod
    def _allowed_decisions() -> set[str]:
        return {"approved", "rejected"}

    def model_post_init(self, __context) -> None:
        if self.decision.value not in self._allowed_decisions():
            raise ValueError("decision must be approved or rejected")

