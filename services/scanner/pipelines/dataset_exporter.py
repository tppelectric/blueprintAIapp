from __future__ import annotations

import os
from pathlib import Path

import cv2
import numpy as np

YOLO_CLASSES = [
    "outlet",
    "switch",
    "dimmer",
    "recessed_light",
    "ceiling_fixture",
    "fan",
    "smoke_detector",
    "data_port",
    "speaker",
    "panel",
    "subpanel",
]


def dataset_export_enabled() -> bool:
    return os.getenv("SCANNER_EXPORT_DATASET", "false").strip().lower() == "true"


def _class_to_index(symbol_class: str) -> int | None:
    normalized = symbol_class.strip().lower()
    if normalized in YOLO_CLASSES:
        return YOLO_CLASSES.index(normalized)
    return None


def export_page_to_yolo(
    project_id: str,
    page_number: int,
    page_image: np.ndarray,
    detections: list[dict],
) -> None:
    if not dataset_export_enabled():
        return

    image_dir = Path("services/scanner/dataset/images")
    label_dir = Path("services/scanner/dataset/labels")
    image_dir.mkdir(parents=True, exist_ok=True)
    label_dir.mkdir(parents=True, exist_ok=True)

    base_name = f"{project_id}_p{page_number}"
    image_path = image_dir / f"{base_name}.png"
    label_path = label_dir / f"{base_name}.txt"

    if len(page_image.shape) == 2:
        export_image = cv2.cvtColor(page_image, cv2.COLOR_GRAY2BGR)
    else:
        export_image = page_image
    cv2.imwrite(str(image_path), export_image)

    height, width = page_image.shape[:2]
    lines: list[str] = []
    for detection in detections:
        symbol_class = str(detection.get("symbol_class", "")).strip()
        bbox = detection.get("bbox")
        if not symbol_class or bbox is None:
            continue
        cls_idx = _class_to_index(symbol_class)
        if cls_idx is None:
            continue

        x1, y1, x2, y2 = bbox
        box_w = max(1, x2 - x1)
        box_h = max(1, y2 - y1)
        x_center = x1 + box_w / 2
        y_center = y1 + box_h / 2

        lines.append(
            f"{cls_idx} "
            f"{x_center / width:.6f} {y_center / height:.6f} "
            f"{box_w / width:.6f} {box_h / height:.6f}"
        )

    label_path.write_text("\n".join(lines), encoding="utf-8")
