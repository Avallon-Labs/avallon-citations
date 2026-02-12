"use client";

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
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] rounded border transition-all cursor-pointer ${
        isActive
          ? "bg-purple-100 border-purple-300 text-purple-700"
          : "bg-muted/50 border-border/50 text-muted-foreground hover:bg-purple-50 hover:border-purple-200 hover:text-purple-600"
      }`}
    >
      <span className="font-medium">{source.name}</span>
      <span className={isActive ? "text-purple-400" : "text-muted-foreground/60"}>
        p.{citation.page}
      </span>
    </button>
  );
}
