// src/components/LeadCaptureForm.jsx
import React, { useMemo, useState } from "react";

/* Theme (matches CRM) */
const BG = "#181a1b";
const CARD = "#232323";
const BORDER = "#2a3942";
const TEXT = "#e9edef";
const SUBTEXT = "#9fb0bb";
const GOLD = "#f7cb53";

function normalizeTags(input) {
  return (input || "")
    .split(",")
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => t.replace(/\s+/g, " "))
    .filter((t, i, a) => a.indexOf(t) === i);
}

function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").toLowerCase());
}

export default function LeadCaptureForm({ onAdd, existingLeads = [] }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    notes: "",
    tags: "",
  });
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState({});

  const tagsArray = useMemo(() => normalizeTags(form.tags), [form.tags]);
  const dupEmail = useMemo(() => {
    const e = form.email.trim().toLowerCase();
    if (!e) return false;
    return (existingLeads || []).some(
      l => String(l.email || "").toLowerCase() === e
    );
  }, [form.email, existingLeads]);

  const disabled =
    !form.name.trim() ||
    !isValidEmail(form.email) ||
    saving;

  async function handleSubmit(e) {
    e.preventDefault();
    if (disabled) return;

    const now = new Date().toISOString();
    const newLead = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || "",
      notes: form.notes.trim(),
      tags: tagsArray,
      createdAt: now,
      last_contacted: now, // <— matches the rest of your app
    };

    try {
      setSaving(true);
      const maybe = onAdd && onAdd(newLead);
      if (maybe && typeof maybe.then === "function") await maybe;
      setForm({ name: "", email: "", phone: "", notes: "", tags: "" });
      setTouched({});
    } finally {
      setSaving(false);
    }
  }

  const field = (name, props = {}) => (
    <input
      {...props}
      name={name}
      value={form[name]}
      onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))}
      onBlur={() => setTouched(t => ({ ...t, [name]: true }))}
      style={{
        ...inputStyle,
        ...(props.style || {}),
        borderColor:
          touched[name] && props.required && !String(form[name]).trim()
            ? "#aa3a3a"
            : BORDER,
      }}
    />
  );

  return (
    <form onSubmit={handleSubmit} style={card}>
      <h2 style={title}>📥 Add New Lead</h2>

      <label style={label}>Full Name</label>
      {field("name", {
        placeholder: "Jane Doe",
        required: true,
        "aria-invalid": touched.name && !form.name.trim(),
      })}

      <label style={label}>Email</label>
      {field("email", {
        type: "email",
        placeholder: "jane@example.com",
        required: true,
        "aria-invalid": touched.email && !isValidEmail(form.email),
      })}
      <div style={{ ...hint, color: dupEmail ? "#ff9b9b" : SUBTEXT }}>
        {dupEmail
          ? "A lead with this email already exists. You can still add a note or update the existing lead from the list."
          : "We'll auto-check for duplicates by email."}
      </div>

      <label style={label}>Phone (optional)</label>
      {field("phone", { placeholder: "+1 555 123 4567", inputMode: "tel" })}

      <label style={label}>Notes</label>
      <textarea
        name="notes"
        value={form.notes}
        onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
        onBlur={() => setTouched(t => ({ ...t, notes: true }))}
        placeholder="Context, where they came from, what they want…"
        rows={3}
        style={{ ...inputStyle, resize: "vertical" }}
      />

      <label style={label}>Tags (comma-separated)</label>
      {field("tags", { placeholder: "VIP, Upsell, New" })}

      {/* Tag preview */}
      {tagsArray.length > 0 && (
        <div style={{ marginTop: 6, marginBottom: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {tagsArray.map(t => (
            <span
              key={t}
              style={{
                background: "#0E1013",
                border: `1px solid ${BORDER}`,
                color: TEXT,
                fontWeight: 800,
                fontSize: 12,
                padding: "5px 10px",
                borderRadius: 999,
              }}
              title={t}
            >
              {t}
            </span>
          ))}
        </div>
      )}

      <button
        type="submit"
        disabled={disabled}
        style={{
          background: disabled ? "#4a4a4a" : GOLD,
          color: disabled ? "#bdbdbd" : "#191a1d",
          fontWeight: 900,
          border: "none",
          borderRadius: 10,
          padding: "12px 16px",
          cursor: disabled ? "not-allowed" : "pointer",
          boxShadow: disabled ? "none" : "0 2px 14px rgba(247,203,83,.25)",
          width: "100%",
          transition: "transform .04s ease",
        }}
        onMouseDown={e => !disabled && (e.currentTarget.style.transform = "scale(.99)")}
        onMouseUp={e => (e.currentTarget.style.transform = "scale(1)")}
      >
        {saving ? "Saving…" : "Save Lead"}
      </button>
    </form>
  );
}

/* ===== Styles ===== */
const card = {
  background: CARD,
  color: TEXT,
  padding: 18,
  borderRadius: 14,
  border: `1px solid ${BORDER}`,
  maxWidth: 560,
  boxShadow: "0 2px 26px rgba(0,0,0,.35)",
};

const title = {
  fontSize: 18,
  fontWeight: 900,
  marginBottom: 12,
  color: GOLD,
};

const label = {
  display: "block",
  marginTop: 10,
  marginBottom: 6,
  fontWeight: 800,
  color: TEXT,
  fontSize: 14,
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: "1.02em",
  background: BG,
  color: TEXT,
  border: `1.5px solid ${BORDER}`,
  outline: "none",
};

const hint = {
  fontSize: 12,
  marginTop: 6,
};
