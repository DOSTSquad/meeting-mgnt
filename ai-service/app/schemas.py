from pydantic import BaseModel, Field


class TranscriptSegment(BaseModel):
    id: int
    start: float = Field(ge=0)
    end: float = Field(ge=0)
    text: str


class TranscriptionResponse(BaseModel):
    text: str
    language: str | None = None
    duration_seconds: float | None = Field(default=None, ge=0)
    segments: list[TranscriptSegment]
    model: str


class SummarizationRequest(BaseModel):
    transcript: str = Field(min_length=1, max_length=24000)
    language: str | None = Field(default="en", min_length=2, max_length=10)


class ActionItemSuggestion(BaseModel):
    task: str
    owner: str | None = None
    due_date: str | None = None


class LlamaSummary(BaseModel):
    summary: str
    key_points: list[str]
    decisions: list[str]
    action_items: list[ActionItemSuggestion]


class SummarizationResponse(LlamaSummary):
    language: str
    model: str
