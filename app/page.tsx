"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Sparkles } from "lucide-react";
import type {
  ExtractionData,
  ActiveCitation,
  Citation,
  Source,
} from "@/lib/types";
import { normalizeCitation, normalizeSource } from "@/lib/types";
import PdfViewer from "@/components/PdfViewer";
import TextViewer from "@/components/TextViewer";
import DataPanel from "@/components/DataPanel";
import SourceTabs from "@/components/SourceTabs";
import Sidebar from "@/components/Sidebar";

export default function Home() {
  const [data, setData] = useState<ExtractionData | null>(null);
  const [activeSourceId, setActiveSourceId] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [activeCitation, setActiveCitation] = useState<ActiveCitation | null>(
    null
  );

  // Resizable split — store left panel width as percentage (of the content area)
  const [splitPercent, setSplitPercent] = useState(66);
  const [isDragging, setIsDragging] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Load data.json
  useEffect(() => {
    fetch("/data/data.json")
      .then((r) => r.json())
      .then((raw: { sources: Record<string, unknown>[]; fields: Record<string, unknown>[] }) => {
        // Normalize sources and citations for backward compatibility
        const sources = raw.sources.map((s) => normalizeSource(s));
        const fields = raw.fields.map((f: Record<string, unknown>) => ({
          ...f,
          citations: ((f.citations as Record<string, unknown>[]) || []).map(
            (c) => normalizeCitation(c)
          ),
        })) as ExtractionData["fields"];
        const d: ExtractionData = { sources, fields };
        setData(d);
        if (d.sources.length > 0) {
          setActiveSourceId(d.sources[0].id);
        }
      });
  }, []);

  const activeSource = data?.sources.find((s) => s.id === activeSourceId);

  const handleSourceChange = useCallback(
    (sourceId: string) => {
      setActiveSourceId(sourceId);
      setCurrentPage(1);
      setActiveCitation(null);
    },
    []
  );

  const handleCitationClick = useCallback(
    (citation: Citation) => {
      if (citation.sourceId !== activeSourceId) {
        setActiveSourceId(citation.sourceId);
      }
      if (citation.type === "pdf") {
        setCurrentPage(citation.page);
        setActiveCitation({
          type: "pdf",
          sourceId: citation.sourceId,
          page: citation.page,
          bbox: citation.bbox,
        });
      } else if (citation.type === "text") {
        setCurrentPage(1);
        setActiveCitation({
          type: "text",
          sourceId: citation.sourceId,
          startOffset: citation.startOffset,
          endOffset: citation.endOffset,
        });
      } else {
        setCurrentPage(1);
        setActiveCitation({
          type: "md",
          sourceId: citation.sourceId,
          snippet: citation.snippet,
          tableIndex: citation.tableIndex,
          startRow: citation.startRow,
          endRow: citation.endRow,
          startCol: citation.startCol,
          endCol: citation.endCol,
        });
      }
    },
    [activeSourceId]
  );

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
    setActiveCitation(null);
  }, []);

  // Drag handlers for the resizer
  const handleMouseDown = useCallback(() => {
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = contentRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = (x / rect.width) * 100;
      // Clamp between 30% and 80%
      setSplitPercent(Math.min(80, Math.max(30, pct)));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  if (!data) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Determine viewer type for active source
  const sourceType = activeSource?.type ?? "pdf";
  const isTextSource = sourceType === "text" || sourceType === "csv" || sourceType === "md";

  // Build viewer-specific active citation (only pass if source matches)
  const activeViewerCitation =
    activeCitation &&
    activeCitation.sourceId === activeSourceId &&
    (activeCitation.type === "text" || activeCitation.type === "md")
      ? activeCitation
      : null;

  const activePdfCitation =
    activeCitation?.type === "pdf" &&
    activeCitation.sourceId === activeSourceId
      ? activeCitation
      : null;

  return (
    <div className="h-screen flex bg-white">
      {/* Sidebar */}
      <Sidebar />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="border-b border-border px-6 py-3 flex items-center shrink-0 bg-white">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            <h1 className="text-lg font-semibold text-foreground">
              Review Extraction
            </h1>
          </div>
        </header>

        {/* Content */}
        <div ref={contentRef} className="flex-1 flex min-h-0 relative">
          {/* Left panel: PDF or Text viewer */}
          <div
            className="flex flex-col min-h-0 min-w-0"
            style={{ width: `${splitPercent}%` }}
          >
            <SourceTabs
              sources={data.sources}
              activeSourceId={activeSourceId}
              onSourceChange={handleSourceChange}
            />
            {activeSource && (
              <div className="flex-1 min-h-0">
                {isTextSource ? (
                  <TextViewer
                    file={activeSource.file}
                    activeCitation={activeViewerCitation}
                    fileType={sourceType as "text" | "csv" | "md"}
                  />
                ) : (
                  <PdfViewer
                    file={activeSource.file}
                    page={currentPage}
                    activeCitation={activePdfCitation}
                    onPageChange={handlePageChange}
                    pageCount={activeSource.pageCount}
                  />
                )}
              </div>
            )}
          </div>

          {/* Drag handle */}
          <div
            onMouseDown={handleMouseDown}
            className={`w-1 cursor-col-resize shrink-0 transition-colors hover:bg-purple-300 active:bg-purple-400 ${
              isDragging ? "bg-purple-400" : "bg-border"
            }`}
          />

          {/* Prevent text selection while dragging */}
          {isDragging && (
            <div className="fixed inset-0 z-50 cursor-col-resize" />
          )}

          {/* Right panel: Extracted data */}
          <div className="flex-1 min-h-0 min-w-0">
            <DataPanel
              fields={data.fields}
              sources={data.sources}
              activeCitation={activeCitation}
              onCitationClick={handleCitationClick}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
