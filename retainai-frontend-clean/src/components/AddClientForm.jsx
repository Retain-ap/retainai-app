// src/components/AddClientForm.jsx
import React, { useState } from "react";
import { api } from "../lib/api";

const emptyForm = {
  name: "",
  email: "",
  last_contacted: "",
  notes: "",
  tags: "",
};

function parseTags(s) {
  if (!s) return [];
  return s
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export default function AddClientForm({ onAdd }) {
  const [formData, setFormData] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError("");
    if (okMsg) setOkMsg("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    // basic validation
    if (!formData.name.trim()) {
      setError("Please enter a name.");
      return;
    }
    if (!formData.email.trim()) {
      setError("Please enter an email.");
      return;
    }

    setSubmitting(true);
    setError("");
    setOkMsg("");

    try {
      const payload = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        notes: formData.notes.trim(),
        tags: parseTags(formData.tags),
        // send ISO date if provided; backend can treat missing/empty as null
        ...(formData.last_contacted
          ? { last_contacted: new Date(formData.last_contacted).toISOString() }
          : {}),
      };

      // POST to your backend; cookies are sent automatically by api helper
      const created = await api.post("/api/leads", payload);

      // inform parent (if provided)
      if (typeof onAdd === "function") {
        onAdd(created || payload);
      }

      setFormData(emptyForm);
      setOkMsg("Lead saved.");
    } catch (err) {
      // surface backend error message if present
      setError(err?.message || "Failed to save lead.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-xl mx-auto">
      <input
        name="name"
        value={formData.name}
        onChange={handleChange}
        placeholder="Name"
        className="w-full p-2 rounded bg-zinc-800 text-white"
      />
      <input
        name="email"
        value={formData.email}
        onChange={handleChange}
        placeholder="Email"
        className="w-full p-2 rounded bg-zinc-800 text-white"
      />
      <input
        name="last_contacted"
        type="date"
        value={formData.last_contacted}
        onChange={handleChange}
        className="w-full p-2 rounded bg-zinc-800 text-white"
      />
      <textarea
        name="notes"
        value={formData.notes}
        onChange={handleChange}
        placeholder="Notes"
        className="w-full p-2 rounded bg-zinc-800 text-white"
        rows={4}
      />
      <input
        name="tags"
        value={formData.tags}
        onChange={handleChange}
        placeholder="Tags (comma-separated)"
        className="w-full p-2 rounded bg-zinc-800 text-white"
      />

      {error ? (
        <div
          className="w-full p-2 rounded text-sm"
          style={{ background: "#2a1414", color: "#ffb4b4", border: "1px solid #5a1a1a" }}
          aria-live="assertive"
        >
          {error}
        </div>
      ) : null}

      {okMsg ? (
        <div
          className="w-full p-2 rounded text-sm"
          style={{ background: "#122a18", color: "#b8ffcb", border: "1px solid #1a5a2a" }}
          aria-live="polite"
        >
          {okMsg}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="bg-gold text-black px-4 py-2 rounded"
        style={{ opacity: submitting ? 0.7 : 1 }}
      >
        {submitting ? "Saving…" : "Save Lead"}
      </button>
    </form>
  );
}
