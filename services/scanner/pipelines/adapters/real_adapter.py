from __future__ import annotations

import re
from collections import Counter

import cv2
import pytesseract

from services.scanner.detectors.template_matcher import (
    TemplateCandidate,
    match_symbol_to_templates,
)
from services.scanner.detectors.yolo_symbol_detector import YoloSymbolDetector
from services.scanner.ocr.legend_extractor import (
    extract_legend_templates,
    infer_symbol_class,
    is_legend_page,
)
from services.scanner.ocr.real_ocr_engine import ocr_image
from services.scanner.pdf.image_processing import load_blueprint_pages
from services.scanner.pdf.real_pdf_parser import extract_page_text, parse_pdf_sheets
from services.scanner.pipelines.dataset_exporter import export_page_to_yolo
from services.scanner.pipelines.interfaces import ScannerAdapter

ROOM_PATTERNS = [
    "bedroom",
    "hallway",
    "bathroom",
    "kitchen",
    "living",
    "dining",
    "foyer",
    "garage",
    "basement",
    "laundry",
    "office",
    "closet",
    "pantry",
    "utility",
    "mechanical",
    "storage",
    "entry",
    "stair",
    "mudroom",
    "porch",
    "deck",
]

SCALE_PATTERN = re.compile(
    r"(?:(\d+(?:\.\d+)?)\s*\"?\s*=\s*(\d+)\s*'[\s-]*(\d+)?\s*\"?)|(?:SCALE\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*\"?\s*=\s*(\d+)\s*'[\s-]*(\d+)?\s*\"?)",
    re.IGNORECASE,
)

SYMBOL_KEYWORDS = {
    "outlet": ["outlet", "receptacle", "duplex"],
    "switch": ["switch", "3-way", "4-way"],
    "dimmer": ["dimmer"],
    "light": ["light", "fixture"],
    "recessed_light": ["recessed", "downlight"],
    "fan": ["fan", "ceiling fan"],
    "cat6": ["cat6", "data"],
    "speaker": ["speaker"],
    "camera": ["camera", "cctv"],
    "smoke_co": ["smoke", "co detector"],
}


def _map_legend_class_to_symbol_type(symbol_class: str | None) -> str:
    if not symbol_class:
        return "unknown"

    mapping = {
        "receptacle": "outlet",
        "outlet": "outlet",
        "switch": "switch",
        "3_way_switch": "switch",
        "4_way_switch": "switch",
        "dimmer": "dimmer",
        "recessed_light": "recessed_light",
        "ceiling_fixture": "light",
        "fan": "fan",
        "smoke_detector": "smoke_co",
        "data_port": "cat6",
        "speaker": "speaker",
    }
    return mapping.get(symbol_class, "unknown")


class RealScannerAdapter(ScannerAdapter):
    """Hybrid real scanner: AI candidates + legend/template matching + manual-review safety."""

    def __init__(self) -> None:
        self.symbol_detector = YoloSymbolDetector()

    def split_sheets(self, file_name: str):
        return parse_pdf_sheets(file_name)

    def extract(self, file_name: str, sheet_id: str) -> dict:
        sheets = self.split_sheets(file_name)
        page_texts = extract_page_text(file_name)
        preprocessed_pages = load_blueprint_pages(file_name)
        target_page_numbers = self._resolve_target_pages(sheets, sheet_id, len(preprocessed_pages))

        rooms = self._extract_rooms(page_texts, preprocessed_pages, target_page_numbers)
        legends, templates = self._extract_legends(page_texts, preprocessed_pages, target_page_numbers)
        symbols = self._extract_symbols(file_name, preprocessed_pages, rooms, templates, target_page_numbers)
        relevant_text = self._collect_page_text(page_texts, preprocessed_pages, target_page_numbers)
        notes = self._extract_notes(relevant_text.lower())
        panel_schedule = self._extract_panel_schedule(relevant_text.lower())
        fixture_schedule = self._extract_fixture_schedule(relevant_text.lower())
        detected_scale, scale_source = self._extract_scale(relevant_text)

        # Build YOLO dataset records from high-confidence classified detections.
        for page_index, page in enumerate(preprocessed_pages, start=1):
            if page_index not in target_page_numbers:
                continue
            page_detections = [
                {
                    "symbol_class": symbol.get("legend_symbol_class"),
                    "bbox": symbol.get("bbox"),
                }
                for symbol in symbols
                if symbol.get("page_number") == page_index and not symbol.get("needs_review", True)
            ]
            export_page_to_yolo(
                project_id=sheet_id,
                page_number=page_index,
                page_image=page,
                detections=page_detections,
            )

        return {
            "sheets": [sheet.model_dump() for sheet in sheets if int(sheet.page_number) in target_page_numbers],
            "rooms": rooms,
            "symbols": symbols,
            "notes": notes,
            "legends": legends,
            "panel_schedule": panel_schedule,
            "fixture_schedule": fixture_schedule,
            "detected_scale": detected_scale,
            "scale_source": scale_source,
            "scale_needs_input": detected_scale is None,
        }

    def classify_symbol(self, symbol_image_ref: str) -> list[dict[str, str | float]]:
        text = ocr_image(symbol_image_ref).lower()
        if not text:
            return [
                {"symbol_type": "unknown", "score": 0.0},
            ]

        scores: Counter[str] = Counter()
        for symbol_type, keywords in SYMBOL_KEYWORDS.items():
            for keyword in keywords:
                if keyword in text:
                    scores[symbol_type] += 1

        if not scores:
            return [{"symbol_type": "unknown", "score": 0.0}]

        total = sum(scores.values())
        ranked = scores.most_common(3)
        return [{"symbol_type": key, "score": round(value / total, 2)} for key, value in ranked]

    def _extract_rooms(
        self, page_texts: list[str], pages: list, target_page_numbers: set[int]
    ) -> list[dict[str, str | int | list[int]]]:
        results: list[dict[str, str | int | list[int]]] = []
        known_names: set[str] = set()

        for page_index, page in enumerate(pages, start=1):
            if page_index not in target_page_numbers:
                continue
            data = pytesseract.image_to_data(page, output_type=pytesseract.Output.DICT)
            count = len(data.get("text", []))
            for i in range(count):
                token = str(data["text"][i]).strip()
                if not token:
                    continue

                lowered = token.lower()
                if not any(pattern in lowered for pattern in ROOM_PATTERNS):
                    continue

                room_name = token.title()
                key = f"{page_index}:{room_name}"
                if key in known_names:
                    continue

                x = int(data["left"][i])
                y = int(data["top"][i])
                w = int(data["width"][i])
                h = int(data["height"][i])

                results.append(
                    {
                        "name": room_name,
                        "area_sq_ft": 120,
                        "page_number": page_index,
                        "bbox": [x, y, x + w, y + h],
                    }
                )
                known_names.add(key)

        if not results:
            # OCR fallback from text stream.
            full_text = self._collect_page_text(page_texts, pages, target_page_numbers).lower()
            for pattern in ROOM_PATTERNS:
                matches = re.findall(rf"{pattern}\s*\d*", full_text)
                for match in matches:
                    room_name = " ".join(match.split()).title()
                    key = f"0:{room_name}"
                    if room_name and key not in known_names:
                        results.append({"name": room_name, "area_sq_ft": 120, "page_number": 1, "bbox": [0, 0, 10, 10]})
                        known_names.add(key)

        if not results:
            results.append({"name": "Unlabeled Area", "area_sq_ft": 100, "page_number": 1, "bbox": [0, 0, 10, 10]})
        return results

    def _extract_symbols(
        self,
        file_name: str,
        pages: list,
        rooms: list[dict],
        templates: list[TemplateCandidate],
        target_page_numbers: set[int],
    ) -> list[dict]:
        if not rooms:
            return []

        detections: list[dict] = []
        cv_detections = self.symbol_detector.detect_blueprint_symbols(file_name)

        for detection in cv_detections:
            page_number = int(detection.page)
            if page_number not in target_page_numbers:
                continue
            if page_number < 1 or page_number > len(pages):
                continue
            page = pages[page_number - 1]
            x1, y1, x2, y2 = detection.bbox
            x1 = max(0, x1)
            y1 = max(0, y1)
            x2 = min(page.shape[1], x2)
            y2 = min(page.shape[0], y2)
            crop = page[y1:y2, x1:x2]

            template_match = match_symbol_to_templates(crop, templates)
            legend_score = template_match.score if template_match else 0.0
            mapped_from_legend = _map_legend_class_to_symbol_type(template_match.symbol_class if template_match else None)

            ai_score = float(detection.confidence)
            final_type, needs_review = self._resolve_symbol_type(
                mapped_from_legend=mapped_from_legend,
                legend_score=legend_score,
                ai_candidate_type=detection.symbol_type,
                ai_score=ai_score,
            )

            room_name = self._assign_room_by_overlap(rooms, page_number, (x1, y1, x2, y2))

            detections.append(
                {
                    "room": room_name,
                    "type": final_type,
                    "confidence": round(max(0.0, min(1.0, legend_score if not needs_review else ai_score * 0.5)), 2),
                    "needs_review": needs_review,
                    "detection_source": detection.source,
                    "ai_candidate_type": detection.symbol_type,
                    "legend_match": template_match.symbol_id if template_match else None,
                    "legend_similarity": round(legend_score, 2),
                    "legend_symbol_class": template_match.symbol_class if template_match else None,
                    "page_number": page_number,
                    "bbox": [x1, y1, x2, y2],
                }
            )

        return detections

    def _resolve_symbol_type(
        self,
        *,
        mapped_from_legend: str,
        legend_score: float,
        ai_candidate_type: str,
        ai_score: float,
    ) -> tuple[str, bool]:
        if mapped_from_legend != "unknown" and legend_score >= 0.72:
            return mapped_from_legend, False

        if mapped_from_legend != "unknown" and legend_score >= 0.52:
            return mapped_from_legend, True

        ai_type = ai_candidate_type if ai_candidate_type in SYMBOL_KEYWORDS or ai_candidate_type in {"outlet", "switch", "dimmer", "light", "recessed_light", "fan", "cat6", "speaker", "camera", "smoke_co"} else "unknown"
        if ai_type != "unknown" and ai_score >= 0.58:
            return ai_type, False

        if ai_type != "unknown" and ai_score >= 0.3:
            return ai_type, True

        return "unknown", True

    def _assign_room_by_overlap(self, rooms: list[dict], page_number: int, bbox: tuple[int, int, int, int]) -> str:
        x1, y1, x2, y2 = bbox
        sx = (x1 + x2) // 2
        sy = (y1 + y2) // 2

        same_page = [room for room in rooms if int(room.get("page_number", 1)) == page_number]
        if not same_page:
            same_page = rooms

        # Use center-point nearest room token as simple spatial assignment.
        best_name = str(same_page[0]["name"])
        best_dist = float("inf")
        for room in same_page:
            rb = room.get("bbox", [0, 0, 10, 10])
            rx = (int(rb[0]) + int(rb[2])) // 2
            ry = (int(rb[1]) + int(rb[3])) // 2
            dist = (sx - rx) ** 2 + (sy - ry) ** 2
            if dist < best_dist:
                best_dist = dist
                best_name = str(room["name"])

        return best_name

    def _extract_notes(self, page_text: str) -> list[dict[str, str | bool]]:
        note_lines = [line.strip() for line in page_text.splitlines() if "note" in line.lower()]
        return [
            {
                "category": "electrical" if "electrical" in line else "general",
                "text": line,
                "impacts_scope": "dedicated" in line or "afci" in line,
            }
            for line in note_lines[:8]
        ]

    def _extract_legends(
        self, page_texts: list[str], pages: list, target_page_numbers: set[int]
    ) -> tuple[list[dict[str, str]], list[TemplateCandidate]]:
        legends: list[dict[str, str]] = []
        templates: list[TemplateCandidate] = []

        for idx, page_text in enumerate(page_texts, start=1):
            if idx not in target_page_numbers:
                continue
            ocr_text = pytesseract.image_to_string(pages[idx - 1]) if idx - 1 < len(pages) else ""
            merged_text = f"{page_text}\n{ocr_text}"
            if not is_legend_page(merged_text):
                continue

            extracted_templates = extract_legend_templates(pages[idx - 1], idx) if idx - 1 < len(pages) else []
            for template in extracted_templates:
                symbol_class = template.symbol_class or infer_symbol_class(template.symbol_description)
                legends.append(
                    {
                        "symbol_key": template.symbol_id,
                        "description": template.symbol_description,
                        "symbol_image": template.symbol_image_b64,
                        "symbol_class": symbol_class or "unknown",
                        "page_number": idx,
                    }
                )
                templates.append(
                    TemplateCandidate(
                        symbol_id=template.symbol_id,
                        symbol_class=symbol_class,
                        symbol_image_b64=template.symbol_image_b64,
                        symbol_description=template.symbol_description,
                    )
                )

        return legends, templates

    def _resolve_target_pages(self, sheets: list, sheet_id: str, page_count: int) -> set[int]:
        for sheet in sheets:
            if str(sheet.sheet_number).lower() == sheet_id.lower():
                page = int(sheet.page_number)
                if page >= 1:
                    return {page}
        if page_count > 0:
            return {1}
        return set()

    def _collect_page_text(self, page_texts: list[str], pages: list, target_page_numbers: set[int]) -> str:
        parts: list[str] = []
        for page_index in target_page_numbers:
            text_idx = page_index - 1
            if 0 <= text_idx < len(page_texts):
                parts.append(page_texts[text_idx] or "")
            if 0 <= text_idx < len(pages):
                parts.append(pytesseract.image_to_string(pages[text_idx]) or "")
        return "\n".join(parts)

    def _extract_scale(self, text: str) -> tuple[str | None, str]:
        match = SCALE_PATTERN.search(text.upper())
        if not match:
            return None, "unknown"

        groups = [value for value in match.groups() if value]
        if len(groups) < 2:
            return None, "unknown"

        first = groups[0]
        feet = groups[1]
        inches = groups[2] if len(groups) >= 3 else None
        if inches is not None and inches.isdigit():
            return f'{first}" = {feet}\'-{inches}"', "ocr_or_pdf_text"
        return f'{first}" = {feet}\'-0"', "ocr_or_pdf_text"

    def _extract_panel_schedule(self, page_text: str) -> list[dict[str, int | str]]:
        if "panel" in page_text:
            return [{"panel": "Detected Panel", "circuits": 24}]
        return []

    def _extract_fixture_schedule(self, page_text: str) -> list[dict[str, int | str]]:
        if "fixture" in page_text:
            return [{"fixture": "Detected Fixture Type", "quantity": 1}]
        return []
