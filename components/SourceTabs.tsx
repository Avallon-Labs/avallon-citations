"use client";

import { useState, useRef, useEffect } from "react";
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
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const activeSource = sources.find((s) => s.id === activeSourceId);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // For <= 5 sources, use simple horizontal tabs
  if (sources.length <= 5) {
    return (
      <div className="flex border-b border-gray-200 bg-white shrink-0">
        {sources.map((source) => (
          <button
            key={source.id}
            onClick={() => onSourceChange(source.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              activeSourceId === source.id
                ? "text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {source.name}
            {activeSourceId === source.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
            )}
          </button>
        ))}
      </div>
    );
  }

  // For many sources, use a dropdown selector
  return (
    <div
      ref={dropdownRef}
      className="relative border-b border-gray-200 bg-white shrink-0"
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-50 transition-colors"
      >
        <span className="truncate">{activeSource?.name ?? "Select source"}</span>
        <span className="ml-2 text-gray-400 shrink-0">
          <svg className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 z-50 bg-white border border-gray-200 shadow-lg max-h-80 overflow-auto">
          {sources.map((source) => (
            <button
              key={source.id}
              onClick={() => {
                onSourceChange(source.id);
                setOpen(false);
              }}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                activeSourceId === source.id
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              {source.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
