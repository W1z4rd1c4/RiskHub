from pydantic import BaseModel


class LinkedVendorRead(BaseModel):
    id: int
    name: str
    status: str | None = None
    is_archived: bool = False

    model_config = {"from_attributes": True}
