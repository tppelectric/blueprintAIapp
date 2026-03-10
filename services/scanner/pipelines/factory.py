from services.scanner.pipelines.interfaces import ScannerAdapter
from services.scanner.schemas.scan_models import ScanMode


def get_scanner_adapter(mode: ScanMode) -> ScannerAdapter:
    # Lazy imports keep mock mode usable even when heavy real-mode dependencies are absent.
    if mode == "real":
        from services.scanner.pipelines.adapters.real_adapter import RealScannerAdapter

        return RealScannerAdapter()

    from services.scanner.pipelines.adapters.mock_adapter import MockScannerAdapter

    return MockScannerAdapter()
