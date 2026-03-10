from __future__ import annotations

import os
from dataclasses import dataclass

import cv2

from services.scanner.pdf.real_pdf_parser import cleanup_render_dir, ensure_image_path, render_pdf_pages_to_images


@dataclass
class SymbolDetectionResult:
    symbol_type: str
    confidence: float
    page: int
    bbox: tuple[int, int, int, int]
    source: str = "unknown"


LABEL_MAP = {
    "receptacle": "outlet",
    "outlet": "outlet",
    "switch": "switch",
    "3way_switch": "switch",
    "4way_switch": "switch",
    "dimmer": "dimmer",
    "lighting_fixture": "light",
    "light": "light",
    "recessed_light": "recessed_light",
    "fan": "fan",
    "exterior_light": "light",
    "smoke_detector": "smoke_co",
    "data_outlet": "cat6",
    "speaker": "speaker",
    "tv": "cat6",
    "panel": "panel",
    "subpanel": "subpanel",
    "camera": "camera",
}


class YoloSymbolDetector:
    """YOLO-backed symbol detector with OpenCV fallback when model/weights are unavailable."""

    def __init__(self, model_path: str | None = None, conf_threshold: float = 0.3) -> None:
        self.model_path = model_path or os.getenv("SYMBOL_YOLO_MODEL", "")
        self.conf_threshold = conf_threshold
        self._model = None
        self._model_loaded = False

    @staticmethod
    def require_model_in_real_mode() -> bool:
        return os.getenv("SCANNER_REAL_REQUIRE_YOLO", "false").strip().lower() == "true"

    def detect_blueprint_symbols(self, file_name: str) -> list[SymbolDetectionResult]:
        image_paths: list[str] = []
        temp_dir: str | None = None

        image_path = ensure_image_path(file_name)
        if image_path:
            image_paths = [image_path]
        else:
            image_paths, temp_dir = render_pdf_pages_to_images(file_name)

        detections: list[SymbolDetectionResult] = []
        try:
            for page_index, path in enumerate(image_paths, start=1):
                detections.extend(self._detect_on_image(path, page_index))
        finally:
            cleanup_render_dir(temp_dir)

        return detections

    def _load_model(self):
        if self._model_loaded:
            return self._model

        self._model_loaded = True
        if not self.model_path:
            if self.require_model_in_real_mode():
                raise RuntimeError("SCANNER_REAL_REQUIRE_YOLO=true but SYMBOL_YOLO_MODEL is not configured.")
            return None

        if not os.path.exists(self.model_path):
            if self.require_model_in_real_mode():
                raise RuntimeError(
                    f"SCANNER_REAL_REQUIRE_YOLO=true but model path does not exist: {self.model_path}"
                )
            return None

        try:
            from ultralytics import YOLO

            self._model = YOLO(self.model_path)
        except Exception:
            if self.require_model_in_real_mode():
                raise RuntimeError(
                    "SCANNER_REAL_REQUIRE_YOLO=true but YOLO model failed to load (check ultralytics/weights)."
                )
            self._model = None

        return self._model

    def _detect_on_image(self, image_path: str, page: int) -> list[SymbolDetectionResult]:
        image = cv2.imread(image_path)
        if image is None:
            return []

        model = self._load_model()
        if model is not None:
            return self._detect_with_yolo(model, image, page)

        return self._detect_with_opencv(image, page)

    def _detect_with_yolo(self, model, image, page: int) -> list[SymbolDetectionResult]:
        results = model.predict(source=image, conf=self.conf_threshold, verbose=False)
        detections: list[SymbolDetectionResult] = []

        for result in results:
            names = result.names
            for box in result.boxes:
                confidence = float(box.conf.item())
                cls_id = int(box.cls.item())
                label = str(names.get(cls_id, "unknown")).lower().strip().replace(" ", "_")
                mapped = LABEL_MAP.get(label, "unknown")
                x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]

                detections.append(
                    SymbolDetectionResult(
                        symbol_type=mapped,
                        confidence=round(confidence, 3),
                        page=page,
                        bbox=(x1, y1, x2, y2),
                        source="yolo",
                    )
                )

        return detections

    def _detect_with_opencv(self, image, page: int) -> list[SymbolDetectionResult]:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        blur = cv2.GaussianBlur(gray, (5, 5), 0)
        binary = cv2.adaptiveThreshold(
            blur,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            11,
            2,
        )

        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        detections: list[SymbolDetectionResult] = []

        for contour in contours:
            area = cv2.contourArea(contour)
            if area < 40 or area > 2500:
                continue

            x, y, w, h = cv2.boundingRect(contour)
            if w == 0 or h == 0:
                continue

            perimeter = cv2.arcLength(contour, True)
            circularity = 0.0
            if perimeter > 0:
                circularity = 4 * 3.14159 * area / (perimeter * perimeter)

            aspect_ratio = w / h
            if circularity > 0.74:
                symbol_type = "smoke_co"
                confidence = 0.45
            elif 0.8 <= aspect_ratio <= 1.2 and area < 350:
                symbol_type = "light"
                confidence = 0.42
            elif aspect_ratio > 1.5:
                symbol_type = "switch"
                confidence = 0.38
            else:
                symbol_type = "outlet"
                confidence = 0.35

            detections.append(
                SymbolDetectionResult(
                    symbol_type=symbol_type,
                    confidence=confidence,
                    page=page,
                    bbox=(x, y, x + w, y + h),
                    source="opencv_fallback",
                )
            )

        return detections
