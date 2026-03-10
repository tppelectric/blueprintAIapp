from services.scanner.pipelines.blueprint_pipeline import (
    classify_symbol_candidates,
    run_blueprint_pipeline,
    split_sheets,
)


def test_mock_mode_split_has_results() -> None:
    sheets = split_sheets(file_name="sample.pdf", mode="mock")
    assert len(sheets) > 0


def test_mock_mode_extract_contains_expected_keys() -> None:
    result = run_blueprint_pipeline(file_name="sample.pdf", sheet_id="E1.1", mode="mock")
    assert "rooms" in result
    assert "symbols" in result
    assert "notes" in result


def test_mock_mode_classify_returns_candidates() -> None:
    candidates = classify_symbol_candidates(symbol_image_ref="symbol.png", mode="mock")
    assert len(candidates) > 0
