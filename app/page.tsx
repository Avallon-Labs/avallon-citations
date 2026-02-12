"use client";

import { useEffect, useState, useCallback } from "react";
import type { ExtractionData, ActiveCitation } from "@/lib/types";
import PdfViewer from "@/components/PdfViewer";
import DataPanel from "@/components/DataPanel";
import SourceTabs from "@/components/SourceTabs";

export default function Home() {
  const [data, setData] = useState<ExtractionData | null>(null);
  const [activeSourceId, setActiveSourceId] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [activeCitation, setActiveCitation] = useState<ActiveCitation | null>(
    null
  );

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

  if (!data) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header */}
      <header className="border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0 bg-white">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-gray-900">
            Extraction Viewer
          </h1>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
            MVP
          </span>
        </div>
        <span className="text-xs text-gray-400">
          {data.sources.length} sources &middot; {data.fields.length} fields
        </span>
      </header>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* Left panel: PDF */}
        <div className="w-1/2 flex flex-col border-r border-gray-200 min-h-0">
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

        {/* Right panel: Extracted data */}
        <div className="w-1/2 min-h-0">
          <DataPanel
            fields={data.fields}
            sources={data.sources}
            activeCitation={activeCitation}
            onCitationClick={handleCitationClick}
          />
        </div>
      </div>
    </div>
  );
}
