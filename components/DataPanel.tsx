"use client";

import { useMemo } from "react";
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

  return (
    <div className="h-full flex flex-col">
      <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 shrink-0">
        <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">
          Extracted Data
        </h2>
      </div>
      <div className="flex-1 overflow-auto">
        {groups.map((group) => (
          <div key={group.category}>
            <div className="px-5 py-2 bg-gray-100 border-y border-gray-200 sticky top-0 z-10">
              <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                {group.category}
              </h3>
            </div>
            <div className="divide-y divide-gray-100">
              {group.fields.map((field) => (
                <div key={field.id} className="px-5 py-3 hover:bg-gray-50/50 transition-colors">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    {field.label}
                  </div>
                  <div className="text-sm text-gray-900 font-medium mb-2 whitespace-pre-wrap">
                    {field.value}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
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
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
