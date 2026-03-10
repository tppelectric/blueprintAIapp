from __future__ import annotations

import base64
import re
from dataclasses import dataclass

import cv2
import numpy as np
import pytesseract

LEGEND_PAGE_KEYWORDS = [
    "ELECTRICAL LEGEND",
    "LIGHTING LEGEND",
    "SYMBOL LEGEND",
    "ELECTRICAL SYMBOLS",
]

CLASS_KEYWORDS: dict[str, list[str]] = {
    "outlet": ["receptacle", "duplex", "outlet"],
    "switch": ["switch"],
    "3_way_switch": ["3-way switch", "three way switch", "3 way switch"],
    "4_way_switch": ["4-way switch", "four way switch", "4 way switch"],
    "dimmer": ["dimmer"],
    "recessed_light": ["recessed", "downlight"],
    "ceiling_fixture": ["ceiling fixture", "light fixture", "fixture"],
    "fan": ["fan", "ceiling fan"],
    "smoke_detector": ["smoke", "co detector", "smoke/co"],
    "data_port": ["data", "cat6", "data outlet"],
    "speaker": ["speaker"],
    "panel": ["panel"],
    "subpanel": ["subpanel", "sub-panel"],
}


@dataclass
class LegendSymbolTemplate:
    symbol_id: str
    symbol_image_b64: str
    symbol_description: str
    symbol_class: str | None
    page_number: int


def is_legend_page(page_text: str) -> bool:
    upper = page_text.upper()
    return any(keyword in upper for keyword in LEGEND_PAGE_KEYWORDS)


def infer_symbol_class(description: str) -> str | None:
    lowered = description.lower()
    for symbol_class, keywords in CLASS_KEYWORDS.items():
        if any(keyword in lowered for keyword in keywords):
            return symbol_class
    return None


def extract_legend_templates(page_image: np.ndarray, page_number: int) -> list[LegendSymbolTemplate]:
    """Extract symbol-like legend crops and OCR descriptions from a legend page."""
    if len(page_image.shape) != 2:
        gray = cv2.cvtColor(page_image, cv2.COLOR_BGR2GRAY)
    else:
        gray = page_image

    binary = cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        35,
        5,
    )

    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    results: list[LegendSymbolTemplate] = []

    for idx, contour in enumerate(contours):
        x, y, w, h = cv2.boundingRect(contour)
        area = w * h
        if area < 300 or area > 12000:
            continue

        crop = gray[max(0, y - 4) : y + h + 4, max(0, x - 4) : x + w + 4]
        if crop.size == 0:
            continue

        # OCR area to the right of the symbol for description text.
        text_roi = gray[max(0, y - 6) : y + h + 6, x + w : min(gray.shape[1], x + w + 420)]
        desc = pytesseract.image_to_string(text_roi).strip()
        desc = re.sub(r"\s+", " ", desc)

        if not desc:
            desc = "Unclassified legend symbol"

        ok, png_bytes = cv2.imencode(".png", crop)
        if not ok:
            continue

        image_b64 = base64.b64encode(png_bytes.tobytes()).decode("ascii")
        symbol_class = infer_symbol_class(desc)

        results.append(
            LegendSymbolTemplate(
                symbol_id=f"legend-p{page_number}-{idx + 1}",
                symbol_image_b64=image_b64,
                symbol_description=desc,
                symbol_class=symbol_class,
                page_number=page_number,
            )
        )

    return results
