def detect_symbols() -> list[dict[str, str | float | bool]]:
    return [
        {"room": "Bedroom 1", "type": "outlet", "confidence": 0.99, "needs_review": False},
        {"room": "Kitchen", "type": "light", "confidence": 0.83, "needs_review": True, "legend_match": "L-A"},
        {"room": "Garage", "type": "camera", "confidence": 0.88, "needs_review": True, "legend_match": "WP-CAM"},
        {"room": "Living Room", "type": "dimmer", "confidence": 0.92, "needs_review": False},
    ]


def classify_symbol(symbol_image_ref: str) -> list[dict[str, str | float]]:
    return [
        {"symbol_type": "light", "score": 0.62},
        {"symbol_type": "recessed_light", "score": 0.27},
        {"symbol_type": "fan", "score": 0.11},
    ]
