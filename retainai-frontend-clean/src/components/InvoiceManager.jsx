// src/components/InvoiceManager.jsx
import React, { useState, useEffect, useMemo } from "react";
import "./InvoiceManager.css";

// Resolve API base for CRA/Vite or fallback to same-origin
const API_BASE =
  (typeof process !== "undefined" &&
    process.env &&
    (process.env.REACT_APP_API_URL || process.env.REACT_APP_API_BASE)) ||
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL)) ||
  "";

export default function InvoiceManager({ userEmail }) {
  const [invoices, setInvoices] = useState([]);
  const [form, setForm] = useState({
    customerName: "",
    customerEmail: "",
    amount: "",
    description: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Currency formatter (handles dollars or Stripe-style cents)
  const formatMoney = useMemo(() => {
    const fmt = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return (val) => {
      const n = Number(val);
      if (!isFinite(n)) return fmt.format(0);
      // If it looks like an integer in cents, convert to dollars
      const asDollars =
        Number.isInteger(n) && !String(val).includes(".") && n >= 1000
          ? n / 100
          : n;
      return fmt.format(asDollars);
    };
  }, []);

  // Fetch existing invoices
  useEffect(() => {
    let alive = true;
    async function run() {
      setLoading(true);
      setError("");
      try {
        const r = await fetch(
          `${API_BASE}/api/stripe/invoices?user_email=${encodeURIComponent(
            userEmail || ""
          )}`,
          { headers: { Accept: "application/json" } }
        );
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `${r.status} ${r.statusText}`);
        if (alive) setInvoices(Array.isArray(data.invoices) ? data.invoices : []);
      } catch (e) {
        if (alive) setError(e.message || "Failed to load invoices.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    if (userEmail) run();
    return () => {
      alive = false;
    };
  }, [userEmail]);

  function onField(name) {
    return (e) => setForm((f) => ({ ...f, [name]: e.target.value }));
  }

  // Basic email + amount validation
  function validate() {
    if (!form.customerName.trim()) return "Customer name is required.";
    if (!form.customerEmail.trim()) return "Customer email is required.";
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.customerEmail.trim());
    if (!emailOk) return "Please enter a valid email.";
    const amount = parseFloat(form.amount);
    if (!isFinite(amount) || amount <= 0) return "Amount must be a positive number.";
    if (!form.description.trim()) return "Description is required.";
    return "";
  }

  // Create new invoice
  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setCreating(true);
    try {
      const payload = {
        user_email: userEmail,
        customerName: form.customerName.trim(),
        customerEmail: form.customerEmail.trim(),
        amount: String(form.amount).trim(), // backend expects dollars (string/number)
        description: form.description.trim(),
      };

      const res = await fetch(`${API_BASE}/api/stripe/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        throw new Error(data.error || `${res.status} ${res.statusText}`);
      }

      // Optimistically prepend new invoice
      setInvoices((inv) => [
        {
          id: data.invoice_id || data.id || Math.random().toString(36).slice(2),
          customer_name: form.customerName,
          amount_due: data.amount_due ?? Number(form.amount), // fallback if backend omitted
          status: data.status || "open",
          invoice_url: data.invoice_url || data.hosted_invoice_url || "",
        },
        ...inv,
      ]);

      setForm({ customerName: "", customerEmail: "", amount: "", description: "" });
    } catch (e) {
      setError(e.message || "Failed to create invoice.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="invoice-manager">
      <h3>Your Invoices</h3>

      <form className="invoice-form" onSubmit={handleCreate} noValidate>
        <input
          placeholder="Customer Name"
          value={form.customerName}
          onChange={onField("customerName")}
          required
        />
        <input
          placeholder="Customer Email"
          type="email"
          value={form.customerEmail}
          onChange={onField("customerEmail")}
          required
        />
        <input
          placeholder="Amount (e.g. 49.99)"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={form.amount}
          onChange={onField("amount")}
          required
        />
        <input
          placeholder="Description"
          value={form.description}
          onChange={onField("description")}
          required
        />
        <button type="submit" disabled={creating}>
          {creating ? "Adding…" : "Add Invoice"}
        </button>
        {error && <div className="error">{error}</div>}
      </form>

      {loading ? (
        <p>Loading invoices…</p>
      ) : invoices.length === 0 ? (
        <p>No invoices yet.</p>
      ) : (
        <table className="invoice-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Link</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td>{inv.id}</td>
                <td>{inv.customer_name || inv.customer?.name || "—"}</td>
                <td>{formatMoney(inv.amount_due)}</td>
                <td style={{ textTransform: "capitalize" }}>{inv.status || "—"}</td>
                <td>
                  {inv.invoice_url ? (
                    <a href={inv.invoice_url} target="_blank" rel="noreferrer">
                      View
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
