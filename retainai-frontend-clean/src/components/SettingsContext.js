import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

// --- Default Settings State ---
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

const SettingsContext = createContext();

// --- Provider Component ---
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    try {
      const stored = localStorage.getItem("appSettings");
      return stored
        ? { ...defaultSettings, ...JSON.parse(stored) }
        : defaultSettings;
    } catch (e) {
      return defaultSettings;
    }
  });

  // --- NEW: User refresh from backend ---
  const refreshUser = useCallback(async () => {
    try {
      const email = settings.user?.email || localStorage.getItem("email");
      if (!email) return;
      const res = await fetch(`/api/user/${encodeURIComponent(email)}`);
      if (!res.ok) throw new Error("User fetch failed");
      const data = await res.json();
      setSettings((prev) => ({
        ...prev,
        user: { ...prev.user, ...data },
        integrations: {
          ...prev.integrations,
          stripe: {
            ...prev.integrations.stripe,
            connected: data.stripe_connected,
            stripe_user_id: data.stripe_account_id,
            status: data.stripe_connected ? "connected" : "disconnected",
          },
        },
      }));
    } catch (e) {
      // Could show toast or log error
      //console.error(e);
    }
  }, [settings.user]);

  // Persist to localStorage & update CSS variables
  useEffect(() => {
    localStorage.setItem("appSettings", JSON.stringify(settings));
    document.body.dataset.theme = settings.theme;
    document.body.style.setProperty("--accent", settings.accent);
  }, [settings]);

  // --- Theme helpers ---
  const setTheme = (theme) =>
    setSettings((s) => ({ ...s, theme }));
  const setAccent = (accent) =>
    setSettings((s) => ({ ...s, accent }));

  // --- User helpers ---
  const setUser = (user) =>
    setSettings((s) => ({ ...s, user }));

  // --- Notification helpers ---
  const setNotifications = (notifications) =>
    setSettings((s) => ({
      ...s,
      notifications: { ...s.notifications, ...notifications },
    }));

  // --- Google Calendar helpers ---
  const setGoogleCalendar = (gcal) =>
    setSettings((s) => ({
      ...s,
      integrations: {
        ...s.integrations,
        googleCalendar: { ...s.integrations.googleCalendar, ...gcal },
      },
    }));

  // --- Stripe Connect helpers ---
  const setStripe = (stripeData) =>
    setSettings((s) => ({
      ...s,
      integrations: {
        ...s.integrations,
        stripe: { ...s.integrations.stripe, ...stripeData },
      },
    }));

  // --- Reset to Defaults ---
  const resetSettings = () => setSettings(defaultSettings);

  return (
    <SettingsContext.Provider
      value={{
        settings,
        setTheme,
        setAccent,
        setUser,
        setNotifications,
        setGoogleCalendar,
        setStripe,
        resetSettings,
        refreshUser, // <--- key addition!
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

// --- Hook for easy use ---
export function useSettings() {
  return useContext(SettingsContext);
}
