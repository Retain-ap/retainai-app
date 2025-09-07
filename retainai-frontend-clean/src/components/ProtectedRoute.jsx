import React, { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

/** Robust localStorage getter (SSR-safe) */
function getStoredUser() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("user");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const email = String(parsed?.email || "").trim();
    const okEmail = email && /^[^\s@]+@[^\s@]{1,}\.[^\s@]{2,}$/.test(email);
    if (!okEmail) return null;
    return { ...parsed, email };
  } catch {
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

export default function ProtectedRoute({ children }) {
  // IMPORTANT: do NOT call this variable "location" — CRA will flag the global.
  const routerLocation = useLocation();
  const [ready, setReady] = useState(false);
  const user = useAuthUser();

  useEffect(() => {
    const id = setTimeout(() => setReady(true), 0);
    return () => clearTimeout(id);
  }, []);

  const isAuthed = useMemo(() => Boolean(user?.email), [user]);

  if (!ready) return <Splash />;

  if (!isAuthed) {
    // Prefer the true browser URL. Fallback to react-router location on SSR.
    const nextPath = (() => {
      if (typeof window !== "undefined" && window.location) {
        const { pathname, search, hash } = window.location;
        return `${pathname}${search || ""}${hash || ""}`;
      }
      const rl = routerLocation || {};
      return `${rl.pathname || "/"}${rl.search || ""}${rl.hash || ""}`;
    })();

    const next = encodeURIComponent(nextPath);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return children;
}
