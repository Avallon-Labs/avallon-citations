#!/usr/bin/env python3
"""Assemble data.json from a previously saved extraction output.

Re-runs citation resolution without calling Claude again. Useful for iterating
on the citation matching logic or regenerating data.json after fixing find_citation.py.

Usage:
    python3 scripts/assemble_data_json.py
    python3 scripts/assemble_data_json.py --input path/to/extraction_raw.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
DATA_DIR = PROJECT_DIR / "public" / "data"

SCHEMA_PATH = SCRIPT_DIR / "schema.json"

sys.path.insert(0, str(SCRIPT_DIR))
from extract_schema import (
    flatten_schema, parse_extraction_response, resolve_citations, assemble_data_json,
)


def main():
    parser = argparse.ArgumentParser(description="Assemble data.json from extraction output")
    parser.add_argument(
        "--input", "-i",
        default=str(DATA_DIR / "extraction_raw.json"),
        help="Path to raw extraction JSON (default: public/data/extraction_raw.json)",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: {input_path} not found. Run extract_schema.py first.")
        sys.exit(1)

    with open(input_path) as f:
        response_text = f.read()

    extractions = parse_extraction_response(response_text)
    print(f"Loaded {len(extractions)} field extractions")

    index_path = DATA_DIR / "sources_index.json"
    if not index_path.exists():
        print(f"Error: {index_path} not found. Run batch_parse.py first.")
        sys.exit(1)

    with open(index_path) as f:
        sources = json.load(f)
    print(f"Loaded {len(sources)} sources")

    # Load schema
    with open(SCHEMA_PATH) as f:
        schema = json.load(f)
    print()

    print("Resolving citations...")
    resolved = resolve_citations(extractions, sources_index=sources)

    total_citations = sum(len(r["citations"]) for r in resolved)
    fields_with_citations = sum(1 for r in resolved if r["citations"])
    print(f"\nResolved {total_citations} citations across {fields_with_citations} fields\n")

    data = assemble_data_json(sources, resolved, schema)
    output_path = DATA_DIR / "data.json"
    with open(output_path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"Wrote {output_path} with {len(data['sources'])} sources and {len(data['fields'])} fields")


if __name__ == "__main__":
    main()
