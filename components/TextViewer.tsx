"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { ActiveTextCitation, ActiveMdCitation } from "@/lib/types";

interface TextViewerProps {
  file: string;
  activeCitation: ActiveTextCitation | ActiveMdCitation | null;
  fileType: "text" | "csv" | "md";
}

const TYPE_LABELS: Record<TextViewerProps["fileType"], string> = {
  text: "Plain Text",
  csv: "CSV",
  md: "Extracted Text",
};

// Extend default sanitize schema to allow <mark> with class/id
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), "mark"],
  attributes: {
    ...defaultSchema.attributes,
    mark: ["className", "class", "id"],
  },
};

export default function TextViewer({
  file,
  activeCitation,
  fileType,
}: TextViewerProps) {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fading, setFading] = useState(false);
  const highlightRef = useRef<HTMLElement>(null);
  const mdContainerRef = useRef<HTMLDivElement>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch file content
  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(file)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load file: ${r.status}`);
        return r.text();
      })
      .then((text) => {
        setContent(text);
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  }, [file]);

  // Scroll to highlight and manage fade (text/csv mode)
  useEffect(() => {
    if (fileType === "md") return;
    setFading(false);
    if (fadeTimerRef.current) {
      clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }

    if (activeCitation && highlightRef.current) {
      requestAnimationFrame(() => {
        highlightRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      });
      fadeTimerRef.current = setTimeout(() => setFading(true), 15000);
    }

    return () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, [activeCitation, fileType]);

  // Apply table highlights via DOM queries after render (avoids strict mode counter issues)
  useEffect(() => {
    if (fileType !== "md") return;
    const container = mdContainerRef.current;
    if (!container) return;

    // Clean previous highlights
    container.querySelectorAll(".md-cell-highlight, .md-row-highlight").forEach((el) => {
      el.classList.remove("md-cell-highlight", "md-row-highlight");
    });

    setFading(false);
    if (fadeTimerRef.current) {
      clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }

    if (!activeCitation || activeCitation.type !== "md") return;
    const ac = activeCitation;

    // Table citation: find element(s) via DOM queries
    if (ac.tableIndex !== undefined) {
      const raf = requestAnimationFrame(() => {
        const tables = container.querySelectorAll("table");
        const table = tables[ac.tableIndex!];
        if (!table) return;

        const rows = table.querySelectorAll("tr");
        const r0 = ac.startRow ?? 0;
        const r1 = ac.endRow ?? r0;
        let scrollTarget: Element | null = null;

        for (let r = r0; r <= r1; r++) {
          const row = rows[r];
          if (!row) continue;

          if (ac.startCol !== undefined) {
            const cells = row.querySelectorAll("th, td");
            const c0 = ac.startCol;
            const c1 = ac.endCol ?? c0;
            for (let c = c0; c <= c1; c++) {
              const cell = cells[c];
              if (cell) {
                cell.classList.add("md-cell-highlight");
                if (!scrollTarget) scrollTarget = cell;
              }
            }
          } else {
            row.classList.add("md-row-highlight");
            if (!scrollTarget) scrollTarget = row;
          }
        }

        scrollTarget?.scrollIntoView({ behavior: "smooth", block: "center" });
      });

      fadeTimerRef.current = setTimeout(() => {
        container.querySelectorAll(".md-cell-highlight, .md-row-highlight").forEach((el) => {
          el.classList.add("fading");
        });
      }, 15000);

      return () => {
        cancelAnimationFrame(raf);
        if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
      };
    }

    // Text snippet citation: scroll to injected <mark>
    const raf = requestAnimationFrame(() => {
      const mark = container.querySelector("#md-text-cite");
      if (mark) {
        mark.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });

    fadeTimerRef.current = setTimeout(() => setFading(true), 15000);

    return () => {
      cancelAnimationFrame(raf);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, [activeCitation, fileType]);

  const typeLabel = TYPE_LABELS[fileType];

  // For md mode: determine active md citation
  const activeMd =
    activeCitation?.type === "md" ? activeCitation : null;
  const isTableCitation = activeMd?.tableIndex !== undefined;

  // Pre-process markdown to inject <mark> for text snippet citations
  const processedContent = useMemo(() => {
    if (!activeMd || isTableCitation) return content;
    const idx = content.indexOf(activeMd.snippet);
    if (idx === -1) return content;
    return (
      content.slice(0, idx) +
      '<mark class="text-highlight" id="md-text-cite">' +
      activeMd.snippet +
      "</mark>" +
      content.slice(idx + activeMd.snippet.length)
    );
  }, [content, activeMd, isTableCitation]);

  // Markdown component overrides (style only — highlighting handled via useEffect DOM queries)
  const mdComponents = {
    table: ({ node, ...props }: any) => (
      <div className="overflow-x-auto my-4">
        <table className="border-collapse border border-border" {...props} />
      </div>
    ),
    th: ({ node, ...props }: any) => (
      <th
        className="border border-border bg-muted/50 px-3 py-2 text-left font-semibold text-xs whitespace-nowrap"
        {...props}
      />
    ),
    td: ({ node, ...props }: any) => (
      <td
        className="border border-border px-3 py-2 text-xs whitespace-nowrap"
        {...props}
      />
    ),
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center px-4 py-1.5 border-b border-border bg-muted/20 shrink-0">
          <span className="text-xs text-muted-foreground font-medium">
            {typeLabel}
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center bg-muted/10">
          <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center px-4 py-1.5 border-b border-border bg-muted/20 shrink-0">
          <span className="text-xs text-muted-foreground font-medium">
            {typeLabel}
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center bg-muted/10">
          <div className="text-red-500 text-sm">{error}</div>
        </div>
      </div>
    );
  }

  // Markdown rendering mode
  if (fileType === "md") {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center px-4 py-1.5 border-b border-border bg-muted/20 shrink-0">
          <span className="text-xs text-muted-foreground font-medium">
            {typeLabel}
          </span>
        </div>
        <div ref={mdContainerRef} className="flex-1 overflow-auto bg-muted/10">
          <div className="px-6 py-4">
            <div className="prose prose-sm max-w-none break-words [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-4 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-3 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-2 [&_a]:break-all [&_p]:break-words [&_*]:max-w-full">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
                components={mdComponents}
              >
                {processedContent}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Raw text/CSV rendering mode with character-offset highlighting
  let before = content;
  let highlighted = "";
  let after = "";

  if (activeCitation && activeCitation.type === "text") {
    const start = Math.max(
      0,
      Math.min(activeCitation.startOffset, content.length)
    );
    const end = Math.max(
      start,
      Math.min(activeCitation.endOffset, content.length)
    );
    before = content.slice(0, start);
    highlighted = content.slice(start, end);
    after = content.slice(end);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center px-4 py-1.5 border-b border-border bg-muted/20 shrink-0">
        <span className="text-xs text-muted-foreground font-medium">
          {typeLabel}
        </span>
      </div>
      <div className="flex-1 overflow-auto p-4 bg-muted/10">
        <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-foreground">
          {before}
          {highlighted && (
            <mark
              ref={highlightRef}
              className={`text-highlight${fading ? " fading" : ""}`}
            >
              {highlighted}
            </mark>
          )}
          {after}
        </pre>
      </div>
    </div>
  );
}
