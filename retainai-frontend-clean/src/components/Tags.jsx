import React from "react";
import "./Tags.css";

export default function Tags({
  tags = [],
  selected = [],
  onChange,
  placeholder = "Select tags...",
}) {
  // Toggle tag in/out of selected list
  const handleTagClick = (tag) => {
    if (!onChange) return;
    if (selected.includes(tag)) {
      onChange(selected.filter((t) => t !== tag));
    } else {
      onChange([...selected, tag]);
    }
  };

  return (
    <div className="tags-wrap">
      {tags.length === 0 && (
        <span style={{ color: "#888", fontStyle: "italic" }}>{placeholder}</span>
      )}
      {tags.map((tag) => (
        <span
          key={tag}
          className={`tag-chip${selected.includes(tag) ? " selected" : ""}`}
          onClick={() => handleTagClick(tag)}
        >
          {tag}
          {selected.includes(tag) && (
            <span style={{ marginLeft: 6, fontWeight: "bold", cursor: "pointer" }}>×</span>
          )}
        </span>
      ))}
    </div>
  );
}
