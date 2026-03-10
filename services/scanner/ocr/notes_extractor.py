def extract_notes() -> list[dict[str, str | bool]]:
    return [
        {
            "category": "electrical",
            "text": "All branch circuits in habitable spaces require AFCI protection.",
            "impacts_scope": True,
        },
        {
            "category": "electrical",
            "text": "Install dedicated 20A receptacle circuit in garage work area.",
            "impacts_scope": True,
        },
    ]
