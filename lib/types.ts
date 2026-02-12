export interface Source {
  id: string;
  name: string;
  file: string;
  pageCount: number;
}

export interface Citation {
  sourceId: string;
  page: number;
  bbox: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

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

export interface ActiveCitation {
  sourceId: string;
  page: number;
  bbox: Citation["bbox"];
}
