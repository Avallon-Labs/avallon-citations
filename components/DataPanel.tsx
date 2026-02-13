"use client";

import { useMemo, useState, useCallback } from "react";
import type { ExtractedField, Source, ActiveCitation } from "@/lib/types";
import CitationBadge from "./CitationBadge";

interface DataPanelProps {
  fields: ExtractedField[];
  sources: Source[];
  activeCitation: ActiveCitation | null;
  onCitationClick: (
    sourceId: string,
    page: number,
    bbox: ActiveCitation["bbox"]
  ) => void;
}

interface FieldGroup {
  category: string;
  fields: ExtractedField[];
}

/* ─── Palette ────────────────────────────────────────────────────── */
const C = {
  ink: "#1e2530",
  label: "#5c6675",
  hint: "#8e95a2",
  mute: "#bfc4cc",
  line: "#ecedf0",
  surface: "#f7f7f9",
  card: "#ffffff",
  cardBorder: "#e4e5e9",
  hover: "#f4f5f8",
  accent: "#4A7CDB",
  accentBg: "#EDF2FC",
  activeRow: "#fffbeb",
  activeBorder: "#f59e0b",
  copied: "#16a34a",
} as const;

/* ─── Icons ──────────────────────────────────────────────────────── */
function RecIcon({ s = 14 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none">
      <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" stroke={C.accent} strokeWidth="1.4" />
      <line x1="5.5" y1="6" x2="10.5" y2="6" stroke={C.accent} strokeWidth="1.1" strokeLinecap="round" />
      <line x1="5.5" y1="8.5" x2="10.5" y2="8.5" stroke={C.accent} strokeWidth="1.1" strokeLinecap="round" />
      <line x1="5.5" y1="11" x2="8" y2="11" stroke={C.accent} strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function Chev({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      style={{
        transition: "transform 0.2s cubic-bezier(.4,0,.2,1)",
        transform: open ? "rotate(90deg)" : "rotate(0)",
        flexShrink: 0,
      }}
    >
      <path
        d="M4.5 2.5L8 6L4.5 9.5"
        stroke={C.hint}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SourceIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
      <path
        d="M5 7L7 5M4.5 8.5L3.15 7.15a2.12 2.12 0 010-3l.7-.7a2.12 2.12 0 013 0L8.5 5.1M7.5 3.5l1.35 1.35a2.12 2.12 0 010 3l-.7.7a2.12 2.12 0 01-3 0L3.5 6.9"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10.5 5.5V3.5a1.5 1.5 0 00-1.5-1.5H3.5A1.5 1.5 0 002 3.5V9a1.5 1.5 0 001.5 1.5h2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke={C.copied} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ─── Copy button ────────────────────────────────────────────────── */
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    },
    [value]
  );

  return (
    <button
      onClick={handleCopy}
      title={copied ? "Copied!" : "Copy value"}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: 2,
        color: copied ? C.copied : C.hint,
        opacity: copied ? 1 : 0.6,
        transition: "all 0.15s",
        display: "inline-flex",
        alignItems: "center",
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        if (!copied) e.currentTarget.style.opacity = "1";
      }}
      onMouseLeave={(e) => {
        if (!copied) e.currentTarget.style.opacity = "0.6";
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

/* ─── Value rendering ────────────────────────────────────────────── */
function detectValueType(
  value: string
): "bool" | "null" | "long" | "currency" | "str" {
  if (!value) return "null";
  const lower = value.toLowerCase().trim();
  if (lower === "yes" || lower === "no" || lower === "true" || lower === "false")
    return "bool";
  if (/^\$[\d,.]+$/.test(value.trim())) return "currency";
  if (value.length > 140) return "long";
  return "str";
}

function BoolVal({ value }: { value: string }) {
  const y =
    value.toLowerCase().trim() === "yes" ||
    value.toLowerCase().trim() === "true";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 13.5,
        fontWeight: 600,
        borderRadius: 6,
        padding: "3px 10px 3px 8px",
        color: y ? "#16763d" : "#b42318",
        background: y ? "#ecfdf3" : "#fef3f2",
        border: `1px solid ${y ? "#a7f3d0" : "#fecaca"}`,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          background: y ? "#22c55e" : "#ef4444",
        }}
      />
      {y ? "Yes" : "No"}
    </span>
  );
}

function LongVal({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const nl = text.includes("\n");
  if (!open)
    return (
      <span style={{ fontSize: 14, fontWeight: 500, color: C.ink, lineHeight: 1.55 }}>
        {text.slice(0, 120)}…
        <button
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            color: C.accent,
            fontWeight: 500,
            fontSize: 12,
            marginLeft: 4,
          }}
        >
          more
        </button>
      </span>
    );
  return (
    <div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: C.ink,
          lineHeight: 1.6,
          whiteSpace: nl ? "pre-wrap" : "normal",
          wordBreak: "break-word",
          background: C.surface,
          padding: "10px 12px",
          borderRadius: 8,
          border: `1px solid ${C.line}`,
        }}
      >
        {text}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(false); }}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          color: C.accent,
          fontWeight: 500,
          fontSize: 12,
          marginTop: 6,
        }}
      >
        less
      </button>
    </div>
  );
}

function FieldValue({ value }: { value: string }) {
  const vtype = detectValueType(value);
  if (vtype === "null")
    return (
      <span style={{ color: C.mute, fontSize: 12.5, fontWeight: 400 }}>
        Not extracted
      </span>
    );
  if (vtype === "bool") return <BoolVal value={value} />;
  if (vtype === "currency")
    return (
      <span
        style={{
          fontFamily: "var(--font-mono, monospace)",
          fontSize: 14,
          fontWeight: 600,
          color: C.ink,
          letterSpacing: "-0.01em",
        }}
      >
        {value}
      </span>
    );
  if (vtype === "long") return <LongVal text={value} />;
  return (
    <span
      style={{
        fontSize: 14,
        fontWeight: 500,
        color: C.ink,
        lineHeight: 1.55,
        wordBreak: "break-word",
      }}
    >
      {value}
    </span>
  );
}

/* ─── Category preview (collapsed) ───────────────────────────────── */
function CategoryPreview({ fields }: { fields: ExtractedField[] }) {
  const names = fields.map((f) => f.label);

  if (names.length === 0) return null;

  return (
    <div
      style={{
        fontSize: 11.5,
        color: C.label,
        marginTop: 2,
        lineHeight: 1.5,
        paddingLeft: 20,
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
      }}
    >
      {names.join("  ·  ")}
    </div>
  );
}

/* ─── Field row ──────────────────────────────────────────────────── */
function FieldRow({
  field,
  index,
  isFieldActive,
  isExpanded,
  isLast,
  sourceMap,
  activeCitation,
  onCitationClick,
  onFieldClick,
}: {
  field: ExtractedField;
  index: number;
  isFieldActive: boolean;
  isExpanded: boolean;
  isLast: boolean;
  sourceMap: Record<string, Source>;
  activeCitation: ActiveCitation | null;
  onCitationClick: DataPanelProps["onCitationClick"];
  onFieldClick: (fieldId: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  const showBadges = hovered || isExpanded || isFieldActive;
  const hasCitations = field.citations.length > 0;
  const hasValue = detectValueType(field.value) !== "null";

  const uniqueSourceCount = useMemo(() => {
    const ids = new Set(field.citations.map((c) => `${c.sourceId}-${c.page}`));
    return ids.size;
  }, [field.citations]);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onFieldClick(field.id)}
      style={{
        padding: "11px 16px",
        borderBottom: !isLast ? `1px solid ${C.line}` : "none",
        background: isFieldActive
          ? C.activeRow
          : hovered
            ? C.hover
            : "transparent",
        borderLeft: isFieldActive
          ? `3px solid ${C.activeBorder}`
          : "3px solid transparent",
        cursor: hasCitations ? "pointer" : "default",
        transition: "background 0.12s ease",
        animation: "field-enter 0.2s ease both",
        animationDelay: `${index * 30}ms`,
      }}
    >
      {/* Label + copy */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 4,
        }}
      >
        <div
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: C.label,
            lineHeight: 1.2,
            letterSpacing: "0.02em",
          }}
        >
          {field.label}
        </div>
        {hasValue && (
          <span style={{ opacity: hovered ? 1 : 0, pointerEvents: hovered ? "auto" : "none", transition: "opacity 0.12s ease" }}>
            <CopyButton value={field.value} />
          </span>
        )}
      </div>

      {/* Value */}
      <FieldValue value={field.value} />

      {/* Citations — hint always visible, badges expand downward */}
      {hasCitations && (
        <div style={{ marginTop: 6 }}>
          {/* Source count hint — always visible, fixed height */}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              fontSize: 10.5,
              lineHeight: 1.4,
              padding: "3px 0",
              color: C.hint,
            }}
          >
            <SourceIcon />
            {uniqueSourceCount} {uniqueSourceCount === 1 ? "source" : "sources"}
          </span>
          {/* Badges — collapse height when hidden, expand smoothly */}
          <div
            className={`fields-grid ${showBadges ? "open" : ""}`}
          >
            <div className="fields-grid-inner">
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 4,
                  paddingTop: 4,
                }}
              >
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
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────── */
export default function DataPanel({
  fields,
  sources,
  activeCitation,
  onCitationClick,
}: DataPanelProps) {
  const sourceMap = Object.fromEntries(sources.map((s) => [s.id, s]));
  const [showRaw, setShowRaw] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [expandedFieldId, setExpandedFieldId] = useState<string | null>(null);

  const groups = useMemo(() => {
    const groupMap = new Map<string, ExtractedField[]>();
    for (const field of fields) {
      const cat = field.category || "Other";
      if (!groupMap.has(cat)) groupMap.set(cat, []);
      groupMap.get(cat)!.push(field);
    }
    const result: FieldGroup[] = [];
    for (const [category, groupFields] of groupMap) {
      result.push({ category, fields: groupFields });
    }
    return result;
  }, [fields]);

  const toggleCategory = (category: string) => {
    setCollapsed((prev) => ({
      ...prev,
      [category]: !(prev[category] ?? true),
    }));
  };

  const allCollapsed = groups.every((g) => (collapsed[g.category] ?? true));
  const toggleAll = () => {
    const next: Record<string, boolean> = {};
    const newState = !allCollapsed;
    for (const g of groups) next[g.category] = newState;
    setCollapsed(next);
  };

  const handleFieldClick = useCallback((fieldId: string) => {
    setExpandedFieldId((prev) => (prev === fieldId ? null : fieldId));
  }, []);

  const rawData = useMemo(() => {
    const obj: Record<string, string> = {};
    for (const field of fields) obj[field.label] = field.value;
    return JSON.stringify(obj, null, 2);
  }, [fields]);

  return (
    <div className="h-full flex flex-col" style={{ background: C.surface }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 shrink-0"
        style={{
          borderBottom: `1px solid ${C.cardBorder}`,
          background: C.card,
          height: 46,
        }}
      >
        <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, letterSpacing: "-0.01em" }}>
          Extracted Data
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!showRaw && (
            <button
              onClick={toggleAll}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 11.5,
                fontWeight: 500,
                color: C.hint,
                padding: 0,
                transition: "color 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = C.accent)}
              onMouseLeave={(e) => (e.currentTarget.style.color = C.hint)}
            >
              {allCollapsed ? "Expand all" : "Collapse all"}
            </button>
          )}
          <div
            style={{
              display: "inline-flex",
              height: 30,
              alignItems: "center",
              borderRadius: 8,
              background: C.surface,
              padding: 2,
              border: `1px solid ${C.line}`,
            }}
          >
            {(["Formatted", "JSON"] as const).map((tab) => {
              const active = tab === "Formatted" ? !showRaw : showRaw;
              return (
                <button
                  key={tab}
                  onClick={() => setShowRaw(tab === "JSON")}
                  style={{
                    fontSize: 11.5,
                    fontWeight: active ? 600 : 400,
                    padding: "4px 12px",
                    borderRadius: 6,
                    border: "none",
                    cursor: "pointer",
                    background: active ? C.card : "transparent",
                    color: active ? C.ink : C.hint,
                    boxShadow: active
                      ? "0 1px 2px rgba(0,0,0,0.06)"
                      : "none",
                    transition: "all 0.15s",
                  }}
                >
                  {tab}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div
        className="flex-1 overflow-auto data-panel-scroll"
        style={{ padding: "10px 12px 40px" }}
      >
        {showRaw ? (
          <div
            style={{
              background: C.card,
              border: `1px solid ${C.cardBorder}`,
              borderRadius: 10,
              padding: 16,
            }}
          >
            <pre
              style={{
                fontSize: 11.5,
                fontFamily: "var(--font-mono, monospace)",
                color: C.ink,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              {rawData}
            </pre>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {groups.map((group) => {
              const isCollapsed = collapsed[group.category] ?? true;

              return (
                <div
                  key={group.category}
                  style={{
                    borderRadius: 10,
                    border: `1px solid ${C.cardBorder}`,
                    background: C.card,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                    overflow: "hidden",
                  }}
                >
                  {/* Category header */}
                  <div
                    onClick={() => toggleCategory(group.category)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: isCollapsed ? "12px 14px 8px" : "12px 14px",
                      cursor: "pointer",
                      userSelect: "none",
                      transition: "background 0.1s",
                      flexWrap: "wrap",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = C.hover)
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                  >
                    <Chev open={!isCollapsed} />
                    <RecIcon />
                    <span
                      style={{
                        fontSize: 13.5,
                        fontWeight: 600,
                        color: C.ink,
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {group.category}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: C.hint,
                        whiteSpace: "nowrap",
                        fontWeight: 500,
                      }}
                    >
                      {group.fields.length} {group.fields.length === 1 ? "field" : "fields"}
                    </span>
                    {/* Preview when collapsed */}
                    {isCollapsed && (
                      <div style={{ width: "100%", flexShrink: 0 }}>
                        <CategoryPreview fields={group.fields} />
                      </div>
                    )}
                  </div>

                  {/* Fields — animated via CSS grid */}
                  <div className={`fields-grid ${!isCollapsed ? "open" : ""}`}>
                    <div className="fields-grid-inner">
                      <div style={{ borderTop: `1px solid ${C.line}` }}>
                        {group.fields.map((field, i) => {
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
                            <FieldRow
                              key={field.id}
                              field={field}
                              index={i}
                              isFieldActive={isFieldActive}
                              isExpanded={expandedFieldId === field.id}
                              isLast={i === group.fields.length - 1}
                              sourceMap={sourceMap}
                              activeCitation={activeCitation}
                              onCitationClick={onCitationClick}
                              onFieldClick={handleFieldClick}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
