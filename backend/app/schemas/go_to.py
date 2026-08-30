from typing import Literal

from pydantic import BaseModel


class GoToRecordRead(BaseModel):
    entity_type: Literal[
        "risk",
        "control",
        "kri",
        "issue",
        "vendor",
        "process",
        "asset",
        "threat",
    ]
    business_identifier: str | None = None
    display_name: str
    status: str
    destination: str
