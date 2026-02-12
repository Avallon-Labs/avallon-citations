"use client";

import type { Source } from "@/lib/types";

interface SourceTabsProps {
  sources: Source[];
  activeSourceId: string;
  onSourceChange: (sourceId: string) => void;
}

export default function SourceTabs({
  sources,
  activeSourceId,
  onSourceChange,
}: SourceTabsProps) {
  return (
    <div className="flex gap-1 px-2 py-2 border-b border-border bg-muted/10 overflow-x-auto shrink-0">
      {sources.map((source) => (
        <button
          key={source.id}
          onClick={() => onSourceChange(source.id)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
            activeSourceId === source.id
              ? "bg-white text-foreground shadow-sm border border-border"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
        >
          {source.name}
        </button>
      ))}
    </div>
  );
}
