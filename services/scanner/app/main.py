import pytesseract
from fastapi import FastAPI, HTTPException
from pdf2image.exceptions import PDFInfoNotInstalledError

from services.scanner.errors import ScannerDependencyError
from services.scanner.pipelines.blueprint_pipeline import (
    classify_symbol_candidates,
    run_blueprint_pipeline,
    split_sheets,
)
from services.scanner.schemas.scan_models import (
    ClassifySymbolRequest,
    ExtractRequest,
    SplitSheetsRequest,
)
from services.scanner.storage.file_resolver import materialize_file_ref

app = FastAPI(title="Scanner Service", version="0.2.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "scanner",
    }


@app.post("/scan/split-sheets")
def split_sheets_endpoint(payload: SplitSheetsRequest) -> dict:
    with materialize_file_ref(payload.file_name) as local_file_name:
        sheets = split_sheets(file_name=local_file_name, mode=payload.scan_mode)
    return {"project_id": payload.project_id, "scan_mode": payload.scan_mode, "sheets": sheets}


@app.post("/scan/extract")
def extract(payload: ExtractRequest) -> dict:
    try:
        with materialize_file_ref(payload.file_name) as local_file_name:
            result = run_blueprint_pipeline(
                file_name=local_file_name,
                sheet_id=payload.sheet_id,
                mode=payload.scan_mode,
                ai_second_pass=payload.ai_second_pass,
            )
    except (ScannerDependencyError, PDFInfoNotInstalledError, pytesseract.TesseractNotFoundError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"project_id": payload.project_id, "sheet_id": payload.sheet_id, "scan_mode": payload.scan_mode, **result}


@app.post("/scan/classify-symbol")
def classify(payload: ClassifySymbolRequest) -> dict:
    with materialize_file_ref(payload.symbol_image_ref) as local_image_ref:
        candidates = classify_symbol_candidates(local_image_ref, mode=payload.scan_mode)
    return {
        "project_id": payload.project_id,
        "scan_mode": payload.scan_mode,
        "symbol_image_ref": payload.symbol_image_ref,
        "candidates": candidates,
    }
