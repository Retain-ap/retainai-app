// src/components/ContactList.jsx
import React, { useEffect, useState } from "react";
import axios from "axios";

/**
 * API base (works in Vite, CRA, and plain builds)
 * - VITE_API_BASE_URL or REACT_APP_API_URL if set
 * - localhost:5000 in dev
 * - render prod URL as fallback
 */
const API_BASE =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_BASE_URL) ||
  (typeof process !== "undefined" &&
    process.env &&
    process.env.REACT_APP_API_URL) ||
  (typeof window !== "undefined" &&
  window.location &&
  window.location.hostname.includes("localhost")
    ? "http://localhost:5000"
    : "https://retainai-app.onrender.com");

const DEMO_USER = "demo@retainai.ca"; // used when no session/cookie

export default function ContactList() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [newLead, setNewLead] = useState({ lead_username: "", email: "" });

  useEffect(() => {
    fetchLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchLeads() {
    setLoading(true);
    setErr("");
    try {
      // 1) Preferred: session-backed endpoint (cookies)
      const r1 = await axios.get(`${API_BASE}/api/leads`, {
        withCredentials: true,
      });
      if (Array.isArray(r1.data)) {
        setLeads(r1.data);
        setLoading(false);
        return;
      }
    } catch (_) {
      /* fall through to legacy path */
    }

    try {
      // 2) Legacy fallback: username-based endpoint
      const r2 = await axios.get(
        `${API_BASE}/leads?username=${encodeURIComponent(DEMO_USER)}`
      );
      setLeads(Array.isArray(r2.data) ? r2.data : []);
    } catch (e) {
      console.error("Error fetching leads:", e);
      setErr(
        e?.response?.data?.error ||
          e?.message ||
          "Failed to load leads. Check API_BASE and auth."
      );
    } finally {
      setLoading(false);
    }
  }

  const handleChange = (e) => {
    setNewLead({ ...newLead, [e.target.name]: e.target.value });
  };

  async function handleSubmit(e) {
    e.preventDefault();
    if (!newLead.lead_username || !newLead.email) return;

    // Payload that works with both new/legacy backends
    const payload = {
      username: DEMO_USER, // legacy expects "username"
      user_email: DEMO_USER, // some backends prefer user_email
      lead_username: newLead.lead_username,
      lead_name: newLead.lead_username,
      email: newLead.email,
    };

    // Try new route first, then legacy
    try {
      await axios.post(`${API_BASE}/api/submit_lead`, payload, {
        withCredentials: true,
      });
    } catch {
      await axios.post(`${API_BASE}/submit-lead`, payload, {
        withCredentials: true,
      });
    }

    setNewLead({ lead_username: "", email: "" });
    fetchLeads();
  }

  return (
    <div className="p-4 text-white">
      <h2 className="text-2xl font-bold mb-4">📋 Lead Dashboard</h2>

      {loading ? (
        <div className="text-gray-400">Loading leads…</div>
      ) : err ? (
        <div className="text-red-400 border border-red-600 rounded p-3 mb-4">
          {err}
        </div>
      ) : leads.length === 0 ? (
        <p className="text-gray-400">No leads captured yet.</p>
      ) : (
        <ul className="space-y-4">
          {leads.map((lead, index) => {
            const displayName =
              lead.lead_username || lead.username || lead.name || "Unnamed";
            const displayEmail = lead.email || lead.lead_email || "";
            return (
              <li
                key={lead.id || lead._id || index}
                className="border border-gray-700 p-4 rounded-md"
              >
                <p className="font-semibold">{displayName}</p>
                <p className="text-sm text-gray-300">{displayEmail}</p>
              </li>
            );
          })}
        </ul>
      )}

      {/* Add Lead Form */}
      <form
        onSubmit={handleSubmit}
        className="mt-6 border-t border-gray-700 pt-4 space-y-2"
      >
        <h3 className="text-lg font-semibold mb-2">➕ Add New Lead</h3>
        <input
          type="text"
          name="lead_username"
          placeholder="Name or Username"
          value={newLead.lead_username}
          onChange={handleChange}
          className="w-full p-2 rounded bg-gray-800 text-white"
          autoComplete="off"
        />
        <input
          type="email"
          name="email"
          placeholder="Email"
          value={newLead.email}
          onChange={handleChange}
          className="w-full p-2 rounded bg-gray-800 text-white"
          autoComplete="off"
        />
        <button
          type="submit"
          className="bg-yellow-400 hover:bg-yellow-300 text-black font-semibold py-2 px-4 rounded transition"
        >
          Save Lead
        </button>
      </form>

      {/* Tiny hint for config */}
      <div className="text-xs text-gray-400 mt-4">
        <b>API_BASE:</b> {API_BASE}
      </div>
    </div>
  );
}
