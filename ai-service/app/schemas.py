from typing import Literal

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


class SummarizationSegment(BaseModel):
    """One transcript segment, numbered so the model can cite it."""

    index: int = Field(ge=0)
    text: str


class SummarizationRequest(BaseModel):
    # Segments rather than one blob: every claim the model makes has to name the
    # segments it came from, and it cannot do that without stable numbering.
    segments: list[SummarizationSegment] = Field(min_length=1, max_length=2000)
    language: str | None = Field(default="en", min_length=2, max_length=10)


class KeyDiscussion(BaseModel):
    topic: str
    detail: str
    evidence: list[int] = Field(default_factory=list)


class Decision(BaseModel):
    decision: str
    rationale: str = ""
    evidence: list[int] = Field(default_factory=list)


class ActionItemSuggestion(BaseModel):
    task: str
    owner: str | None = None
    due_date: str | None = None
    priority: Literal["low", "medium", "high"] = "medium"
    evidence: list[int] = Field(default_factory=list)


class LlamaSummary(BaseModel):
    summary: str
    key_discussions: list[KeyDiscussion]
    decisions: list[Decision]
    action_items: list[ActionItemSuggestion]


class SummarizationResponse(LlamaSummary):
    language: str
    model: str
    prompt_version: str
