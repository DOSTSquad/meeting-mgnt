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
    topic: str = Field(min_length=1, max_length=120)
    detail: str = Field(min_length=1, max_length=400)
    evidence: list[int] = Field(default_factory=list, max_length=4)


class Decision(BaseModel):
    decision: str = Field(min_length=1, max_length=400)
    rationale: str = Field(default="", max_length=400)
    evidence: list[int] = Field(default_factory=list, max_length=4)


class ActionItemSuggestion(BaseModel):
    task: str = Field(min_length=1, max_length=240)
    owner: str | None = Field(default=None, max_length=120)
    due_date: str | None = Field(default=None, max_length=10)
    priority: Literal["low", "medium", "high"] = "medium"
    evidence: list[int] = Field(default_factory=list, max_length=4)


class LlamaSummary(BaseModel):
    summary: str = Field(min_length=1, max_length=1200)
    key_discussions: list[KeyDiscussion] = Field(default_factory=list, max_length=6)
    decisions: list[Decision] = Field(default_factory=list, max_length=6)
    action_items: list[ActionItemSuggestion] = Field(default_factory=list, max_length=8)


class SummarizationResponse(LlamaSummary):
    language: str
    model: str
    prompt_version: str
