from services.scanner.detectors.yolo_symbol_detector import SymbolDetectionResult
from services.scanner.pipelines.adapters.real_adapter import RealScannerAdapter


def test_extract_symbols_prefers_cv_detections() -> None:
    adapter = RealScannerAdapter()
    adapter.symbol_detector.detect_blueprint_symbols = lambda _file: [
        SymbolDetectionResult(symbol_type="outlet", confidence=0.91, page=1, bbox=(1, 1, 10, 10)),
        SymbolDetectionResult(symbol_type="switch", confidence=0.82, page=1, bbox=(11, 11, 20, 20)),
    ]

    symbols = adapter._extract_symbols(
        file_name="sample.pdf",
        page_text="room text with no keyword symbols",
        rooms=[{"name": "Kitchen", "area_sq_ft": 120}, {"name": "Hallway", "area_sq_ft": 60}],
    )

    assert len(symbols) == 2
    assert symbols[0]["type"] == "outlet"
    assert symbols[0]["room"] == "Kitchen"
    assert symbols[0]["needs_review"] is False
    assert symbols[1]["type"] == "switch"
    assert symbols[1]["room"] == "Hallway"
    assert symbols[1]["needs_review"] is True


def test_extract_symbols_falls_back_to_keyword_heuristic() -> None:
    adapter = RealScannerAdapter()
    adapter.symbol_detector.detect_blueprint_symbols = lambda _file: []

    symbols = adapter._extract_symbols(
        file_name="sample.pdf",
        page_text="kitchen has receptacle and switch and fixture",
        rooms=[{"name": "Kitchen", "area_sq_ft": 120}],
    )

    symbol_types = {str(symbol["type"]) for symbol in symbols}
    assert "outlet" in symbol_types
    assert "switch" in symbol_types
    assert "light" in symbol_types
