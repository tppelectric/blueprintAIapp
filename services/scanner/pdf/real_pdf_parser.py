import re
import shutil
import tempfile
from pathlib import Path

import cv2
import pdfplumber

from services.scanner.schemas.scan_models import DetectedSheet

SHEET_PATTERN = re.compile(r"\b([A-Z]{1,3}\d{1,2}(?:\.\d{1,2})?)\b")


def parse_pdf_sheets(file_name: str) -> list[DetectedSheet]:
    """Extract sheet metadata from a real PDF by reading each page's text."""
    path = Path(file_name)
    if not path.exists() or path.suffix.lower() != ".pdf":
        return []

    sheets: list[DetectedSheet] = []
    with pdfplumber.open(path) as pdf:
        for index, page in enumerate(pdf.pages, start=1):
            text = (page.extract_text() or "").strip()
            lines = [line.strip() for line in text.splitlines() if line.strip()]
            top_line = lines[0] if lines else f"Sheet Page {index}"

            match = SHEET_PATTERN.search(top_line)
            if match:
                sheet_number = match.group(1)
                title = top_line.replace(sheet_number, "").strip(" -:") or f"Sheet Page {index}"
            else:
                sheet_number = f"P{index}"
                title = top_line

            sheets.append(
                DetectedSheet(sheet_number=sheet_number, title=title or f"Sheet Page {index}", page_number=index)
            )

    return sheets


def extract_page_text(file_name: str) -> list[str]:
    path = Path(file_name)
    if not path.exists() or path.suffix.lower() != ".pdf":
        return []

    with pdfplumber.open(path) as pdf:
        return [(page.extract_text() or "") for page in pdf.pages]


def render_pdf_pages_to_images(file_name: str, dpi: int = 200) -> tuple[list[str], str | None]:
    """Render PDF pages to image files for CV/YOLO detection.

    Returns (image_paths, temp_dir). temp_dir must be cleaned by caller if provided.
    """
    path = Path(file_name)
    if not path.exists() or path.suffix.lower() != ".pdf":
        return [], None

    temp_dir = tempfile.mkdtemp(prefix="scanner-pages-")
    image_paths: list[str] = []

    with pdfplumber.open(path) as pdf:
        for index, page in enumerate(pdf.pages, start=1):
            pil_img = page.to_image(resolution=dpi).original
            image_path = Path(temp_dir) / f"page-{index}.png"
            pil_img.save(image_path)
            image_paths.append(str(image_path))

    return image_paths, temp_dir


def cleanup_render_dir(temp_dir: str | None) -> None:
    if not temp_dir:
        return

    path = Path(temp_dir)
    if path.exists():
        shutil.rmtree(path, ignore_errors=True)


def ensure_image_path(file_name: str) -> str | None:
    path = Path(file_name)
    if path.exists() and path.suffix.lower() in {".png", ".jpg", ".jpeg"}:
        image = cv2.imread(str(path))
        if image is not None:
            return str(path)
    return None
