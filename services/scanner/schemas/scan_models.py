from typing import Literal

from pydantic import BaseModel, Field

ScanMode = Literal["mock", "real"]


class SplitSheetsRequest(BaseModel):
    project_id: str = Field(min_length=1)
    file_name: str = Field(min_length=1)
    scan_mode: ScanMode = "mock"


class DetectedSheet(BaseModel):
    sheet_number: str
    title: str
    page_number: int


class ExtractRequest(BaseModel):
    project_id: str = Field(min_length=1)
    sheet_id: str = Field(min_length=1)
    file_name: str = Field(min_length=1)
    scan_mode: ScanMode = "mock"
    ai_second_pass: bool = False


class ClassifySymbolRequest(BaseModel):
    project_id: str = Field(min_length=1)
    symbol_image_ref: str = Field(min_length=1)
    scan_mode: ScanMode = "mock"


class CandidateMatch(BaseModel):
    symbol_type: str
    score: float


class ScanExtractionResult(BaseModel):
    sheets: list[dict]
    rooms: list[dict]
    symbols: list[dict]
    notes: list[dict]
    legends: list[dict]
    panel_schedule: list[dict]
    fixture_schedule: list[dict]
    detected_scale: str | None = None
    scale_source: str | None = None
    scale_needs_input: bool = False
