// src/components/ProtectedRoute.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

/** Robust localStorage getter (SSR-safe) */
function getStoredUser() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("user");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // minimal shape + basic email sanity check
    const email = String(parsed?.email || "").trim();
    const okEmail =
      email &&
      // simple but safe-enough prod regex
      /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
    if (!okEmail) return null;
    return { ...parsed, email };
  } catch {
    // corrupted storage — clear so we don't loop on bad JSON
    try {
      window.localStorage.removeItem("user");
    } catch {}
    return null;
  }
}

/** Listen for auth changes (storage + custom events) */
function useAuthUser() {
  const [user, setUser] = useState(() => getStoredUser());

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "user") setUser(getStoredUser());
    };
    const onAuthChanged = () => setUser(getStoredUser());
    window.addEventListener("storage", onStorage);
    window.addEventListener("auth:changed", onAuthChanged);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("auth:changed", onAuthChanged);
    };
  }, []);

  // Also re-check on visibility change (handles SSO or other tabs)
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        setUser(getStoredUser());
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return user;
}

/** Small loading shim to avoid route flicker on first paint */
function Splash() {
  return (
    <div
      style={{
        minHeight: "60vh",
        display: "grid",
        placeItems: "center",
        color: "#9aa3ab",
        fontWeight: 700,
      }}
      role="status"
      aria-live="polite"
    >
      Checking session…
    </div>
  );
}

/**
 * ProtectedRoute
 * - Verifies presence of a well-formed user object in localStorage
 * - Redirects to /login with ?next=<current-path> so we can bounce back after auth
 * - Updates when auth changes in another tab
 */
export default function ProtectedRoute({ children }) {
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const user = useAuthUser();

  // mark ready after first microtask — prevents hydration flicker
  useEffect(() => {
    const id = setTimeout(() => setReady(true), 0);
    return () => clearTimeout(id);
  }, []);

  const isAuthed = useMemo(() => Boolean(user?.email), [user]);

  if (!ready) return <Splash />;

  if (!isAuthed) {
    // Preserve where the user was trying to go
    const next = encodeURIComponent(
      `${location.pathname}${location.search || ""}${location.hash || ""}`
    );
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return children;
}
