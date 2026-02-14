# Citations — Tech Proposal

**PRD:** [CITATIONS_PRD.md](./CITATIONS_PRD.md) | **Linear:** [ENG-390](https://linear.app/avallon/issue/ENG-390/extraction-citations-trace-extracted-values-to-source-documents) | **Prototype:** [avallon-citations.vercel.app](https://avallon-citations.vercel.app/)

---

## Current State

### How extraction works today (core-plane)

1. Documents are parsed via Reducto → chunks stored in `artifact_chunks` with embeddings for vector search
2. `run-extractor-jobs.ts` loads an extractor schema, retrieves document context (full-context if <200K tokens, vector search if larger), and calls the LLM
3. LLM returns a flat JSON object matching the schema → stored as `Extract.result` (`Record<string, unknown>`)
4. No provenance — `Extract.result` has no record of which documents or regions produced each value

### What's already halfway there

- **Reducto adapter** already receives full bbox per block: `{ page, left, top, width, height }` — but only `page` and `section` are persisted to `artifact_chunks`
- **`ExtractionContext.source`** already tracks `{ artifactId, documentName, page, score }` per retrieved chunk — but this isn't surfaced per-field
- **`ReviewExtractionModal`** already has a split-pane layout (2/3 document, 1/3 data) — but the data side is a generic `JsonPretty` viewer with no citation awareness

### Current types

```typescript
// core-plane: domain/repositories/artifact.ts
type ArtifactChunk = {
  id: string; artifactId: string; tenantId: string;
  page: number | null;       // ← has page
  section: string | null;    // ← has section
  text: string; tokenCount: number | null; embedding: number[];
  // NO bbox coordinates
};

// core-plane: domain/repositories/system/extract.ts
type SystemExtract = {
  id: string; tenantId: string; extractorId: string; extractorVersion: number;
  jobId: string; extractorJobScope: Record<string, unknown>;
  result: Record<string, unknown>;  // ← flat JSON, no provenance
  createdAt: Date;
};
```

---

## How the Prototype Pipeline Works

The `avallon-citations/` repo proves the full concept. See [PIPELINE.md](./PIPELINE.md) for the detailed walkthrough. Summary:

```
PDFs → Reducto API → blocks with bboxes (.reducto.json)
                    → markdown text (.md)
                    → sources_index.json

All markdown → Claude prompt (schema + citation instructions) → extraction_raw.json
  └─ Per field: { field_key, value, citations: [{ source_id, text_snippet }] }

Per citation → find_citation.py → fuzzy match snippet against blocks → bbox
  └─ Two-tier scoring: substring match ≥ 0.5 (always wins), fuzzy ≤ 0.49

Resolved fields + bboxes → data.json → viewer (DataPanel + PdfViewer with bbox overlay)
```

**Key design decision:** The LLM returns *text snippets* as citations (not chunk IDs). We then fuzzy-match snippets against Reducto blocks to get bboxes. This decouples the LLM from the storage layer — the model just quotes the source text, and resolution happens post-hoc.

---

## Implementation Plan

### Track 1: Backend (core-plane)

**Step 1 — Store bboxes in artifact_chunks** (migration + adapter change)

Add nullable float columns to `artifact_chunks`:

```sql
ALTER TABLE artifact_chunks
  ADD COLUMN bbox_left   real,
  ADD COLUMN bbox_top    real,
  ADD COLUMN bbox_width  real,
  ADD COLUMN bbox_height real;
```

Update `ArtifactChunk` type and `addChunksWithEmbeddings()` in the Supabase artifacts repo. The Reducto adapter already has `ReductoBlock.bbox` with all four values — wire them through to chunk creation.

**Step 2 — Add citation instructions to extraction prompt**

Extend `DEFAULT_EXTRACTOR_PROMPT` to instruct the LLM to return a `_citations` map alongside the schema-conforming result:

```json
{
  "date_of_injury": "09/12/2024",
  "_citations": {
    "date_of_injury": [
      { "artifact_id": "abc-123", "text_snippet": "date of injury 09/12/2024 at about 19:15" }
    ]
  }
}
```

The `_citations` key is stripped before storing `result` and processed separately. In full-context mode, the prompt includes artifact IDs per document section. In vector search mode, each retrieved chunk already has an artifact ID and page.

**Step 3 — Citation resolution function**

New domain function: `resolveCitations(citations, artifactChunks) → ResolvedCitation[]`

Port the matching logic from the prototype's `find_citation.py`:
- Load chunks for the cited artifact
- Strip HTML from both sides (`<tr>`, `<td>`, etc. from Reducto table blocks)
- Score each chunk: substring match ≥ 0.5, fuzzy (SequenceMatcher + LCS) capped at 0.49
- Return best match's bbox, or skip if score < 0.1
- Prefer shorter chunks on score ties (tighter bbox)

**Step 4 — Store and serve citations**

Add `citations` JSONB column to `extracts` table:

```typescript
type ExtractCitation = {
  fieldPath: string;      // "litigation.is_litigated"
  artifactId: string;
  documentName: string;
  page: number;
  bbox: { left: number; top: number; width: number; height: number } | null;
};
```

Wire into `executeBasicExtractorJob()`: after LLM response, resolve citations, store alongside result. Extend `GET /v1/extracts/{id}` response to include `citations`.

### Track 2: Frontend (avallon)

**Step 5 — Citation-aware DataPanel**

Adapt the prototype's `DataPanel.tsx` to work within `ReviewExtractionModal`. Replace `JsonPretty` in the right panel with:
- Collapsible category sections grouping related fields
- Per-field: label, formatted value, citation badges on hover/expand
- "N sources" hint always visible
- Copy-to-clipboard, boolean Yes/No badges, long-value truncation

Reference: prototype `components/DataPanel.tsx` + `components/CitationBadge.tsx`

**Step 6 — PDF bbox highlighting**

Add canvas overlay to the `FileViewer` component for PDFs:
- Second `<canvas>` positioned absolutely over the PDF embed/render
- On active citation: draw blue rectangle at `(bbox.left * width, bbox.top * height)` with 15s fade
- Works with the existing `<object>` PDF embed or can switch to pdf.js for page-level control

Reference: prototype `components/PdfViewer.tsx`

**Step 7 — Wire interaction**

Citation click flow:
1. `onCitationClick(artifactId, page, bbox)` → set `activeCitation` state
2. Switch `selectedArtifactIndex` to match the cited artifact
3. For PDFs: navigate to page, draw bbox overlay
4. In DataPanel: highlight the field row (amber left border) that matches the active citation

Update `Extract` frontend type to include `citations: ExtractCitation[]`.

---

## Dependency Graph

```
Step 1 (bbox columns) ─────┐
                            ├── Step 3 (resolution fn) ── Step 4 (store/serve)
Step 2 (prompt changes) ────┘                                    │
                                                                 │
Step 5 (DataPanel) ─────────┐                                    │
                            ├── Step 7 (wire interaction) ◄──────┘
Step 6 (PDF highlight) ─────┘
```

Steps 1+2 and Steps 5+6 can run in parallel. Step 7 is the integration point.

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Citation instructions increase prompt size, hitting the 200K token threshold sooner | Measure token overhead (~500 tokens for instructions). For vector search mode, citations come from already-retrieved chunks — minimal overhead |
| Fuzzy matching accuracy degrades with noisy/large document sets | Prototype achieves 155/155 on 27 PDFs. Test with diverse customer document sets early. The two-tier scoring (substring always beats fuzzy) is robust by design |
| Existing extractions have no citations | Show "no citations available" gracefully. Offer re-extraction as a follow-up |
| PDF bbox highlighting requires page-level rendering control | Current `ReviewExtractionModal` uses `<object>` for PDFs. May need to switch to pdf.js for overlay support (prototype already uses pdf.js) |

---

## Key Files

### Prototype (avallon-citations)
| File | Role |
|------|------|
| `scripts/find_citation.py` | Fuzzy matching: text snippet → bbox |
| `scripts/extract_schema.py` | Prompt with citation instructions, resolution pipeline |
| `components/DataPanel.tsx` | Citation-aware field viewer |
| `components/CitationBadge.tsx` | Clickable citation badge |
| `components/PdfViewer.tsx` | PDF renderer with bbox overlay |
| `lib/types.ts` | `Citation`, `ExtractedField`, `ActiveCitation` types |

### Production (core-plane)
| File | What changes |
|------|-------------|
| `src/domain/repositories/artifact.ts` | Add bbox fields to `ArtifactChunk` |
| `src/infrastructure/reducto_adapter.ts` | Persist bbox from `ReductoBlock` |
| `src/domain/extractors/default_prompt.ts` | Add citation instructions |
| `src/domain/use-cases/run-extractor-jobs.ts` | Wire citation resolution + storage |
| `src/domain/repositories/system/extract.ts` | Add `citations` to `SystemExtract` |
| `src/interfaces/lambda-http/v1/extracts/get-extract/` | Return citations in API response |

### Production (avallon)
| File | What changes |
|------|-------------|
| `src/components/extraction/review-extraction-modal.tsx` | Add DataPanel, PDF overlay, citation click flow |
| `src/components/json-view/json-pretty.tsx` | May be replaced by citation-aware DataPanel |
| `src/domains/emails/components/extracted-data-card.tsx` | Show citation summary |
