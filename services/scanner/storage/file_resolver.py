from __future__ import annotations

import os
import tempfile
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlparse

import httpx


def _suffix_from_ref(file_ref: str) -> str:
    parsed = urlparse(file_ref)
    suffix = Path(parsed.path).suffix
    return suffix if suffix else ".bin"


@contextmanager
def materialize_file_ref(file_ref: str):
    parsed = urlparse(file_ref)
    if parsed.scheme not in {"http", "https"}:
        yield file_ref
        return

    suffix = _suffix_from_ref(file_ref)
    with httpx.Client(follow_redirects=True, timeout=60.0) as client:
        response = client.get(file_ref)
        response.raise_for_status()

    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix, prefix="scanner-ref-")
    try:
        temp_file.write(response.content)
        temp_file.flush()
        temp_file.close()
        yield temp_file.name
    finally:
        try:
            os.unlink(temp_file.name)
        except FileNotFoundError:
            pass
