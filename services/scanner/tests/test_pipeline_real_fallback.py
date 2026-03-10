from services.scanner.pipelines.blueprint_pipeline import (
    classify_symbol_candidates,
    run_blueprint_pipeline,
    split_sheets,
)


def test_real_mode_split_with_missing_file_returns_empty() -> None:
    sheets = split_sheets(file_name="missing.pdf", mode="real")
    assert sheets == []


def test_real_mode_extract_with_missing_file_has_structured_output() -> None:
    result = run_blueprint_pipeline(file_name="missing.pdf", sheet_id="E1.1", mode="real")
    assert "rooms" in result
    assert "symbols" in result


def test_real_mode_classify_with_missing_image_returns_ranked_candidates() -> None:
    candidates = classify_symbol_candidates(symbol_image_ref="missing.png", mode="real")
    assert len(candidates) == 3
