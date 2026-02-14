# **Extraction Citations**

## **Why**

> What problem are we solving? Who feels the pain? Why now?

When users review an extraction, they see extracted values next to the source documents — but nothing connects the two. There's no way to tell where a value came from without manually re-reading every document. For Athens, this is a blocker: they need auditable extractions where every value traces back to a specific document, page, and line. Today, debugging a single wrong field means scrubbing through 20+ PDFs by hand. A [working prototype](https://avallon-citations.vercel.app/) proves the UX end-to-end.

## **Requirements**

> What must be true for this to ship?

- [ ] Every non-null extracted field has one or more citations linking it to a source document, page, and highlighted region
- [ ] Clicking a citation navigates to the correct document and page, and highlights the exact region the value was extracted from
- [ ] Citations work with existing extractor schemas — no changes required to JSON Schema or `x_extraction` format
- [ ] Citations are non-intrusive: visible on hover/expand, with a subtle "N sources" hint always visible per field
- [ ] Graceful degradation: PDFs get bbox highlighting; images and other file types show document + page link only

## **Scope**

> What are we building?

- **Backend:** Store bounding box coordinates from document parsing, modify extraction prompt to return per-field source citations, resolve text snippets to bboxes, serve citations via the extracts API
- **Frontend:** Citation-aware data panel with collapsible categories and citation badges, PDF bbox highlighting overlay, click-to-navigate flow (badge click → document tab → page → highlight)

## **Not Building**

> What is explicitly out of scope?

- Confidence scores per field (future)
- Inline editing or correction of extracted values
- Citation-based filtering ("show fields missing citations")
- Re-extraction from a selected document region
- Changes to extractor schema format

## **Execution**

**Tech Proposal:** [CITATIONS_TECH_PROPOSAL.md](./CITATIONS_TECH_PROPOSAL.md)

**Linear:** [ENG-390](https://linear.app/avallon/issue/ENG-390/extraction-citations-trace-extracted-values-to-source-documents)
