from services.scanner.schemas.scan_models import DetectedSheet


def split_pdf_into_sheets(file_name: str) -> list[DetectedSheet]:
    """Temporary deterministic splitter used before full PDF parser integration."""
    return [
        DetectedSheet(sheet_number="E1.1", title="Electrical Power Plan - First Floor", page_number=4),
        DetectedSheet(sheet_number="E2.1", title="Lighting Plan - First Floor", page_number=5),
        DetectedSheet(sheet_number="E3.1", title="Panel and Fixture Schedules", page_number=6),
    ]
