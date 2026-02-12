"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ActiveCitation } from "@/lib/types";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

interface PdfViewerProps {
  file: string;
  page: number;
  activeCitation: ActiveCitation | null;
  onPageChange: (page: number) => void;
  pageCount: number;
}

export default function PdfViewer({
  file,
  page,
  activeCitation,
  onPageChange,
  pageCount,
}: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [renderedDimensions, setRenderedDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  // Track container width so the PDF re-renders on resize (debounced)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      clearTimeout(timer);
      timer = setTimeout(() => setContainerWidth(w), 150);
    });
    observer.observe(el);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  // Load PDF document when file changes
  useEffect(() => {
    let cancelled = false;

    async function loadPdf() {
      setLoading(true);
      setError(null);
      setPdfDoc(null);

      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        const doc = await pdfjsLib.getDocument(file).promise;
        if (!cancelled) {
          setPdfDoc(doc);
        }
      } catch (err) {
        if (!cancelled) {
          setError(`Failed to load PDF: ${err}`);
          setLoading(false);
        }
      }
    }

    loadPdf();
    return () => {
      cancelled = true;
    };
  }, [file]);

  // Render current page
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;

    // Cancel any in-flight pdfjs render to avoid "canvas in use" errors
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    async function renderPage() {
      if (!pdfDoc || !canvasRef.current) return;

      // Guard against stale pdfDoc when source changes — the old doc
      // may have fewer pages than the new page number requests
      if (page < 1 || page > pdfDoc.numPages) return;

      setError(null);
      setLoading(true);

      try {
        const pdfPage: PDFPageProxy = await pdfDoc.getPage(page);
        if (cancelled) return;

        const dpr = window.devicePixelRatio || 1;

        // Fit to container width
        const container = containerRef.current;
        const cw = container ? container.clientWidth - 32 : 600;

        const unscaledViewport = pdfPage.getViewport({ scale: 1 });
        const scale = cw / unscaledViewport.width;
        const viewport = pdfPage.getViewport({ scale });

        // Use a higher-res viewport for sharp rendering
        const hiResViewport = pdfPage.getViewport({ scale: scale * dpr });

        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = hiResViewport.width;
        canvas.height = hiResViewport.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        // Size the overlay canvas to match CSS dimensions
        const overlay = overlayRef.current;
        if (overlay) {
          overlay.width = viewport.width * dpr;
          overlay.height = viewport.height * dpr;
          overlay.style.width = `${viewport.width}px`;
          overlay.style.height = `${viewport.height}px`;
        }

        const task = pdfPage.render({ canvas, viewport: hiResViewport });
        renderTaskRef.current = task;

        await task.promise;
        renderTaskRef.current = null;

        if (!cancelled) {
          setRenderedDimensions({
            width: viewport.width,
            height: viewport.height,
          });
          setLoading(false);
        }
      } catch (err) {
        if (cancelled) return;
        // Ignore cancellation errors from our own cancel() calls
        if (err instanceof Error && err.message.includes("Rendering cancelled")) return;
        setError(`Failed to render page: ${err}`);
        setLoading(false);
      }
    }

    renderPage();
    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [pdfDoc, page, containerWidth]);

  // Draw bbox overlay
  const drawOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay || !renderedDimensions) return;

    const dpr = window.devicePixelRatio || 1;
    const ctx = overlay.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, renderedDimensions.width, renderedDimensions.height);

    if (!activeCitation || activeCitation.page !== page) {
      return;
    }

    const { bbox } = activeCitation;
    const x = bbox.left * renderedDimensions.width;
    const y = bbox.top * renderedDimensions.height;
    const w = bbox.width * renderedDimensions.width;
    const h = bbox.height * renderedDimensions.height;

    // Highlight fill
    ctx.fillStyle = "rgba(59, 130, 246, 0.2)";
    ctx.fillRect(x - 4, y - 2, w + 8, h + 4);

    // Border
    ctx.strokeStyle = "rgba(59, 130, 246, 0.7)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 4, y - 2, w + 8, h + 4);
  }, [activeCitation, page, renderedDimensions]);

  useEffect(() => {
    drawOverlay();
  }, [drawOverlay]);

  // Fade overlay after delay
  useEffect(() => {
    if (!activeCitation || activeCitation.page !== page) return;

    const timer = setTimeout(() => {
      // Keep highlight visible for 15 seconds before fading
      const overlay = overlayRef.current;
      if (!overlay || !renderedDimensions) return;

      const dpr = window.devicePixelRatio || 1;
      const ctx = overlay.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      let opacity = 1;
      const fade = () => {
        opacity -= 0.02;
        if (opacity <= 0) {
          ctx.clearRect(0, 0, renderedDimensions.width, renderedDimensions.height);
          return;
        }
        ctx.clearRect(0, 0, renderedDimensions.width, renderedDimensions.height);

        const { bbox } = activeCitation;
        const x = bbox.left * renderedDimensions.width;
        const y = bbox.top * renderedDimensions.height;
        const w = bbox.width * renderedDimensions.width;
        const h = bbox.height * renderedDimensions.height;

        ctx.fillStyle = `rgba(59, 130, 246, ${0.2 * opacity})`;
        ctx.fillRect(x - 4, y - 2, w + 8, h + 4);
        ctx.strokeStyle = `rgba(59, 130, 246, ${0.7 * opacity})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 4, y - 2, w + 8, h + 4);

        requestAnimationFrame(fade);
      };
      requestAnimationFrame(fade);
    }, 15000);

    return () => clearTimeout(timer);
  }, [activeCitation, page, renderedDimensions]);

  return (
    <div ref={containerRef} className="flex flex-col h-full">
      {/* Page navigation */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-border bg-muted/20 shrink-0">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-border bg-white hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Prev
        </button>
        <span className="text-xs text-muted-foreground font-medium">
          Page {page} of {pageCount}
        </span>
        <button
          onClick={() => onPageChange(Math.min(pageCount, page + 1))}
          disabled={page >= pageCount}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-border bg-white hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* PDF canvas area */}
      <div className="flex-1 overflow-auto p-4 bg-muted/10 flex justify-center">
        {error ? (
          <div className="text-red-500 text-sm mt-8">{error}</div>
        ) : (
          <div className="relative inline-block">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
                <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            <canvas ref={canvasRef} className="shadow-lg bg-white" />
            <canvas
              ref={overlayRef}
              className="absolute top-0 left-0 pointer-events-none"
            />
          </div>
        )}
      </div>
    </div>
  );
}
