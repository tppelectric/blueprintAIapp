from pathlib import Path

import cv2
import pytesseract


def ocr_image(image_path: str) -> str:
    """Run OCR against an image path. Returns empty text if file is not accessible."""
    path = Path(image_path)
    if not path.exists():
        return ""

    image = cv2.imread(str(path))
    if image is None:
        return ""

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    text = pytesseract.image_to_string(gray)
    return text.strip()
