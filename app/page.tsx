"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Sparkles } from "lucide-react";
import type { ExtractionData, ActiveCitation } from "@/lib/types";
import PdfViewer from "@/components/PdfViewer";
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
      .then((d: ExtractionData) => {
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
    (sourceId: string, page: number, bbox: ActiveCitation["bbox"]) => {
      if (sourceId !== activeSourceId) {
        setActiveSourceId(sourceId);
      }
      setCurrentPage(page);
      setActiveCitation({ sourceId, page, bbox });
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
          {/* Left panel: PDF */}
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
                <PdfViewer
                  file={activeSource.file}
                  page={currentPage}
                  activeCitation={
                    activeCitation?.sourceId === activeSourceId
                      ? activeCitation
                      : null
                  }
                  onPageChange={handlePageChange}
                  pageCount={activeSource.pageCount}
                />
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
