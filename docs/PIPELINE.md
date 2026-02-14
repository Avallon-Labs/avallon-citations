# Extraction Pipeline with Citations — Architecture Overview

## What This Does

Given a folder of PDF documents from a workers' compensation claim, the pipeline:

1. Parses each PDF into structured text blocks with pixel-precise bounding boxes
2. Sends all document text to Claude with a target schema (84 fields across 28 categories)
3. Claude extracts values and cites the exact text snippets it read
4. Each snippet is matched back to the original PDF block to get a bounding box
5. A viewer renders the PDF on the left and extracted data on the right — clicking a citation highlights the exact region in the PDF

The key insight: Reducto gives us **block-level bounding boxes**, and Claude gives us **text snippets**. By fuzzy-matching snippets to blocks, we bridge LLM extraction to pixel-precise PDF coordinates without any vision model.

---

## Pipeline Steps

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          PIPELINE OVERVIEW                             │
│                                                                        │
│   PDFs ──► Reducto API ──► Claude Extraction ──► Citation Matching     │
│                                                                        │
│   Step 1        Step 2          Step 3              Step 4             │
│  batch_parse  batch_parse    extract_schema      find_citation         │
│                                                                        │
│   Output:      Output:         Output:             Output:             │
│  .reducto.json  .md files    extraction_raw.json   data.json           │
│  (blocks+bbox)  (text)       (values+snippets)    (values+bboxes)     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### Step 1: PDF Parsing with Reducto (`batch_parse.py` → `parse_with_bboxes.py`)

**Script:** `scripts/batch_parse.py` (calls `parse_with_bboxes.py` internally)

**What it does:** Iterates every PDF in `public/data/`, uploads each to the Reducto API, and saves the full parsing result.

**Reducto API call details:**
- Endpoint: `POST https://platform.reducto.ai/parse_async`
- Mode: **Agentic** parsing with table, text, and figure scopes
- Tables output as **HTML** (preserves structure)
- Page markers enabled (so we know which page each block is on)

**What Reducto returns:** For each PDF, a JSON structure with `chunks` → `blocks`. Each block has:
- `content`: the text/HTML content of that block
- `type`: "Text", "Table", "Title", "Page Number", etc.
- `bbox`: `{ page, left, top, width, height }` — normalized 0–1 coordinates on the page

**Concrete example — one block from a parsed PDF:**
```json
{
  "type": "Text",
  "content": "PTP Dr. Nguyen declares P&S/MMI as of 04/10/2025 for all accepted conditions.",
  "bbox": {
    "page": 1,
    "left": 0.068,
    "top": 0.441,
    "width": 0.861,
    "height": 0.035
  }
}
```

This means: on page 1, starting at 6.8% from the left edge and 44.1% from the top, there's a text block spanning 86.1% width and 3.5% height that contains that sentence.

**Outputs per PDF:**
| File | Contents |
|------|----------|
| `{slug}.reducto.json` | Full Reducto response with all blocks and bounding boxes |
| `{slug}.md` | Concatenated markdown/text content (for feeding to Claude) |

**Aggregate output:**
| File | Contents |
|------|----------|
| `sources_index.json` | Registry of all sources: `[{ id, name, file, pageCount, mdFile, jsonFile }]` |

**Performance notes:**
- Caches results: if `.reducto.json` exists, skips the API call
- 2-second delay between API calls for rate limiting
- ~26 PDFs takes about 3–5 minutes

---

### Step 2: Schema-Driven Extraction with Claude (`extract_schema.py`)

**Script:** `scripts/extract_schema.py`

**What it does:** Loads all the markdown documents, constructs a single large prompt with the target schema, and asks Claude to extract every field with supporting text citations.

#### 2a. Schema Flattening

The schema (`scripts/schema.json`) is a nested JSON Schema with 28 top-level categories and 84 leaf fields. The `flatten_schema()` function walks the tree and produces a flat list:

```
Schema (nested)                           Flattened
─────────────────                         ─────────
{                                         [
  "litigation": {                           { key: "litigation.adj_number",
    "adj_number": { ... },                    type: "string",
    "is_litigated": { ... },                  description: "ADJ number..." },
    ...                                     { key: "litigation.is_litigated",
  },                                          type: "boolean",
  "liens": {                                  description: "Whether..." },
    "filed_liens": {                        { key: "liens.filed_liens",
      type: "array",                          type: "array",
      items: { ... }                          is_array: true,
    }                                         array_item_fields: [...] },
  }                                         ...
}                                         ]
```

Each field carries:
- `key`: dotted path like `"litigation.is_litigated"`
- `type`: string, boolean, number, array, or enum
- `description`: what to extract
- `query` (optional): example text patterns to look for (from `x_extraction.query`)
- `enum` (optional): allowed values
- `array_item_fields` (for arrays): sub-fields of each array item

#### 2b. Prompt Construction

The `build_extraction_prompt()` function assembles a single prompt with:

1. **System context**: "You are an expert data extraction agent for workers' compensation insurance claims."

2. **Target fields listing**: All 84 fields with types, descriptions, and search hints:
   ```
   - **litigation.is_litigated** (boolean): Whether claim is litigated
   - **liens.filed_liens** (array): List of filed liens...
     Array items have fields: [amount (string): Lien amount, lienholder (string): ...]
   ```

3. **All documents concatenated**: Each source's markdown content under a header:
   ```
   ### Source: adjuster-activity-log-claim-notes
   Title: Adjuster Activity Log _Claim Notes

   [full markdown content of the document]
   ```

4. **Output format instructions**: Return JSON with this structure:
   ```json
   {
     "extractions": [
       {
         "field_key": "claimed_injury_description.date_of_injury",
         "value": "09/12/2024",
         "citations": [
           {
             "source_id": "adjuster-activity-log-claim-notes",
             "text_snippet": "date of injury 09/12/2024 at about 19:15"
           }
         ]
       }
     ]
   }
   ```

5. **Critical rules:**
   - `text_snippet` must be an **exact substring** from the source document (15–80 chars)
   - **No HTML tags** in snippets — plain text only
   - Up to 3 citations per field (from different sources)
   - Include all 84 fields, even if value is null

#### 2c. Claude API Call

- Model: `claude-sonnet-4-5-20250929`
- Max tokens: 16,384 (large enough for 84 fields with citations)
- Single-shot extraction (no multi-turn or agentic loop — one prompt, one response)

**Prompt size:** ~120,000 characters (26 documents + schema + instructions)

#### 2d. Output

Claude returns a JSON object with 84 extraction entries. The raw response is saved to `extraction_raw.json` for debugging and re-processing.

**Example of what Claude returns:**
```json
{
  "field_key": "mmi_status.mmi_date",
  "value": "04/10/2025",
  "citations": [
    {
      "source_id": "adjuster-activity-log-claim-notes",
      "text_snippet": "PTP Dr. Nguyen declares P&S/MMI as of 04/10/2025"
    },
    {
      "source_id": "medical-status-and-treating-physician-snapshot",
      "text_snippet": "P&S/MMI declared 04/10/2025"
    }
  ]
}
```

---

### Step 3: Citation Resolution — Snippet → Bounding Box (`find_citation.py`)

**Script:** `scripts/find_citation.py` (called by `extract_schema.py` for each citation)

**What it does:** Takes a `source_id` and a `text_snippet` from Claude's output, finds the Reducto block that best matches, and returns its bounding box.

#### How matching works

For each citation, the function:

1. **Loads all blocks** from `{source_id}.reducto.json`
2. **Strips HTML** from both the block content and the snippet (Reducto tables contain `<tr><td>...` tags)
3. **Scores every block** against the snippet using a two-tier system:

```
Scoring Algorithm
─────────────────

Tier 1: Substring Match (score ≥ 0.5)
  If snippet is found inside block text:
    score = 0.5 + (snippet_length / block_length) × 0.5
    Range: 0.50 – 1.00

  If block text is found inside snippet:
    score = 0.5 + (block_length / snippet_length) × 0.4
    Range: 0.50 – 0.90

Tier 2: Fuzzy Match (score ≤ 0.49)
  Uses SequenceMatcher ratio + longest common subsequence
  score = min(fuzzy_score, 0.49)

  This ensures a fuzzy match NEVER beats a real substring match.
```

4. **Returns the best-scoring block's bounding box**

**Why the two-tier scoring matters:**

Before this fix, we had a bug where "- TTD ends 02/29/2025." (a short, unrelated block) scored higher than the correct block containing "PTP Dr. Nguyen declares P&S/MMI as of 04/10/2025" because the fuzzy matcher gave inflated scores to short blocks. The two-tier system guarantees that any actual substring match always wins.

**Example resolution:**

```
Input:
  source_id: "adjuster-activity-log-claim-notes"
  snippet:   "PTP Dr. Nguyen declares P&S/MMI as of 04/10/2025"

Scoring (simplified):
  Block 49: "- TTD ends 02/29/2025."
    → No substring match
    → Fuzzy score: 0.299 (capped at 0.49)

  Block 52: "PTP Dr. Nguyen declares P&S/MMI as of 04/10/2025 for all accepted..."
    → Substring match! snippet ⊂ block
    → Score: 0.5 + (49/176 × 0.5) = 0.639

  Winner: Block 52 ✓

Output:
  { "sourceId": "adjuster-activity-log-claim-notes",
    "page": 1,
    "bbox": { "left": 0.068, "top": 0.441, "width": 0.861, "height": 0.035 } }
```

---

### Step 4: Assembly → `data.json`

**Script:** `scripts/extract_schema.py` (final stage) or `scripts/assemble_data_json.py` (standalone re-run)

**What it does:** Combines the extraction values with the resolved bounding boxes into the final `data.json` that the viewer consumes.

For each extraction:
1. Skip fields with null values
2. Format the display value (booleans → "Yes"/"No", arrays → readable strings)
3. Map the dotted key to a human-readable label (`"mmi_status.mmi_date"` → `"Mmi Date"`)
4. Map the top-level key to a category label (`"mmi_status"` → `"MMI Status"`)
5. Attach resolved citation bounding boxes

**Final `data.json` structure:**
```json
{
  "sources": [
    { "id": "adjuster-activity-log-claim-notes",
      "name": "Adjuster Activity Log _Claim Notes",
      "file": "/data/Adjuster Activity Log _Claim Notes.pdf",
      "pageCount": 2 }
  ],
  "fields": [
    { "id": "f3",
      "label": "Date",
      "value": "12/05/2025",
      "category": "Metadata",
      "citations": [
        { "sourceId": "claim-metadata-snapshot",
          "page": 1,
          "bbox": { "left": 0.068, "top": 0.137, "width": 0.861, "height": 0.133 } }
      ] }
  ]
}
```

---

### Step 5: Viewer (Next.js App)

The viewer is a static Next.js app that loads `data.json` at runtime:

```
┌──────────┬────────────────────────────────┬─────────────────────────┐
│          │  Source Tabs (pill-style)       │  Extracted Data         │
│  Sidebar │  ┌──────┐ ┌──────┐ ┌──────┐   │  ┌─ Liens (2 fields)   │
│          │  │ Doc A │ │ Doc B│ │ Doc C│   │  │  Filed Liens: None  │
│  Avallon │  └──────┘ └──────┘ └──────┘   │  │    [Source p.1]     │
│   Nav    │  ┌─────────────────────────┐   │  │  Expected: ...      │
│          │  │                         │   │  ├─ Metadata (2)       │
│          │  │    PDF Renderer         │   │  │  Date: 12/05/2025   │
│          │  │    (pdfjs-dist)         │   │  │    [Source p.1]     │
│          │  │                         │ ◄─┼──│  Click a citation   │
│          │  │   ┌─────────────────┐   │   │  │  badge to highlight │
│          │  │   │ BBOX HIGHLIGHT  │   │   │  │  the source region  │
│          │  │   └─────────────────┘   │   │  │  in the PDF         │
│          │  │                         │   │  └─────────────────────│
│          │  └─────────────────────────┘   │                         │
│          │  [< Prev]  Page 1 of 2 [Next>] │  [Formatted] [Raw JSON] │
└──────────┴────────────────────────────────┴─────────────────────────┘
                        ↑ draggable divider ↑
```

**Citation click flow:**
1. User clicks a citation badge (e.g., "Adjuster Activity Log p.1")
2. If the source is different from what's displayed, switch to that PDF
3. Navigate to the correct page
4. Draw a blue rectangle on a canvas overlay at the bbox coordinates
5. Highlight fades out after 15 seconds

---

## Concrete End-to-End Example

Let's trace the field **"MMI Date"** through the entire pipeline:

### 1. PDF Input
The document "Medical Status and Treating Physician Snapshot.pdf" contains a line:
> "P&S/MMI declared 04/10/2025 by PTP Dr. Nguyen for all accepted conditions."

### 2. Reducto Parsing
Reducto parses this into a block:
```json
{
  "type": "Text",
  "content": "P&S/MMI declared 04/10/2025 by PTP Dr. Nguyen for all accepted conditions.",
  "bbox": { "page": 1, "left": 0.069, "top": 0.52, "width": 0.86, "height": 0.03 }
}
```

### 3. Claude Extraction
Claude reads all 26 documents and extracts:
```json
{
  "field_key": "mmi_status.mmi_date",
  "value": "04/10/2025",
  "citations": [
    {
      "source_id": "medical-status-and-treating-physician-snapshot",
      "text_snippet": "P&S/MMI declared 04/10/2025"
    }
  ]
}
```

### 4. Citation Resolution
`find_citation("medical-status-and-treating-physician-snapshot", "P&S/MMI declared 04/10/2025")`:
- Loads 15 blocks from the source's `.reducto.json`
- The snippet "P&S/MMI declared 04/10/2025" is a substring of block content
- Substring match score: 0.5 + (27/75 × 0.5) = 0.68
- Returns: `{ page: 1, bbox: { left: 0.069, top: 0.52, width: 0.86, height: 0.03 } }`

### 5. data.json Entry
```json
{
  "id": "f42",
  "label": "Mmi Date",
  "value": "04/10/2025",
  "category": "MMI Status",
  "citations": [
    { "sourceId": "medical-status-and-treating-physician-snapshot",
      "page": 1,
      "bbox": { "left": 0.069, "top": 0.52, "width": 0.86, "height": 0.03 } }
  ]
}
```

### 6. In the Viewer
The user sees "Mmi Date: 04/10/2025" in the MMI Status category. Below it is a citation badge "Medical Status and Treating Physician Snapshot p.1". Clicking it switches to that PDF, navigates to page 1, and draws a blue highlight rectangle at coordinates (6.9%, 52%) covering the line that says "P&S/MMI declared 04/10/2025".

---

## File Map

```
scripts/
├── schema.json              # Target extraction schema (84 fields, 28 categories)
├── batch_parse.py           # Step 1: Parse all PDFs with Reducto
├── parse_with_bboxes.py     # Low-level Reducto API client
├── extract_schema.py        # Steps 2-4: Claude extraction + citation resolution
├── find_citation.py         # Step 3: Fuzzy match snippets → bounding boxes
└── assemble_data_json.py    # Re-run Step 3-4 without calling Claude again

public/data/
├── *.pdf                    # Source PDF files
├── *.reducto.json           # Reducto parse results (blocks + bboxes)
├── *.md                     # Extracted markdown text per source
├── sources_index.json       # Source registry
├── extraction_raw.json      # Raw Claude response (for re-processing)
└── data.json                # Final viewer data (fields + citations + bboxes)

components/
├── Sidebar.tsx              # Avallon navigation sidebar
├── SourceTabs.tsx           # PDF source tab bar
├── PdfViewer.tsx            # PDF renderer with bbox overlay
├── DataPanel.tsx            # Extracted data with collapsible categories
└── CitationBadge.tsx        # Clickable citation link
```

---

## Running the Pipeline

```bash
# Step 1: Parse all PDFs (requires REDUCTO_API_KEY)
python3 scripts/batch_parse.py

# Step 2-4: Extract + resolve citations (requires ANTHROPIC_API_KEY)
python3 scripts/extract_schema.py

# Re-run citation resolution only (no Claude call, useful for iterating on matching)
python3 scripts/assemble_data_json.py

# Start the viewer
npm run dev
```

---

## What Works Well

- **Citation accuracy**: The two-tier scoring (substring ≥ 0.5, fuzzy ≤ 0.49) reliably maps Claude's snippets to the correct PDF regions. 155/155 citations resolved successfully on the current claim.
- **Schema coverage**: 84 fields across 28 categories covering the full workers' comp claim lifecycle. Supports strings, booleans, enums, numbers, and arrays of objects.
- **Single-shot extraction**: One Claude call extracts all 84 fields with citations. No agentic loop needed for the current document set size (~120K chars).

## Known Limitations / Production Considerations

- **No multi-turn or agentic loop**: Currently a single Claude call. For very large claims with 50+ documents, may need to chunk documents across multiple calls or use an iterative approach.
- **No deduplication of citations**: If Claude returns the same snippet twice, it creates two identical citation entries.
- **Hardcoded source slugs**: The source ID slugging logic in `batch_parse.py` must match between parsing and extraction. In production, use stable document IDs.
- **Static data**: The viewer loads a pre-computed `data.json`. In production, this would be generated on-demand via an API.
- **No confidence scores**: Claude doesn't indicate how confident it is in each extraction. Could be added as a prompt instruction.
- **HTML in Reducto output**: Tables come as HTML blocks. The `strip_html()` function handles this for matching, but very complex table structures may still cause matching issues.
