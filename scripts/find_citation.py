#!/usr/bin/env python3
"""Find the best matching citation for a text snippet in a source document.

For PDF sources, returns a PdfCitation with bounding box coordinates.
For markdown sources, returns an MdCitation with table region or text snippet.

Usage:
    python3 scripts/find_citation.py <source_id> <text_snippet>

Output (JSON):
    PDF:  {"type": "pdf", "sourceId": "...", "page": 1, "bbox": {"left": 0.07, ...}}
    MD:   {"type": "md", "sourceId": "...", "tableIndex": 0, "startRow": 1, ...}
    Text: {"type": "md", "sourceId": "...", "snippet": "..."}

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
    """Find the best matching block for a text snippet (PDF sources).

    Returns a PdfCitation dict with type="pdf".
    """
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
        "type": "pdf",
        "sourceId": source_id,
        "page": bbox.get("page", 1),
        "bbox": {
            "left": round(bbox.get("left", 0), 6),
            "top": round(bbox.get("top", 0), 6),
            "width": round(bbox.get("width", 0), 6),
            "height": round(bbox.get("height", 0), 6),
        },
    }


# ── Markdown citation support ──────────────────────────────────────────


def parse_md_tables(md_content: str) -> list[dict]:
    """Parse GFM tables from markdown content.

    Returns a list of tables, each with:
        - rows: list of lists of cell text (including header row)
        - start_line: line index where the table starts
        - end_line: line index where the table ends
    """
    lines = md_content.split("\n")
    tables = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        # A GFM table starts with a line containing | characters
        if "|" in line and i + 1 < len(lines):
            next_line = lines[i + 1].strip()
            # The second line must be a separator row (e.g., |---|---|)
            if re.match(r"^\|?[\s:]*-+[\s:]*(\|[\s:]*-+[\s:]*)*\|?\s*$", next_line):
                # Found a table — parse all rows
                table_start = i
                rows = []
                # Parse header row
                header_cells = _parse_table_row(lines[i])
                rows.append(header_cells)
                # Skip separator row
                i += 2
                # Parse data rows
                while i < len(lines) and "|" in lines[i]:
                    row_cells = _parse_table_row(lines[i])
                    if row_cells:
                        rows.append(row_cells)
                    else:
                        break
                    i += 1
                tables.append({
                    "rows": rows,
                    "start_line": table_start,
                    "end_line": i - 1,
                })
                continue
        i += 1
    return tables


def _parse_table_row(line: str) -> list[str]:
    """Parse a single GFM table row into cell texts."""
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    return [cell.strip() for cell in line.split("|")]


def find_md_citation(source_id: str, snippet: str) -> dict | None:
    """Find snippet location in a markdown source.

    Returns an MdCitation dict — either with table region info
    (tableIndex, startRow, startCol) or just a snippet for text matches.
    """
    md_path = DATA_DIR / f"{source_id}.md"
    if not md_path.exists():
        return None

    with open(md_path) as f:
        md_content = f.read()

    if not md_content or not snippet:
        return None

    sn = strip_html(snippet.strip()).lower()
    if not sn:
        return None

    # Step 1: Search tables for the snippet
    tables = parse_md_tables(md_content)
    best_table_match = None
    best_table_score = 0.0

    for table_idx, table in enumerate(tables):
        for row_idx, row in enumerate(table["rows"]):
            for col_idx, cell in enumerate(row):
                cell_clean = strip_html(cell.strip()).lower()
                if not cell_clean:
                    continue

                # Exact match in cell
                if sn in cell_clean or cell_clean in sn:
                    coverage = min(len(sn), len(cell_clean)) / max(len(sn), len(cell_clean), 1)
                    score = 0.5 + coverage * 0.5
                    if score > best_table_score:
                        best_table_score = score
                        best_table_match = {
                            "type": "md",
                            "sourceId": source_id,
                            "tableIndex": table_idx,
                            "startRow": row_idx,
                            "startCol": col_idx,
                            "snippet": snippet,
                        }

                # Fuzzy match
                matcher = SequenceMatcher(None, cell_clean, sn)
                ratio = matcher.ratio()
                if ratio > best_table_score and ratio >= 0.4:
                    best_table_score = ratio * 0.49  # Cap below substring match
                    best_table_match = {
                        "type": "md",
                        "sourceId": source_id,
                        "tableIndex": table_idx,
                        "startRow": row_idx,
                        "startCol": col_idx,
                        "snippet": snippet,
                    }

    # Also check if snippet spans multiple cells in a row
    for table_idx, table in enumerate(tables):
        for row_idx, row in enumerate(table["rows"]):
            row_text = " ".join(strip_html(c.strip()).lower() for c in row)
            if sn in row_text:
                score = 0.6 + (len(sn) / max(len(row_text), 1)) * 0.3
                if score > best_table_score:
                    best_table_score = score
                    best_table_match = {
                        "type": "md",
                        "sourceId": source_id,
                        "tableIndex": table_idx,
                        "startRow": row_idx,
                        "snippet": snippet,
                    }

    if best_table_match and best_table_score >= 0.4:
        return best_table_match

    # Step 2: Search non-table text for the snippet
    if snippet in md_content:
        return {"type": "md", "sourceId": source_id, "snippet": snippet}

    # Step 3: Case-insensitive / stripped search
    md_lower = md_content.lower()
    sn_lower = snippet.strip().lower()
    if sn_lower in md_lower:
        # Find the actual text in the original to use as snippet
        idx = md_lower.index(sn_lower)
        actual_snippet = md_content[idx : idx + len(sn_lower)]
        return {"type": "md", "sourceId": source_id, "snippet": actual_snippet}

    # Step 4: Fuzzy fallback — reuse existing score_block logic against table cells
    # and non-table content
    best_score = 0.0
    best_result = None

    # Try matching against full table rows
    for table_idx, table in enumerate(tables):
        for row_idx, row in enumerate(table["rows"]):
            row_text = " | ".join(row)
            score = score_block(row_text, snippet)
            if score > best_score:
                best_score = score
                best_result = {
                    "type": "md",
                    "sourceId": source_id,
                    "tableIndex": table_idx,
                    "startRow": row_idx,
                    "snippet": snippet,
                }

    # Try matching against non-table paragraphs
    for paragraph in _extract_non_table_text(md_content, tables):
        score = score_block(paragraph, snippet)
        if score > best_score:
            best_score = score
            best_result = {
                "type": "md",
                "sourceId": source_id,
                "snippet": snippet,
            }

    if best_result and best_score >= 0.2:
        return best_result

    return None


def _extract_non_table_text(md_content: str, tables: list[dict]) -> list[str]:
    """Extract paragraphs from markdown that are NOT inside tables."""
    lines = md_content.split("\n")
    table_lines = set()
    for table in tables:
        for ln in range(table["start_line"], table["end_line"] + 1):
            table_lines.add(ln)

    paragraphs = []
    current = []
    for i, line in enumerate(lines):
        if i in table_lines:
            if current:
                paragraphs.append("\n".join(current))
                current = []
            continue
        if line.strip():
            current.append(line)
        elif current:
            paragraphs.append("\n".join(current))
            current = []
    if current:
        paragraphs.append("\n".join(current))
    return paragraphs


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: find_citation.py <source_id> <text_snippet> [--type pdf|md]"}))
        sys.exit(1)

    source_id = sys.argv[1]
    snippet = sys.argv[2]

    # Optional --type flag to select citation finder
    source_type = "pdf"
    if "--type" in sys.argv:
        idx = sys.argv.index("--type")
        if idx + 1 < len(sys.argv):
            source_type = sys.argv[idx + 1]

    if source_type == "md":
        result = find_md_citation(source_id, snippet)
    else:
        result = find_citation(source_id, snippet)

    if result:
        print(json.dumps(result))
    else:
        print(json.dumps({"error": "no match found", "sourceId": source_id}))


if __name__ == "__main__":
    main()
