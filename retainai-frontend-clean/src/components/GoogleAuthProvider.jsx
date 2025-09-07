// src/components/GoogleAuthWrapper.jsx
import React from "react";
import { GoogleOAuthProvider } from "@react-oauth/google";

/**
 * GoogleAuthWrapper
 * -----------------
 * Reads your Google OAuth client ID from env, with safe fallbacks:
 *  - Vite:        import.meta.env.VITE_GOOGLE_CLIENT_ID
 *  - CRA:         process.env.REACT_APP_GOOGLE_CLIENT_ID
 *  - Window var:  window.__ENV__.GOOGLE_CLIENT_ID (optional, e.g. injected at runtime)
 *
 * Avoids hardcoding keys in source. If no client ID is found, it will
 * render children normally and log a warning (auth buttons will not work).
 */

const CLIENT_ID =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_GOOGLE_CLIENT_ID) ||
  (typeof process !== "undefined" &&
    process.env &&
    process.env.REACT_APP_GOOGLE_CLIENT_ID) ||
  (typeof window !== "undefined" &&
    window.__ENV__ &&
    window.__ENV__.GOOGLE_CLIENT_ID) ||
  "";

export default function GoogleAuthWrapper({ children }) {
  if (!CLIENT_ID) {
    if (typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.warn(
        "[GoogleAuthWrapper] Missing Google OAuth client ID. " +
          "Set VITE_GOOGLE_CLIENT_ID (Vite) or REACT_APP_GOOGLE_CLIENT_ID (CRA)."
      );
    }
    // Render children so the app still loads; auth buttons will fail gracefully.
    return <>{children}</>;
  }

  return <GoogleOAuthProvider clientId={CLIENT_ID}>{children}</GoogleOAuthProvider>;
}
