from typing import Optional

from pydantic import BaseModel


class AutoEditRequest(BaseModel):
    asset_id: int
    operation: str = "silence_removal"
    margin: float = 0.3
    project_id: Optional[int] = None
