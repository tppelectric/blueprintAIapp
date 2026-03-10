from services.scanner.pipelines.factory import get_scanner_adapter
from services.scanner.schemas.scan_models import ScanMode


def split_sheets(file_name: str, mode: ScanMode = "mock") -> list[dict]:
    adapter = get_scanner_adapter(mode)
    return [sheet.model_dump() for sheet in adapter.split_sheets(file_name)]


def run_blueprint_pipeline(file_name: str, sheet_id: str, mode: ScanMode = "mock") -> dict:
    adapter = get_scanner_adapter(mode)
    return adapter.extract(file_name=file_name, sheet_id=sheet_id)


def classify_symbol_candidates(symbol_image_ref: str, mode: ScanMode = "mock") -> list[dict[str, str | float]]:
    adapter = get_scanner_adapter(mode)
    return adapter.classify_symbol(symbol_image_ref)
