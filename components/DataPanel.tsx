"use client";

import { useMemo, useState } from "react";
import { Sparkles, ChevronRight, ChevronDown } from "lucide-react";
import type { ExtractedField, Source, ActiveCitation } from "@/lib/types";
import CitationBadge from "./CitationBadge";

interface DataPanelProps {
  fields: ExtractedField[];
  sources: Source[];
  activeCitation: ActiveCitation | null;
  onCitationClick: (sourceId: string, page: number, bbox: ActiveCitation["bbox"]) => void;
}

interface FieldGroup {
  category: string;
  fields: ExtractedField[];
}

export default function DataPanel({
  fields,
  sources,
  activeCitation,
  onCitationClick,
}: DataPanelProps) {
  const sourceMap = Object.fromEntries(sources.map((s) => [s.id, s]));
  const [showRaw, setShowRaw] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const groups = useMemo(() => {
    const groupMap = new Map<string, ExtractedField[]>();
    for (const field of fields) {
      const cat = field.category || "Other";
      if (!groupMap.has(cat)) {
        groupMap.set(cat, []);
      }
      groupMap.get(cat)!.push(field);
    }
    const result: FieldGroup[] = [];
    for (const [category, groupFields] of groupMap) {
      result.push({ category, fields: groupFields });
    }
    return result;
  }, [fields]);

  const toggleCategory = (category: string) => {
    setCollapsed((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  const rawData = useMemo(() => {
    const obj: Record<string, string> = {};
    for (const field of fields) {
      obj[field.label] = field.value;
    }
    return JSON.stringify(obj, null, 2);
  }, [fields]);

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-purple-50/50 to-blue-50/50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-white/50 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-600" />
          <span className="text-sm font-medium">Extracted Data</span>
        </div>
        <div className="inline-flex h-7 items-center justify-center rounded-md bg-muted/50 p-0.5 text-muted-foreground text-xs">
          <button
            onClick={() => setShowRaw(false)}
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-2.5 py-1 text-xs font-medium transition-all ${
              !showRaw
                ? "bg-white text-foreground shadow-sm"
                : "hover:text-foreground/80"
            }`}
          >
            Formatted
          </button>
          <button
            onClick={() => setShowRaw(true)}
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-2.5 py-1 text-xs font-medium transition-all ${
              showRaw
                ? "bg-white text-foreground shadow-sm"
                : "hover:text-foreground/80"
            }`}
          >
            Raw JSON
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {showRaw ? (
          <pre className="p-4 text-xs font-mono text-foreground whitespace-pre-wrap break-words">
            {rawData}
          </pre>
        ) : (
          groups.map((group) => {
            const isCollapsed = collapsed[group.category] ?? false;
            return (
              <div key={group.category}>
                {/* Category header */}
                <button
                  onClick={() => toggleCategory(group.category)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 bg-white/60 border-b border-border hover:bg-white/80 transition-colors"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                  <span className="text-sm font-medium text-foreground">
                    {group.category}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {group.fields.length} {group.fields.length === 1 ? "field" : "fields"}
                  </span>
                </button>

                {/* Field rows */}
                {!isCollapsed && (
                  <div>
                    {group.fields.map((field) => {
                      const isFieldActive =
                        activeCitation !== null &&
                        field.citations.some(
                          (c) =>
                            c.sourceId === activeCitation.sourceId &&
                            c.page === activeCitation.page &&
                            c.bbox.left === activeCitation.bbox.left &&
                            c.bbox.top === activeCitation.bbox.top
                        );

                      return (
                        <div
                          key={field.id}
                          className={`px-4 py-2.5 border-b border-border/50 transition-colors ${
                            isFieldActive
                              ? "bg-amber-50 border-amber-200/60"
                              : "hover:bg-blue-50/60"
                          }`}
                        >
                          {/* Two-column: label / value */}
                          <div className="flex gap-3">
                            <div className="text-sm text-muted-foreground font-mono min-w-[140px] shrink-0 pt-0.5">
                              {field.label}
                            </div>
                            <div className="text-sm text-foreground flex-1 whitespace-pre-wrap break-words">
                              {field.value || (
                                <span className="text-muted-foreground/50 italic">—</span>
                              )}
                            </div>
                          </div>
                          {/* Citation badges */}
                          {field.citations.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5 ml-[152px]">
                              {field.citations.map((citation, idx) => {
                                const source = sourceMap[citation.sourceId];
                                if (!source) return null;

                                const isActive =
                                  activeCitation !== null &&
                                  activeCitation.sourceId === citation.sourceId &&
                                  activeCitation.page === citation.page &&
                                  activeCitation.bbox.left === citation.bbox.left &&
                                  activeCitation.bbox.top === citation.bbox.top;

                                return (
                                  <CitationBadge
                                    key={`${citation.sourceId}-${citation.page}-${idx}`}
                                    citation={citation}
                                    source={source}
                                    isActive={isActive}
                                    onClick={() =>
                                      onCitationClick(
                                        citation.sourceId,
                                        citation.page,
                                        citation.bbox
                                      )
                                    }
                                  />
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
