from services.scanner.detectors.room_detector import detect_rooms
from services.scanner.detectors.symbol_detector import classify_symbol, detect_symbols
from services.scanner.ocr.notes_extractor import extract_notes
from services.scanner.pdf.splitter import split_pdf_into_sheets
from services.scanner.pipelines.interfaces import ScannerAdapter


class MockScannerAdapter(ScannerAdapter):
    """Deterministic mock scanner for stable end-to-end workflow testing."""

    def split_sheets(self, file_name: str):
        return split_pdf_into_sheets(file_name)

    def extract(self, file_name: str, sheet_id: str) -> dict:
        sheets = self.split_sheets(file_name)
        rooms = detect_rooms()
        symbols = detect_symbols()
        notes = extract_notes()

        return {
            "sheets": [sheet.model_dump() for sheet in sheets],
            "rooms": rooms,
            "symbols": symbols,
            "notes": notes,
            "legends": [
                {"symbol_key": "L-A", "description": "Ceiling light fixture"},
                {"symbol_key": "WP-CAM", "description": "Exterior weatherproof camera"},
            ],
            "panel_schedule": [{"panel": "LP-1", "circuits": 24}],
            "fixture_schedule": [{"fixture": "Type A", "quantity": 22}],
            "detected_scale": '1/4" = 1\'-0"',
            "scale_source": "mock_default",
            "scale_needs_input": False,
        }

    def classify_symbol(self, symbol_image_ref: str) -> list[dict[str, str | float]]:
        return classify_symbol(symbol_image_ref)
