// File: src/context/SettingsContext.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";

/* ---------------- ENV (CRA + Vite safe) ---------------- */
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

const isBrowser = typeof window !== "undefined";

/* ---------------- Storage & versioning ---------------- */
const STORAGE_KEY = "appSettings:v1";
const LEGACY_KEY = "appSettings"; // migrate from old key

/* ---------------- Defaults ---------------- */
const defaultSettings = {
  theme: "dark",
  accent: "#f7cb53",
  user: null,
  notifications: {
    push: true,
    email: false,
    reminders: true,
  },
  integrations: {
    googleCalendar: {
      connected: false,
      events: [],
      status: "disconnected",
    },
    stripe: {
      connected: false,
      stripe_user_id: null,
      status: "disconnected",
    },
  },
};

/* ---------------- Utils ---------------- */
const deepMerge = (base, patch) => {
  if (Array.isArray(base) && Array.isArray(patch)) return patch.slice();
  if (base && typeof base === "object" && patch && typeof patch === "object") {
    const out = { ...base };
    for (const k of Object.keys(patch)) {
      out[k] = deepMerge(base[k], patch[k]);
    }
    return out;
  }
  return patch === undefined ? base : patch;
};

const safeJSONParse = (str, fallback) => {
  try {
    return str ? JSON.parse(str) : fallback;
  } catch {
    return fallback;
  }
};

const readFromStorage = () => {
  if (!isBrowser) return null;
  const v1 = safeJSONParse(localStorage.getItem(STORAGE_KEY), null);
  if (v1) return v1;
  // migrate legacy
  const legacy = safeJSONParse(localStorage.getItem(LEGACY_KEY), null);
  if (legacy) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
      localStorage.removeItem(LEGACY_KEY);
    } catch {}
    return legacy;
  }
  return null;
};

const writeToStorage = (settings) => {
  if (!isBrowser) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // quota or privacy mode; ignore
  }
};

const pickUserFromLocal = () => {
  if (!isBrowser) return null;
  const u = safeJSONParse(localStorage.getItem("user"), null);
  if (!u) return null;
  // Avoid dragging unknown fields
  const { email, name, logo, business, businessType, location, people } = u;
  return { email, name, logo, business, businessType, location, people };
};

const validateTheme = (t) => (t === "dark" || t === "light" ? t : "dark");
const validateAccent = (hex) =>
  /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex || "") ? hex : defaultSettings.accent;

const applyThemeVars = (settings) => {
  if (!isBrowser) return;
  document.body.dataset.theme = validateTheme(settings.theme);
  document.body.style.setProperty("--accent", validateAccent(settings.accent));
};

/* ---------------- Context ---------------- */
const SettingsContext = createContext(undefined);

/* ---------------- Provider ---------------- */
export function SettingsProvider({ children }) {
  // Initial state (merge defaults + stored + local user)
  const [settings, setSettings] = useState(() => {
    const stored = readFromStorage();
    const withStored = stored
      ? deepMerge(defaultSettings, stored)
      : { ...defaultSettings };
    const initialUser = withStored.user || pickUserFromLocal();
    const merged = { ...withStored, user: initialUser || null };
    return merged;
  });

  const writeTimer = useRef(null);

  // Persist & apply CSS vars (debounced)
  useEffect(() => {
    applyThemeVars(settings);
    if (!isBrowser) return;

    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => {
      writeToStorage(settings);
    }, 120); // small debounce to reduce thrashing

    return () => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
    };
  }, [settings]);

  // Cross-tab sync
  useEffect(() => {
    if (!isBrowser) return;
    const onStorage = (e) => {
      if (e.key !== STORAGE_KEY) return;
      const incoming = safeJSONParse(e.newValue, null);
      if (!incoming) return;
      setSettings((prev) => {
        // If identical, ignore
        const next = deepMerge(prev, incoming);
        return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
      });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  /* ---------- Actions (stable callbacks) ---------- */
  const setTheme = useCallback(
    (theme) => setSettings((s) => ({ ...s, theme: validateTheme(theme) })),
    []
  );

  const setAccent = useCallback(
    (accent) => setSettings((s) => ({ ...s, accent: validateAccent(accent) })),
    []
  );

  const setUser = useCallback((user) => {
    setSettings((s) => ({ ...s, user: user ? { ...s.user, ...user } : null }));
  }, []);

  const setNotifications = useCallback((notifications) => {
    setSettings((s) => ({
      ...s,
      notifications: { ...s.notifications, ...notifications },
    }));
  }, []);

  const setGoogleCalendar = useCallback((gcal) => {
    setSettings((s) => ({
      ...s,
      integrations: {
        ...s.integrations,
        googleCalendar: {
          ...s.integrations.googleCalendar,
          ...gcal,
        },
      },
    }));
  }, []);

  const setStripe = useCallback((stripeData) => {
    setSettings((s) => ({
      ...s,
      integrations: {
        ...s.integrations,
        stripe: { ...s.integrations.stripe, ...stripeData },
      },
    }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(defaultSettings);
    if (isBrowser) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
    }
  }, []);

  // Refresh user from backend (abortable)
  const refreshUser = useCallback(async () => {
    const email =
      settings.user?.email ||
      (isBrowser ? localStorage.getItem("email") : null);
    if (!email) return;
    const ac = new AbortController();
    try {
      const res = await fetch(
        `${API_BASE}/api/user/${encodeURIComponent(email)}`,
        { signal: ac.signal }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      setSettings((prev) => ({
        ...prev,
        user: { ...prev.user, ...data },
        integrations: {
          ...prev.integrations,
          stripe: {
            ...prev.integrations.stripe,
            connected: !!data.stripe_connected,
            stripe_user_id: data.stripe_account_id || null,
            status: data.stripe_connected ? "connected" : "disconnected",
          },
        },
      }));
    } catch {
      // no-op (network/offline)
    }
    return () => ac.abort();
  }, [settings.user?.email]);

  // Memoize context value to avoid re-renders of consumers
  const ctxValue = useMemo(
    () => ({
      settings,
      setTheme,
      setAccent,
      setUser,
      setNotifications,
      setGoogleCalendar,
      setStripe,
      resetSettings,
      refreshUser,
    }),
    [
      settings,
      setTheme,
      setAccent,
      setUser,
      setNotifications,
      setGoogleCalendar,
      setStripe,
      resetSettings,
      refreshUser,
    ]
  );

  return (
    <SettingsContext.Provider value={ctxValue}>
      {children}
    </SettingsContext.Provider>
  );
}

/* ---------------- Hook ---------------- */
export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return ctx;
}
