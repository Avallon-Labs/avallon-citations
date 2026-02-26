"use client";

import { useState } from "react";
import type { Citation, Source } from "@/lib/types";

interface CitationBadgeProps {
  citation: Citation;
  source: Source;
  isActive: boolean;
  onClick: () => void;
}

export default function CitationBadge({
  citation,
  source,
  isActive,
  onClick,
}: CitationBadgeProps) {
  const [hovered, setHovered] = useState(false);

  const active = isActive || hovered;

  // Build the detail label based on citation type
  let detail: string;
  let isSnippetStyle = false;
  if (citation.type === "text") {
    const snippet = citation.snippet || "";
    detail = snippet.length > 20 ? snippet.slice(0, 20) + "…" : snippet;
    isSnippetStyle = true;
  } else if (citation.type === "md") {
    if (citation.tableIndex !== undefined) {
      const r0 = citation.startRow ?? 0;
      const r1 = citation.endRow ?? r0;
      const rowPart = r0 === r1 ? `r${r0}` : `r${r0}-${r1}`;
      if (citation.startCol !== undefined) {
        const c0 = citation.startCol;
        const c1 = citation.endCol ?? c0;
        const colPart = c0 === c1 ? `c${c0}` : `c${c0}-${c1}`;
        detail = `${rowPart}:${colPart}`;
      } else {
        detail = r0 === r1 ? `row ${r0}` : `rows ${r0}-${r1}`;
      }
    } else {
      const snippet = citation.snippet || "";
      detail = snippet.length > 20 ? snippet.slice(0, 20) + "…" : snippet;
      isSnippetStyle = true;
    }
  } else {
    detail = `p.${citation.page}`;
  }

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px 2px 6px",
        fontSize: 11,
        fontWeight: 500,
        borderRadius: 6,
        border: `1px solid ${isActive ? "#c4b5fd" : hovered ? "#ddd6fe" : "#e5e4e1"}`,
        background: isActive ? "#ede9fe" : hovered ? "#f5f3ff" : "#f8f8f6",
        color: active ? "#6d28d9" : "#6b7280",
        cursor: "pointer",
        transition: "all 0.15s",
        lineHeight: 1.4,
        fontFamily: "inherit",
      }}
    >
      {/* Small link icon */}
      <svg
        width="10"
        height="10"
        viewBox="0 0 12 12"
        fill="none"
        style={{ flexShrink: 0, opacity: active ? 0.9 : 0.45 }}
      >
        <path
          d="M5 7L7 5M4.5 8.5L3.15 7.15a2.12 2.12 0 010-3l.7-.7a2.12 2.12 0 013 0L8.5 5.1M7.5 3.5l1.35 1.35a2.12 2.12 0 010 3l-.7.7a2.12 2.12 0 01-3 0L3.5 6.9"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
      <span style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {source.name}
      </span>
      <span
        style={{
          color: isActive ? "#8b5cf6" : "#9ca3af",
          fontSize: 10,
          maxWidth: isSnippetStyle ? 120 : undefined,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {detail}
      </span>
    </button>
  );
}
