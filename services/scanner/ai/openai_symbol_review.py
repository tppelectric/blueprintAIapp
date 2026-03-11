from __future__ import annotations

import base64
import json
import os
from dataclasses import dataclass

import cv2
import httpx
import numpy as np

ALLOWED_SYMBOL_TYPES = {
    "outlet",
    "switch",
    "dimmer",
    "light",
    "recessed_light",
    "fan",
    "cat6",
    "speaker",
    "camera",
    "smoke_co",
    "unknown",
}


@dataclass
class OpenAISymbolReviewResult:
    symbol_type: str
    confidence: float
    reason: str


class OpenAISymbolReviewer:
    def __init__(self) -> None:
        self.api_key = os.getenv("OPENAI_API_KEY", "").strip()
        self.model = os.getenv("OPENAI_VISION_MODEL", "gpt-4.1-mini").strip() or "gpt-4.1-mini"
        self.enabled = (
            os.getenv("OPENAI_SYMBOL_REVIEW_ENABLED", "false").strip().lower() == "true" and bool(self.api_key)
        )
        self.max_calls = max(0, int(os.getenv("OPENAI_SYMBOL_REVIEW_MAX_CALLS", "20") or "20"))
        self.calls_made = 0

    def review_symbol_crop(
        self,
        crop: np.ndarray,
        *,
        ai_candidate_type: str,
        legend_hint: str | None,
        room_name: str | None,
    ) -> OpenAISymbolReviewResult | None:
        if not self.enabled or self.calls_made >= self.max_calls or crop.size == 0:
            return None

        ok, png_bytes = cv2.imencode(".png", crop)
        if not ok:
            return None

        self.calls_made += 1
        image_b64 = base64.b64encode(png_bytes.tobytes()).decode("ascii")
        prompt = (
            "You are classifying a single electrical blueprint symbol crop. "
            "Return strict JSON only with keys symbol_type, confidence, reason. "
            f"Allowed symbol_type values: {sorted(ALLOWED_SYMBOL_TYPES)}. "
            f"AI detector hint: {ai_candidate_type or 'unknown'}. "
            f"Legend hint: {legend_hint or 'none'}. "
            f"Room hint: {room_name or 'unknown'}. "
            "Pick the best supported symbol type for takeoff counting. "
            "If the crop is too unclear, return unknown."
        )

        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.post(
                    "https://api.openai.com/v1/responses",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "input": [
                            {
                                "role": "user",
                                "content": [
                                    {"type": "input_text", "text": prompt},
                                    {"type": "input_image", "image_url": f"data:image/png;base64,{image_b64}"},
                                ],
                            }
                        ],
                        "max_output_tokens": 120,
                    },
                )
                response.raise_for_status()
        except Exception:
            return None

        parsed = self._parse_response(response.json())
        if not parsed:
            return None

        symbol_type = str(parsed.get("symbol_type", "unknown")).strip().lower()
        if symbol_type not in ALLOWED_SYMBOL_TYPES:
            symbol_type = "unknown"

        try:
            confidence = float(parsed.get("confidence", 0))
        except Exception:
            confidence = 0.0
        confidence = max(0.0, min(1.0, confidence))

        reason = str(parsed.get("reason", "")).strip()
        return OpenAISymbolReviewResult(symbol_type=symbol_type, confidence=confidence, reason=reason)

    def _parse_response(self, payload: dict) -> dict | None:
        output_text = payload.get("output_text")
        if isinstance(output_text, str) and output_text.strip():
            return self._parse_json_text(output_text)

        for item in payload.get("output", []):
            for content in item.get("content", []):
                text = content.get("text")
                if isinstance(text, str) and text.strip():
                    parsed = self._parse_json_text(text)
                    if parsed:
                        return parsed
        return None

    def _parse_json_text(self, text: str) -> dict | None:
        text = text.strip()
        if not text:
            return None

        try:
            parsed = json.loads(text)
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            start = text.find("{")
            end = text.rfind("}")
            if start == -1 or end == -1 or end <= start:
                return None
            try:
                parsed = json.loads(text[start : end + 1])
                return parsed if isinstance(parsed, dict) else None
            except Exception:
                return None
