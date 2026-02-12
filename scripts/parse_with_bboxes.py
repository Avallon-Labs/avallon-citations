#!/usr/bin/env python3
"""Parse a PDF using Reducto API and save the full raw JSON response (with bounding boxes)."""

import json
import os
import sys
import time
import requests
from pathlib import Path


def get_api_key() -> str:
    """Get Reducto API key from env var or config file."""
    api_key = os.environ.get("REDUCTO_API_KEY")
    if api_key:
        return api_key

    config_path = Path.home() / ".reducto" / "config.yaml"
    if config_path.exists():
        try:
            import yaml
            with open(config_path) as f:
                config = yaml.safe_load(f)
                api_key = config.get("api_key")
                if api_key:
                    return api_key
        except ImportError:
            # Try simple parsing without yaml module
            with open(config_path) as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("api_key:"):
                        return line.split(":", 1)[1].strip().strip('"').strip("'")

    return None


def upload_file(base_url: str, api_key: str, file_path: str) -> str:
    """Upload file and get reducto:// URL."""
    with open(file_path, "rb") as f:
        files = {"file": (Path(file_path).name, f)}
        resp = requests.post(
            f"{base_url}/upload",
            headers={"Authorization": f"Bearer {api_key}"},
            files=files,
        )
        resp.raise_for_status()
        data = resp.json()

    file_id = data["file_id"]
    if not file_id.startswith("reducto://"):
        file_id = f"reducto://{file_id}"
    return file_id


def parse_and_get_raw_result(base_url: str, api_key: str, file_path: str) -> dict:
    """Upload, parse, poll, and return the complete raw JSON response."""
    headers_json = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    headers_auth = {"Authorization": f"Bearer {api_key}"}

    # 1. Upload
    print(f"Uploading {file_path}...")
    file_url = upload_file(base_url, api_key, file_path)
    print(f"Uploaded: {file_url}")

    # 2. Submit parse job (same settings as parse_reducto.py)
    payload = {
        "input": file_url,
        "enhance": {
            "agentic": [
                {"scope": "table"},
                {"scope": "text"},
                {"scope": "figure"},
            ],
        },
        "formatting": {
            "table_output_format": "html",
            "add_page_markers": True,
        },
        "settings": {
            "force_url_result": False,
        },
    }

    print("Submitting parse job...")
    resp = requests.post(f"{base_url}/parse_async", headers=headers_json, json=payload)
    resp.raise_for_status()
    job_id = resp.json()["job_id"]
    print(f"Job ID: {job_id}")

    # 3. Poll until complete
    while True:
        resp = requests.get(f"{base_url}/job/{job_id}", headers=headers_auth)
        resp.raise_for_status()
        job_result = resp.json()
        status = job_result.get("status")

        if status == "Completed":
            print("Parse completed!")
            break
        elif status == "Failed":
            reason = job_result.get("reason", "unknown")
            print(f"Parse failed: {reason}")
            sys.exit(1)
        else:
            progress = job_result.get("progress")
            if progress:
                print(f"Status: {status} ({progress}%)...")
            else:
                print(f"Status: {status}...")
            time.sleep(5)

    # 4. Extract the full result, handling URL result type
    parse_result = job_result.get("result", {})

    if parse_result.get("result", {}).get("type") == "url":
        url = parse_result["result"]["url"]
        print(f"Downloading result from {url}...")
        download_resp = requests.get(url)
        download_resp.raise_for_status()
        parse_result = download_resp.json()

    return parse_result


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Parse a PDF with Reducto and save the full raw JSON (with bounding boxes)."
    )
    parser.add_argument("file", help="PDF file to parse")
    parser.add_argument(
        "--output",
        "-o",
        help="Output JSON file (default: <input>.reducto.json in same directory)",
    )
    args = parser.parse_args()

    # Validate input
    input_path = Path(args.file)
    if not input_path.exists():
        print(f"Error: File not found: {input_path}")
        sys.exit(1)

    # Default output path
    if args.output:
        output_path = Path(args.output)
    else:
        output_path = input_path.with_suffix(".reducto.json")

    # Get API key
    api_key = get_api_key()
    if not api_key:
        print("Error: REDUCTO_API_KEY not found.")
        print("Set REDUCTO_API_KEY env var or create ~/.reducto/config.yaml with api_key field.")
        sys.exit(1)

    base_url = "https://platform.reducto.ai"

    # Run the parse
    raw_result = parse_and_get_raw_result(base_url, api_key, str(input_path))

    # Save full raw JSON
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(raw_result, f, indent=2)
    print(f"Saved raw JSON to {output_path}")

    # Print summary info
    usage = raw_result.get("usage", {})
    num_pages = usage.get("num_pages")
    if num_pages is not None:
        print(f"Page count: {num_pages}")

    result_obj = raw_result.get("result", raw_result)
    chunks = result_obj.get("chunks", [])
    print(f"Number of chunks: {len(chunks)}")

    # Count blocks with bounding boxes
    bbox_count = 0
    for chunk in chunks:
        for block in chunk.get("blocks", []):
            if "bbox" in block:
                bbox_count += 1
    print(f"Blocks with bounding boxes: {bbox_count}")


if __name__ == "__main__":
    main()
