// src/pages/GoogleOAuthCallback.jsx
import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const API = process.env.REACT_APP_API_URL || "";

export default function GoogleOAuthCallback() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const [status, setStatus] = useState("Connecting Google…");

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(search);
      const code = params.get("code");
      const state = params.get("state"); // optional return-to path
      let user = null;
      try {
        user = JSON.parse(localStorage.getItem("user"));
      } catch {
        /* ignore */
      }

      if (!code || !user?.email) {
        setStatus("Missing authorization code or user email.");
        navigate("/app/settings", { replace: true });
        return;
      }

      try {
        const res = await fetch(`${API}/api/google/exchange-code`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, user_email: user.email }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok || data?.error) {
          const msg =
            data?.error ||
            data?.message ||
            `${res.status} ${res.statusText}` ||
            "Failed to connect Google.";
          setStatus(msg);
          navigate("/app/settings?gcal_error=1", { replace: true });
          return;
        }

        // Mark success for any UI that wants to read it.
        try {
          sessionStorage.setItem("gcal_connected", "1");
        } catch {
          /* ignore */
        }

        // If opened in a popup, notify parent (polling can also detect) and close.
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage({ type: "retainai:gcal_connected" }, "*");
            window.close();
            return;
          }
        } catch {
          /* ignore */
        }

        const redirect =
          state && state.startsWith("/app")
            ? state
            : "/app/settings?gcal_connected=1";
        navigate(redirect, { replace: true });
      } catch (e) {
        setStatus(`Connection failed: ${e?.message || String(e)}`);
        navigate("/app/settings?gcal_error=1", { replace: true });
      }
    })();
  }, [search, navigate]);

  return (
    <div
      style={{
        color: "#e9edef",
        padding: 24,
        background: "#181a1b",
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        fontWeight: 700,
      }}
    >
      {status}
    </div>
  );
}
