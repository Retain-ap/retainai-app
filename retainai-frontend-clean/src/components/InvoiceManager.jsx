import React, { useState, useEffect } from "react";
import "./InvoiceManager.css";

export default function InvoiceManager({ userEmail }) {
  const [invoices, setInvoices] = useState([]);
  const [form, setForm]         = useState({
    customerName: "",
    customerEmail: "",
    amount: "",
    description: ""
  });
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(true);

  // Fetch existing invoices
  useEffect(() => {
    fetch(`/api/stripe/invoices?user_email=${encodeURIComponent(userEmail)}`)
      .then(r => r.json())
      .then(data => setInvoices(data.invoices || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [userEmail]);

  // Create new invoice
  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch("/api/stripe/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_email: userEmail, ...form })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setInvoices(inv => [
        {
          id: data.invoice_id,
          customer_name: form.customerName,
          amount_due: data.amount_due,
          status: "open",
          invoice_url: data.invoice_url
        },
        ...inv
      ]);
      setForm({ customerName: "", customerEmail: "", amount: "", description: "" });
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="invoice-manager">
      <h3>Your Invoices</h3>
      <form className="invoice-form" onSubmit={handleCreate}>
        <input
          placeholder="Customer Name"
          value={form.customerName}
          onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))}
          required
        />
        <input
          placeholder="Customer Email"
          type="email"
          value={form.customerEmail}
          onChange={e => setForm(f => ({ ...f, customerEmail: e.target.value }))}
          required
        />
        <input
          placeholder="Amount (e.g. 49.99)"
          type="number"
          step="0.01"
          value={form.amount}
          onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
          required
        />
        <input
          placeholder="Description"
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          required
        />
        <button type="submit">Add Invoice</button>
        {error && <div className="error">{error}</div>}
      </form>

      {loading ? (
        <p>Loading invoices…</p>
      ) : (
        <table className="invoice-table">
          <thead>
            <tr>
              <th>ID</th><th>Customer</th><th>Amount</th><th>Status</th><th>Link</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map(inv => (
              <tr key={inv.id}>
                <td>{inv.id}</td>
                <td>{inv.customer_name}</td>
                <td>${inv.amount_due.toFixed(2)}</td>
                <td>{inv.status}</td>
                <td>
                  <a href={inv.invoice_url} target="_blank" rel="noreferrer">
                    View
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
