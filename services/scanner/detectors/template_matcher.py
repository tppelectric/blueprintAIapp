from __future__ import annotations

import base64
from dataclasses import dataclass

import cv2
import numpy as np


@dataclass
class TemplateCandidate:
    symbol_id: str
    symbol_class: str | None
    symbol_image_b64: str
    symbol_description: str


@dataclass
class TemplateMatchResult:
    symbol_id: str
    symbol_class: str | None
    score: float
    symbol_description: str


def _decode_template_image(image_b64: str) -> np.ndarray | None:
    try:
        raw = base64.b64decode(image_b64)
        arr = np.frombuffer(raw, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
        return img
    except Exception:
        return None


def _normalize(image: np.ndarray, size: int = 64) -> np.ndarray:
    resized = cv2.resize(image, (size, size), interpolation=cv2.INTER_AREA)
    return resized


def match_symbol_to_templates(
    symbol_crop: np.ndarray, templates: list[TemplateCandidate]
) -> TemplateMatchResult | None:
    if symbol_crop.size == 0 or len(templates) == 0:
        return None

    if len(symbol_crop.shape) == 3:
        source = cv2.cvtColor(symbol_crop, cv2.COLOR_BGR2GRAY)
    else:
        source = symbol_crop
    source_norm = _normalize(source)

    best: TemplateMatchResult | None = None
    for template in templates:
        template_img = _decode_template_image(template.symbol_image_b64)
        if template_img is None or template_img.size == 0:
            continue
        template_norm = _normalize(template_img)

        # Correlation score in [-1, 1].
        corr = cv2.matchTemplate(source_norm, template_norm, cv2.TM_CCOEFF_NORMED)[0][0]
        score = float(max(0.0, min(1.0, (corr + 1.0) / 2.0)))

        result = TemplateMatchResult(
            symbol_id=template.symbol_id,
            symbol_class=template.symbol_class,
            score=score,
            symbol_description=template.symbol_description,
        )
        if best is None or result.score > best.score:
            best = result

    return best
