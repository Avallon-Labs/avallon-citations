#!/usr/bin/env python3
"""Batch parse all claim PDFs using Reducto API.

Iterates all PDFs in public/data/, parses each with Reducto (agentic mode),
and saves .reducto.json + .md files. Generates sources_index.json.

Usage:
    python3 scripts/batch_parse.py
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path

# Reuse the core functions from parse_with_bboxes.py
SCRIPT_DIR = Path(__file__).parent
sys.path.insert(0, str(SCRIPT_DIR))
from parse_with_bboxes import get_api_key, upload_file, parse_and_get_raw_result

DATA_DIR = Path(__file__).resolve().parent.parent / "public" / "data"
SKIP_PDFS = {"form-a.pdf", "form-b.pdf"}
BASE_URL = "https://platform.reducto.ai"


def slugify(filename: str) -> str:
    """Convert a PDF filename to a URL-safe slug."""
    name = filename.replace(".pdf", "").replace(".PDF", "")
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug


def extract_markdown(reducto_data: dict) -> str:
    """Extract markdown content from Reducto JSON result."""
    result = reducto_data.get("result", reducto_data)
    chunks = result.get("chunks", [])
    parts = []
    for chunk in chunks:
        content = chunk.get("content", "")
        if content:
            parts.append(content)
    return "\n\n".join(parts)


def get_page_count(reducto_data: dict) -> int:
    """Get page count from Reducto JSON."""
    # Try usage.num_pages first
    num_pages = reducto_data.get("usage", {}).get("num_pages")
    if num_pages:
        return num_pages
    # Fallback: find max page number in blocks
    result = reducto_data.get("result", reducto_data)
    max_page = 0
    for chunk in result.get("chunks", []):
        for block in chunk.get("blocks", []):
            bbox = block.get("bbox", {})
            page = bbox.get("page", 0)
            if page > max_page:
                max_page = page
    return max_page or 1


def main():
    api_key = get_api_key()
    if not api_key:
        print("Error: REDUCTO_API_KEY not found.")
        print("Set REDUCTO_API_KEY env var or create ~/.reducto/config.yaml with api_key field.")
        sys.exit(1)

    # Find all PDFs
    pdfs = sorted(DATA_DIR.glob("*.pdf"))
    pdfs = [p for p in pdfs if p.name not in SKIP_PDFS]
    print(f"Found {len(pdfs)} PDFs to process (skipping {', '.join(SKIP_PDFS)})\n")

    sources_index = []

    for i, pdf_path in enumerate(pdfs, 1):
        slug = slugify(pdf_path.name)
        json_path = DATA_DIR / f"{slug}.reducto.json"
        md_path = DATA_DIR / f"{slug}.md"
        display_name = pdf_path.stem  # Filename without .pdf

        print(f"[{i}/{len(pdfs)}] {pdf_path.name}")
        print(f"  Slug: {slug}")

        called_api = False
        if json_path.exists():
            print(f"  .reducto.json already exists, loading...")
            with open(json_path) as f:
                reducto_data = json.load(f)
        else:
            print(f"  Parsing with Reducto...")
            try:
                reducto_data = parse_and_get_raw_result(BASE_URL, api_key, str(pdf_path))
                with open(json_path, "w") as f:
                    json.dump(reducto_data, f, indent=2)
                print(f"  Saved {json_path.name}")
                called_api = True
            except Exception as e:
                print(f"  ERROR: {e}")
                continue

        # Extract and save markdown
        md_content = extract_markdown(reducto_data)
        with open(md_path, "w") as f:
            f.write(md_content)
        print(f"  Saved {md_path.name} ({len(md_content)} chars)")

        # Get page count
        page_count = get_page_count(reducto_data)

        sources_index.append({
            "id": slug,
            "name": display_name,
            "file": f"/data/{pdf_path.name}",
            "pageCount": page_count,
            "mdFile": f"/data/{slug}.md",
            "jsonFile": f"/data/{slug}.reducto.json",
        })

        # Rate limit delay between API calls
        if called_api and i < len(pdfs):
            print(f"  Waiting 2s (rate limit)...")
            time.sleep(2)

        print()

    # Write sources index
    index_path = DATA_DIR / "sources_index.json"
    with open(index_path, "w") as f:
        json.dump(sources_index, f, indent=2)
    print(f"Wrote {index_path} with {len(sources_index)} sources")


if __name__ == "__main__":
    main()
