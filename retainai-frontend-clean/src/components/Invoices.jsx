// File: frontend/src/components/Invoices.jsx
import React, { useState, useEffect, useCallback } from "react";
import { EyeIcon, BellIcon } from "@heroicons/react/24/outline";

const CURRENCIES = ["usd", "cad", "eur", "gbp", "aud"]; // short list

export default function Invoices({ user, leads }) {
  const [invoices, setInvoices] = useState([]);
  const [account, setAccount] = useState(null); // Stripe account details
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    customer_name: "",
    customer_email: "",
    item_name: "",
    price: "",
    quantity: 1,
    currency: "usd",
  });
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  // Load Stripe account (default_currency)
  useEffect(() => {
    if (!user?.email || !user?.stripe_connected) {
      setAccount(null);
      setForm((f) => ({ ...f, currency: "usd" }));
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/stripe/account?user_email=${encodeURIComponent(user.email)}`);
        const data = await res.json();
        const acct = data?.account || null;
        setAccount(acct);
        const dc = (acct?.default_currency || "usd").toLowerCase();
        setForm((f) => ({ ...f, currency: dc }));
      } catch {
        /* ignore */
      }
    })();
  }, [user?.email, user?.stripe_connected]);

  const loadInvoices = useCallback(async () => {
    if (!user?.email) return;
    try {
      const res = await fetch(`/api/stripe/invoices?user_email=${encodeURIComponent(user.email)}`);
      const { invoices = [] } = await res.json();
      setInvoices(invoices);
    } catch (err) {
      console.error("Failed to load invoices", err);
      setInvoices([]);
    }
  }, [user?.email]);

  useEffect(() => {
    if (user?.stripe_connected) {
      loadInvoices();
    } else {
      setInvoices([]);
    }
  }, [user?.stripe_connected, loadInvoices]);

  if (!user?.stripe_connected) {
    return (
      <div style={styles.notConnected}>
        <p>Please connect your Stripe account to view and create invoices.</p>
      </div>
    );
  }

  const autofill = (lead) => {
    setForm((f) => ({
      ...f,
      customer_name: lead.name || "",
      customer_email: lead.email || "",
    }));
    setShowModal(true);
  };

  const fmt = (amount, currency) => {
    const code = String(currency || account?.default_currency || "usd").toUpperCase();
    const safe = typeof amount === "number" ? amount : Number(amount || 0);
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: code,
        currencyDisplay: "narrowSymbol",
        maximumFractionDigits: 2,
      }).format(safe);
    } catch {
      return `${code} ${safe.toFixed?.(2) ?? safe}`;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSending(true);
    setMessage("");

    const quantity = parseInt(form.quantity || 1, 10);
    const price = parseFloat(form.price || 0);
    const calculatedAmount = price * quantity;

    if (!form.customer_name || !form.customer_email || !form.item_name || !form.price || isNaN(calculatedAmount) || calculatedAmount <= 0) {
      setMessage("❌ Please fill all fields with valid data.");
      setSending(false);
      return;
    }

    try {
      const res = await fetch("/api/stripe/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_email: user.email,
          customer_name: form.customer_name,
          customer_email: form.customer_email,
          amount: calculatedAmount,
          description: form.item_name,
          currency: form.currency,
          quantity,
          unit_amount: price,
        }),
      });
      const data = await res.json();

      if (data.success) {
        // Prefer server-refreshed list; otherwise prepend single invoice; otherwise fallback to GET
        if (Array.isArray(data.invoices)) {
          setInvoices(data.invoices);
        } else if (data.invoice) {
          setInvoices((prev) => [data.invoice, ...prev]);
        } else {
          await loadInvoices();
        }

        const shownAmt = data.amount_total ?? data.amount_due;
        setMessage(
          `✅ Invoice created${shownAmt ? ` for ${fmt(shownAmt, data.currency)}` : "!"}`
        );

        setShowModal(false);
        setForm({
          customer_name: "",
          customer_email: "",
          item_name: "",
          price: "",
          quantity: 1,
          currency: account?.default_currency || "usd",
        });
      } else {
        const err = String(data.error || "Could not create invoice.");
        if (/combine currencies/i.test(err) || /currency/i.test(err)) {
          const acctCur = (account?.default_currency || "your account currency").toUpperCase();
          setMessage(`❌ ${err} — Try setting Currency to ${acctCur} to match your Stripe account.`);
        } else {
          setMessage(`❌ ${err}`);
        }
      }
    } catch (e) {
      console.error(e);
      setMessage("❌ Server error");
    } finally {
      setSending(false);
    }
  };

  const handleView = (url) => {
    if (url) window.open(url, "_blank");
  };

  const handleResend = async (inv) => {
    setMessage("");
    try {
      const res = await fetch("/api/stripe/invoice/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: inv.id, user_email: user.email }),
      });
      const data = await res.json();
      data.success ? setMessage("✅ Invoice email re-sent!") : setMessage(`❌ ${data.error || "Could not resend."}`);
    } catch (e) {
      console.error(e);
      setMessage("❌ Server error resending");
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Invoices</h2>
          <p style={styles.subtitle}>Create, view, and remind leads about invoices.</p>
        </div>
        <button style={styles.newInvoiceBtn} onClick={() => setShowModal(true)}>
          + New Invoice
        </button>
      </div>

      {leads?.length > 0 && (
        <div style={styles.autofillRow}>
          <span style={styles.autofillLabel}>Autofill:</span>
          {leads.slice(0, 6).map((l) => (
            <button key={l.id} onClick={() => autofill(l)} style={styles.leadBtn}>
              {l.name || l.email}
            </button>
          ))}
        </div>
      )}

      {message && <div style={message.startsWith("✅") ? styles.successMsg : styles.errorMsg}>{message}</div>}

      <div style={styles.tableWrapper}>
        <table style={styles.table}>
          <thead style={styles.thead}>
            <tr>
              {["Customer", "Amount", "Due", "Status", "Actions"].map((h) => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody style={styles.tbody}>
            {invoices.map((inv) => (
              <tr key={inv.id} style={styles.tr}>
                <td style={styles.td}>{inv.customer_name || "-"}</td>
                <td style={styles.td}>
                  {typeof inv.amount_due === "number"
                    ? fmt(inv.amount_due, inv.currency || account?.default_currency || "usd")
                    : "—"}
                </td>
                <td style={styles.td}>
                  {inv.due_date ? new Date(inv.due_date * 1000).toLocaleDateString() : "—"}
                </td>
                <td style={{ ...styles.td, color: inv.status === "paid" ? "#38ff98" : "#f7cb53", textTransform: "capitalize" }}>
                  {inv.status}
                </td>
                <td style={{ ...styles.td, display: "flex", gap: 12 }}>
                  <EyeIcon style={styles.icon} onClick={() => handleView(inv.invoice_url)} />
                  <BellIcon style={styles.icon} onClick={() => handleResend(inv)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div style={styles.modalBg} onClick={() => setShowModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>New Invoice</h3>
            <form onSubmit={handleSubmit}>
              {[
                { label: "Customer Name", name: "customer_name", type: "text" },
                { label: "Customer Email", name: "customer_email", type: "email" },
                { label: "Item / Service", name: "item_name", type: "text" },
              ].map((fld) => (
                <div key={fld.name}>
                  <label style={styles.label}>{fld.label}</label>
                  <input
                    style={styles.input}
                    required
                    type={fld.type}
                    value={form[fld.name]}
                    onChange={(e) => setForm((frm) => ({ ...frm, [fld.name]: e.target.value }))}
                  />
                </div>
              ))}

              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>Price ({(form.currency || "usd").toUpperCase()})</label>
                  <input
                    style={styles.input}
                    required
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.price}
                    onChange={(e) => setForm((frm) => ({ ...frm, price: e.target.value }))}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>Quantity</label>
                  <input
                    style={styles.input}
                    required
                    type="number"
                    min="1"
                    value={form.quantity}
                    onChange={(e) => setForm((frm) => ({ ...frm, quantity: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label style={styles.label}>Currency</label>
                <select
                  style={{ ...styles.input, appearance: "none", cursor: "pointer" }}
                  value={form.currency}
                  onChange={(e) => setForm((frm) => ({ ...frm, currency: e.target.value.toLowerCase() }))}
                >
                  {(() => {
                    const dc = (account?.default_currency || "").toLowerCase();
                    return dc && !CURRENCIES.includes(dc) ? (
                      <option key={dc} value={dc}>{dc.toUpperCase()}</option>
                    ) : null;
                  })()}
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>{c.toUpperCase()}</option>
                  ))}
                </select>
                <div style={{ color: "#9aa3ab", fontSize: 12, marginTop: 6 }}>
                  Tip: Set this to your Stripe account currency ({(account?.default_currency || "usd").toUpperCase()}) to avoid mixed-currency errors.
                </div>
              </div>

              <div style={styles.modalActions}>
                <button type="button" style={styles.cancelBtn} onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={sending} style={styles.submitBtn}>
                  {sending ? "Sending…" : "Send Invoice"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  notConnected: {
    padding: 24,
    background: "#232325",
    borderRadius: 8,
    color: "#eee",
    textAlign: "center",
  },
  container: { width: "100%", minHeight: "100vh", padding: 24 },
  header: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    alignItems: "center",
    gap: 32,
    borderBottom: "1px solid #232323",
    paddingBottom: 24,
    marginBottom: 16,
  },
  title: { margin: 0, fontSize: 24, fontWeight: 700, color: "#eee" },
  subtitle: { margin: "4px 0 0", color: "#bbb" },
  newInvoiceBtn: {
    background: "#635bff",
    color: "#fff",
    padding: "10px 24px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
  },
  autofillRow: { marginBottom: 16, display: "flex", alignItems: "center", gap: 8 },
  autofillLabel: { color: "#888" },
  leadBtn: {
    background: "#222",
    color: "#fff",
    padding: "6px 12px",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
  },
  successMsg: { color: "#38c174", marginBottom: 16 },
  errorMsg: { color: "#e66565", marginBottom: 16 },
  tableWrapper: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", background: "#18181b", borderRadius: 8 },
  thead: { background: "#232325" },
  th: { textAlign: "left", padding: "12px 8px", color: "#aaa", fontSize: 14 },
  tbody: { color: "#ddd" },
  tr: { borderBottom: "1px solid #252525" },
  td: { padding: "10px 8px", fontSize: 14 },
  icon: { width: 20, height: 20, cursor: "pointer", color: "#635bff" },
  modalBg: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  modal: {
    background: "#232325",
    borderRadius: 8,
    padding: 24,
    width: "100%",
    maxWidth: 420,
    boxSizing: "border-box",
  },
  modalTitle: { margin: "0 0 16px", fontSize: 20, color: "#f7cb53" },
  label: { display: "block", marginBottom: 4, color: "#ccc", fontSize: 14 },
  input: {
    width: "100%",
    padding: "8px 12px",
    marginBottom: 12,
    background: "#18181b",
    border: "1px solid #444",
    borderRadius: 6,
    color: "#fff",
    fontSize: 14,
  },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 12 },
  cancelBtn: { background: "#444", color: "#fff", padding: "8px 16px", border: "none", borderRadius: 6, cursor: "pointer" },
  submitBtn: { background: "#635bff", color: "#fff", padding: "8px 16px", border: "none", borderRadius: 6, cursor: "pointer" },
};
