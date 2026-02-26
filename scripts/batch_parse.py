#!/usr/bin/env python3
"""Batch parse all claim documents using Reducto API.

Iterates all supported files in public/data/ (PDFs, text, CSV, DOCX, XLSX, MD),
parses each with Reducto (PDFs and structured files) or reads directly (markdown),
and saves .reducto.json + .md files. Generates sources_index.json with type info.

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
SKIP_FILES = {"form-a.pdf", "form-b.pdf"}
BASE_URL = "https://platform.reducto.ai"

# File extensions supported by the pipeline
PDF_EXTS = {".pdf"}
REDUCTO_EXTS = {".txt", ".csv", ".docx", ".xlsx"}  # Non-PDF files sent to Reducto
DIRECT_MD_EXTS = {".md"}  # Markdown files used directly (skip Reducto)
ALL_EXTS = PDF_EXTS | REDUCTO_EXTS | DIRECT_MD_EXTS


def slugify(filename: str) -> str:
    """Convert a filename to a URL-safe slug."""
    # Strip any known extension
    name = filename
    for ext in ALL_EXTS:
        if name.lower().endswith(ext):
            name = name[: -len(ext)]
            break
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
    # API key only required for Reducto-parsed files; we'll check lazily

    # Find all supported files
    all_files = []
    for ext in ALL_EXTS:
        all_files.extend(DATA_DIR.glob(f"*{ext}"))
    # Also catch uppercase extensions
    for ext in ALL_EXTS:
        all_files.extend(DATA_DIR.glob(f"*{ext.upper()}"))
    # Deduplicate and sort
    all_files = sorted(set(all_files))
    all_files = [f for f in all_files if f.name.lower() not in SKIP_FILES]
    # Exclude generated .md files (those with a corresponding .reducto.json or original file)
    generated_md_slugs = {f.name.replace(".reducto.json", "") for f in DATA_DIR.glob("*.reducto.json")}
    all_files = [
        f for f in all_files
        if not (f.suffix.lower() == ".md" and f.stem in generated_md_slugs)
    ]

    print(f"Found {len(all_files)} files to process (skipping {', '.join(SKIP_FILES)})\n")

    sources_index = []

    for i, file_path in enumerate(all_files, 1):
        ext = file_path.suffix.lower()
        slug = slugify(file_path.name)
        json_path = DATA_DIR / f"{slug}.reducto.json"
        md_path = DATA_DIR / f"{slug}.md"
        display_name = file_path.stem

        print(f"[{i}/{len(all_files)}] {file_path.name}")
        print(f"  Slug: {slug}")

        called_api = False

        if ext in PDF_EXTS:
            # PDF: parse with Reducto (existing flow)
            source_type = "pdf"
            if not api_key:
                print("Error: REDUCTO_API_KEY not found for PDF parsing.")
                print("Set REDUCTO_API_KEY env var or create ~/.reducto/config.yaml with api_key field.")
                sys.exit(1)

            if json_path.exists():
                print(f"  .reducto.json already exists, loading...")
                with open(json_path) as f:
                    reducto_data = json.load(f)
            else:
                print(f"  Parsing with Reducto...")
                try:
                    reducto_data = parse_and_get_raw_result(BASE_URL, api_key, str(file_path))
                    with open(json_path, "w") as f:
                        json.dump(reducto_data, f, indent=2)
                    print(f"  Saved {json_path.name}")
                    called_api = True
                except Exception as e:
                    print(f"  ERROR: {e}")
                    continue

            md_content = extract_markdown(reducto_data)
            with open(md_path, "w") as f:
                f.write(md_content)
            print(f"  Saved {md_path.name} ({len(md_content)} chars)")

            page_count = get_page_count(reducto_data)

            sources_index.append({
                "id": slug,
                "name": display_name,
                "file": f"/data/{file_path.name}",
                "type": "pdf",
                "pageCount": page_count,
                "mdFile": f"/data/{slug}.md",
                "jsonFile": f"/data/{slug}.reducto.json",
            })

        elif ext in REDUCTO_EXTS:
            # Non-PDF structured files: send to Reducto for markdown conversion
            source_type = "md"
            if not api_key:
                print("Error: REDUCTO_API_KEY not found for file parsing.")
                print("Set REDUCTO_API_KEY env var or create ~/.reducto/config.yaml with api_key field.")
                sys.exit(1)

            if json_path.exists():
                print(f"  .reducto.json already exists, loading...")
                with open(json_path) as f:
                    reducto_data = json.load(f)
            else:
                print(f"  Parsing {ext} with Reducto...")
                try:
                    reducto_data = parse_and_get_raw_result(BASE_URL, api_key, str(file_path))
                    with open(json_path, "w") as f:
                        json.dump(reducto_data, f, indent=2)
                    print(f"  Saved {json_path.name}")
                    called_api = True
                except Exception as e:
                    print(f"  ERROR: {e}")
                    continue

            md_content = extract_markdown(reducto_data)
            with open(md_path, "w") as f:
                f.write(md_content)
            print(f"  Saved {md_path.name} ({len(md_content)} chars)")

            sources_index.append({
                "id": slug,
                "name": display_name,
                "file": f"/data/{file_path.name}",
                "type": "md",
                "pageCount": 1,
                "mdFile": f"/data/{slug}.md",
                "jsonFile": f"/data/{slug}.reducto.json",
            })

        elif ext in DIRECT_MD_EXTS:
            # Markdown files: use directly, no Reducto needed
            source_type = "md"
            print(f"  Using markdown file directly (no Reducto)")

            # Copy/symlink to slug-based name if different
            with open(file_path) as f:
                md_content = f.read()
            if md_path != file_path:
                with open(md_path, "w") as f:
                    f.write(md_content)
                print(f"  Copied to {md_path.name} ({len(md_content)} chars)")
            else:
                print(f"  Already at {md_path.name} ({len(md_content)} chars)")

            sources_index.append({
                "id": slug,
                "name": display_name,
                "file": f"/data/{file_path.name}",
                "type": "md",
                "pageCount": 1,
                "mdFile": f"/data/{slug}.md",
            })

        # Rate limit delay between API calls
        if called_api and i < len(all_files):
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
