from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
from pdf2image import convert_from_path
from pdf2image.exceptions import PDFInfoNotInstalledError

from services.scanner.errors import ScannerDependencyError


def preprocess_blueprint_image(image: np.ndarray) -> np.ndarray:
    """Normalize blueprint image for OCR/CV: grayscale + contrast enhancement."""
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()

    # Contrast normalization and local contrast enhancement improve line/text visibility.
    normalized = cv2.normalize(gray, None, 0, 255, cv2.NORM_MINMAX)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(normalized)
    return enhanced


def load_blueprint_pages(file_name: str, dpi: int = 400) -> list[np.ndarray]:
    """Load PDF/PNG/JPG into page images, then apply preprocessing."""
    path = Path(file_name)
    if not path.exists():
        return []

    suffix = path.suffix.lower()
    raw_pages: list[np.ndarray] = []

    if suffix == ".pdf":
        try:
            pil_pages = convert_from_path(str(path), dpi=max(300, min(dpi, 600)))
        except PDFInfoNotInstalledError as exc:
            raise ScannerDependencyError(
                "Poppler is not installed or not in PATH. Real PDF scanning requires the pdfinfo tool."
            ) from exc
        for pil_image in pil_pages:
            rgb = np.array(pil_image.convert("RGB"))
            raw_pages.append(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
    elif suffix in {".png", ".jpg", ".jpeg"}:
        image = cv2.imread(str(path))
        if image is not None:
            raw_pages.append(image)
    else:
        return []

    return [preprocess_blueprint_image(page) for page in raw_pages]
