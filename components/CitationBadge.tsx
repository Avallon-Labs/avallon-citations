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
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border transition-all cursor-pointer ${
        isActive
          ? "bg-blue-100 border-blue-400 text-blue-700 ring-1 ring-blue-300"
          : "bg-gray-100 border-gray-300 text-gray-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600"
      }`}
    >
      <span className="font-medium">{source.name}</span>
      <span className="text-gray-400">p.{citation.page}</span>
    </button>
  );
}
