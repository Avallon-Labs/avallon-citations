# Extraction Citations — Prototype

Working prototype for tracing extracted values back to their source documents with pixel-precise bounding boxes.

**Live demo:** [avallon-citations.vercel.app](https://avallon-citations.vercel.app/)

## What this is

A Next.js viewer + Python extraction pipeline that demonstrates end-to-end citations for document extraction. Given 27 workers' comp PDFs, it extracts 84 fields via Claude, resolves each value to the exact source region in the original PDF, and lets you click a citation to highlight it.

## Docs

- [**PRD**](docs/CITATIONS_PRD.md) — Product requirements for shipping citations in Avallon
- [**Tech Proposal**](docs/CITATIONS_TECH_PROPOSAL.md) — Implementation plan for core-plane + avallon
- [**Pipeline**](docs/PIPELINE.md) — How the prototype extraction + citation pipeline works

## Running locally

```bash
# Viewer
npm install && npm run dev

# Pipeline (optional — data.json is already included)
python3 scripts/batch_parse.py        # requires REDUCTO_API_KEY
python3 scripts/extract_schema.py     # requires ANTHROPIC_API_KEY
python3 scripts/assemble_data_json.py # re-run citation resolution only
```
