from abc import ABC, abstractmethod

from services.scanner.schemas.scan_models import DetectedSheet


class ScannerAdapter(ABC):
    """Defines the contract used by the scanner pipeline regardless of implementation mode."""

    @abstractmethod
    def split_sheets(self, file_name: str) -> list[DetectedSheet]:
        raise NotImplementedError

    @abstractmethod
    def extract(self, file_name: str, sheet_id: str) -> dict:
        raise NotImplementedError

    @abstractmethod
    def classify_symbol(self, symbol_image_ref: str) -> list[dict[str, str | float]]:
        raise NotImplementedError
