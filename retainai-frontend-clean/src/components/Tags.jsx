// src/components/Tags.jsx
import React, { useMemo } from "react";
import "./Tags.css";

/**
 * Props:
 * - tags: string[]                (list of available tags)
 * - selected: string[]            (currently selected)
 * - onChange: (string[]) => void  (next selection)
 * - placeholder?: string
 * - disabled?: boolean            (disable interaction)
 * - readOnly?: boolean            (show state, no changes)
 * - caseInsensitive?: boolean     (compare/toggle ignoring case)
 * - ariaLabel?: string            (for screen readers; default "Tags")
 */
export default function Tags({
  tags = [],
  selected = [],
  onChange,
  placeholder = "Select tags...",
  disabled = false,
  readOnly = false,
  caseInsensitive = false,
  ariaLabel = "Tags",
}) {
  const safeOnChange = typeof onChange === "function" ? onChange : () => {};

  // Dedupe tags while preserving first occurrence & order
  const uniqueTags = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const t of tags) {
      const key = String(t);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(key);
      }
    }
    return out;
  }, [tags]);

  // Build a Set for O(1) membership checks
  const selectedSet = useMemo(() => {
    if (!caseInsensitive) return new Set(selected.map(String));
    const s = new Set();
    for (const v of selected) s.add(String(v).toLowerCase());
    return s;
  }, [selected, caseInsensitive]);

  const isSelected = (tag) =>
    caseInsensitive ? selectedSet.has(tag.toLowerCase()) : selectedSet.has(tag);

  const handleToggle = (tag) => {
    if (disabled || readOnly) return;
    const exists = isSelected(tag);

    if (!exists) {
      // Add tag
      const next = [...selected, tag];
      // Ensure uniqueness just in case callers pass dupes
      const uniq = Array.from(new Set(next.map(String)));
      safeOnChange(uniq);
    } else {
      // Remove tag
      const next = selected.filter((t) =>
        caseInsensitive
          ? String(t).toLowerCase() !== tag.toLowerCase()
          : String(t) !== tag
      );
      safeOnChange(next);
    }
  };

  return (
    <div className="tags-wrap" role="group" aria-label={ariaLabel}>
      {uniqueTags.length === 0 && (
        <span style={{ color: "#888", fontStyle: "italic" }}>{placeholder}</span>
      )}

      {uniqueTags.map((tag, i) => {
        const selectedNow = isSelected(tag);
        return (
          <button
            key={`${tag}-${i}`}
            type="button"
            className={`tag-chip${selectedNow ? " selected" : ""}`}
            onClick={() => handleToggle(tag)}
            aria-pressed={selectedNow}
            aria-label={`${selectedNow ? "Remove" : "Add"} tag ${tag}`}
            title={tag}
            disabled={disabled}
            // Keep it keyboard-friendly without extra JS: <button> is natively focusable
          >
            {tag}
            {selectedNow && (
              <span
                aria-hidden="true"
                style={{ marginLeft: 6, fontWeight: "bold" }}
              >
                ×
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
