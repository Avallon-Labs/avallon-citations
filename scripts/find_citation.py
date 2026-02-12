#!/usr/bin/env python3
"""Find the best matching bounding box for a text snippet in a Reducto JSON file.

Usage:
    python3 scripts/find_citation.py <source_id> <text_snippet>

Output (JSON):
    {"sourceId": "...", "page": 1, "bbox": {"left": 0.07, "top": 0.16, "width": 0.41, "height": 0.01}}

If no match found:
    {"error": "no match found"}
"""

from __future__ import annotations

import json
import re
import sys
from difflib import SequenceMatcher
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "public" / "data"

# Block types to skip — these are navigational, not content
SKIP_TYPES = {"Page Number", "Footer"}


def load_blocks(source_id: str) -> list[dict]:
    """Load all content blocks from a Reducto JSON file."""
    json_path = DATA_DIR / f"{source_id}.reducto.json"
    if not json_path.exists():
        return []

    with open(json_path) as f:
        data = json.load(f)

    result = data.get("result", data)
    chunks = result.get("chunks", [])

    blocks = []
    for chunk in chunks:
        for block in chunk.get("blocks", []):
            block_type = block.get("type", "")
            if block_type in SKIP_TYPES:
                continue
            content = block.get("content", "")
            if not content or not content.strip():
                continue
            bbox = block.get("bbox")
            if not bbox:
                continue
            blocks.append(block)

    return blocks


def strip_html(text: str) -> str:
    """Strip HTML tags and collapse whitespace."""
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def score_block(block_content: str, snippet: str) -> float:
    """Score how well a block matches a text snippet.

    Returns a score between 0 and 1. Substring matches always score >= 0.5
    to ensure they beat any fuzzy match (which caps at 0.49).
    """
    # Strip HTML from both sides before comparison
    bc_raw = block_content.strip().lower()
    sn_raw = snippet.strip().lower()
    bc = strip_html(bc_raw).lower()
    sn = strip_html(sn_raw).lower()

    if not bc or not sn:
        return 0.0

    # Exact substring match — always scores >= 0.5
    # Check both with and without HTML stripping
    for block_text, snippet_text in [(bc, sn), (bc_raw, sn_raw)]:
        if snippet_text in block_text:
            # Score 0.5 + bonus for how much of the block the snippet covers
            coverage = len(snippet_text) / max(len(block_text), 1)
            return 0.5 + coverage * 0.5  # Range: 0.5 to 1.0
        if block_text in snippet_text:
            coverage = len(block_text) / max(len(snippet_text), 1)
            return 0.5 + coverage * 0.4  # Range: 0.5 to 0.9

    # Fuzzy match — capped at 0.49 so it never beats a real substring match
    matcher = SequenceMatcher(None, bc, sn)
    ratio = matcher.ratio()
    match = matcher.find_longest_match(0, len(bc), 0, len(sn))
    lcs_ratio = match.size / max(len(sn), 1)

    raw_score = max(ratio * 0.6 + lcs_ratio * 0.4, lcs_ratio * 0.8)
    return min(raw_score, 0.49)


def find_citation(source_id: str, snippet: str) -> dict | None:
    """Find the best matching block for a text snippet."""
    blocks = load_blocks(source_id)
    if not blocks:
        return None

    best_score = 0.0
    best_block = None

    for block in blocks:
        content = block.get("content", "")
        score = score_block(content, snippet)

        if score > best_score:
            best_score = score
            best_block = block
        elif score == best_score and best_block:
            # Prefer shorter blocks (more precise bbox)
            if len(content) < len(best_block.get("content", "")):
                best_block = block

    if best_block is None or best_score < 0.1:
        return None

    bbox = best_block["bbox"]
    return {
        "sourceId": source_id,
        "page": bbox.get("page", 1),
        "bbox": {
            "left": round(bbox.get("left", 0), 6),
            "top": round(bbox.get("top", 0), 6),
            "width": round(bbox.get("width", 0), 6),
            "height": round(bbox.get("height", 0), 6),
        },
    }


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: find_citation.py <source_id> <text_snippet>"}))
        sys.exit(1)

    source_id = sys.argv[1]
    snippet = sys.argv[2]

    result = find_citation(source_id, snippet)
    if result:
        print(json.dumps(result))
    else:
        print(json.dumps({"error": "no match found", "sourceId": source_id}))


if __name__ == "__main__":
    main()
