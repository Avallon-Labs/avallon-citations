export interface Source {
  id: string;
  name: string;
  file: string;
  type?: "pdf" | "text" | "csv" | "md";
  pageCount: number;
  mdFile?: string;
}

// Citation is a discriminated union
export interface PdfCitation {
  type: "pdf";
  sourceId: string;
  page: number;
  bbox: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

export interface TextCitation {
  type: "text";
  sourceId: string;
  startOffset: number;
  endOffset: number;
  snippet: string;
}

export interface MdCitation {
  type: "md";
  sourceId: string;
  snippet: string;
  // Present for table region citations
  tableIndex?: number;
  startRow?: number;
  endRow?: number;     // inclusive, defaults to startRow
  startCol?: number;   // omit startCol/endCol to highlight full rows
  endCol?: number;     // inclusive, defaults to startCol
}

export type Citation = PdfCitation | TextCitation | MdCitation;

export interface ExtractedField {
  id: string;
  label: string;
  value: string;
  citations: Citation[];
  category?: string;
}

export interface ExtractionData {
  sources: Source[];
  fields: ExtractedField[];
}

// ActiveCitation is also a discriminated union
export interface ActivePdfCitation {
  type: "pdf";
  sourceId: string;
  page: number;
  bbox: PdfCitation["bbox"];
}

export interface ActiveTextCitation {
  type: "text";
  sourceId: string;
  startOffset: number;
  endOffset: number;
}

export interface ActiveMdCitation {
  type: "md";
  sourceId: string;
  snippet: string;
  tableIndex?: number;
  startRow?: number;
  endRow?: number;
  startCol?: number;
  endCol?: number;
}

export type ActiveCitation = ActivePdfCitation | ActiveTextCitation | ActiveMdCitation;

// Normalization helpers for backward compatibility with legacy data.json
export function normalizeCitation(raw: Record<string, unknown>): Citation {
  if (raw.type === "text") {
    return raw as unknown as TextCitation;
  }
  if (raw.type === "md") {
    return raw as unknown as MdCitation;
  }
  return {
    type: "pdf",
    sourceId: raw.sourceId as string,
    page: raw.page as number,
    bbox: raw.bbox as PdfCitation["bbox"],
  };
}

export function normalizeSource(raw: Record<string, unknown>): Source {
  return {
    ...raw,
    type: (raw.type as Source["type"]) ?? "pdf",
  } as Source;
}

// Compare a citation against an active citation
export function citationMatches(c: Citation, active: ActiveCitation): boolean {
  if (c.type !== active.type) return false;
  if (c.type === "pdf" && active.type === "pdf") {
    return (
      c.sourceId === active.sourceId &&
      c.page === active.page &&
      c.bbox.left === active.bbox.left &&
      c.bbox.top === active.bbox.top
    );
  }
  if (c.type === "text" && active.type === "text") {
    return (
      c.sourceId === active.sourceId &&
      c.startOffset === active.startOffset &&
      c.endOffset === active.endOffset
    );
  }
  if (c.type === "md" && active.type === "md") {
    if (c.tableIndex !== undefined && active.tableIndex !== undefined) {
      return (
        c.sourceId === active.sourceId &&
        c.tableIndex === active.tableIndex &&
        c.startRow === active.startRow &&
        c.endRow === active.endRow &&
        c.startCol === active.startCol &&
        c.endCol === active.endCol
      );
    }
    return c.sourceId === active.sourceId && c.snippet === active.snippet;
  }
  return false;
}
