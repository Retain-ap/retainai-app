// src/components/UserContext.jsx
import React, {
  createContext,
  useState,
  useEffect,
  useCallback,
  useContext,
  useRef,
} from "react";

/* ---------- API base (CRA + Vite safe) ---------- */
const API_BASE =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_BASE_URL) ||
  (typeof process !== "undefined" &&
    process.env &&
    process.env.REACT_APP_API_BASE) ||
  (typeof window !== "undefined" &&
  window.location &&
  window.location.hostname.includes("localhost")
    ? "http://localhost:5000"
    : "https://retainai-app.onrender.com");

/* ---------- Safe localStorage helpers ---------- */
function lsGet(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function lsSet(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}
function lsRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

/* ---------- Cookie helper ---------- */
function getCookie(name) {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : "";
}
function deleteCookie(name) {
  try {
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
  } catch {}
}

/* ---------- Context ---------- */
const UserContext = createContext({
  user: null,
  isLoading: false,
  error: "",
  refreshUser: () => Promise.resolve(),
  updateUser: () => {},
  setUserEmail: () => {},
  signOut: () => {},
});

export function UserProvider({ children }) {
  // seed from localStorage to avoid flashes
  const seedUser = lsGet("user", null);
  const [user, setUser] = useState(seedUser);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef(null);

  const getCurrentEmail = useCallback(() => {
    const stored = localStorage.getItem("userEmail");
    if (stored) return stored;
    const cookieEmail = getCookie("user_email");
    if (cookieEmail) return cookieEmail;
    const u = lsGet("user", null);
    return u?.email || null;
  }, []);

  const fetchUser = useCallback(async () => {
    const email = getCurrentEmail();
    if (!email) {
      setUser(null);
      return;
    }

    // cancel in-flight fetch
    abortRef.current?.abort?.();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError("");
    try {
      const res = await fetch(
        `${API_BASE}/api/user/${encodeURIComponent(email)}`,
        { signal: controller.signal, credentials: "include" }
      );
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        // If unauthorized/unknown, clear local state
        if (res.status === 401 || res.status === 404) {
          setUser(null);
          lsRemove("user");
          // keep userEmail so we can retry if session returns
        }
        throw new Error(json?.error || `User fetch failed (${res.status})`);
      }

      setUser(json || null);
      lsSet("user", json || null);
      if (json?.email) localStorage.setItem("userEmail", json.email);
    } catch (e) {
      if (e.name !== "AbortError") {
        setError(e.message || "Network error");
      }
    } finally {
      setIsLoading(false);
    }
  }, [getCurrentEmail]);

  // initial + on demand
  useEffect(() => {
    fetchUser();
    return () => abortRef.current?.abort?.();
  }, [fetchUser]);

  // cross-tab sync + visibility refresh
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "user" || e.key === "userEmail") fetchUser();
    };
    const onAuthChanged = () => fetchUser();
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchUser();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("auth:changed", onAuthChanged);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("auth:changed", onAuthChanged);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchUser]);

  // Public helpers
  const updateUser = useCallback((patch) => {
    setUser((prev) => {
      const next = { ...(prev || {}), ...(patch || {}) };
      lsSet("user", next);
      if (next?.email) localStorage.setItem("userEmail", next.email);
      return next;
    });
  }, []);

  const setUserEmail = useCallback(
    (email) => {
      if (email) localStorage.setItem("userEmail", email);
      else lsRemove("userEmail");
      window.dispatchEvent(new Event("auth:changed"));
    },
    []
  );

  const signOut = useCallback(() => {
    // Clear local auth footprint
    lsRemove("user");
    lsRemove("rememberEmail");
    lsRemove("rememberFlag");
    lsRemove("appSettings");
    localStorage.removeItem("userEmail");
    deleteCookie("user_email");
    setUser(null);
    window.dispatchEvent(new Event("auth:changed"));
  }, []);

  return (
    <UserContext.Provider
      value={{
        user,
        isLoading,
        error,
        refreshUser: fetchUser,
        updateUser,
        setUserEmail,
        signOut,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
