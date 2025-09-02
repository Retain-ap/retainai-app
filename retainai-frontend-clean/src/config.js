// Works with Vite (VITE_*), CRA (REACT_APP_*), or a window override.
export const API_BASE =
  (typeof window !== "undefined" && window.__API_BASE__) ||
  (import.meta && import.meta.env && import.meta.env.VITE_API_BASE) ||
  process.env.REACT_APP_API_BASE ||
  ""; // empty means "same origin" (dev)
