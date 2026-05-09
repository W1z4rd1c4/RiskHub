from pydantic import BaseModel


class LinkedVendorRead(BaseModel):
    id: int
    name: str
    is_archived: bool = False

    model_config = {"from_attributes": True}
