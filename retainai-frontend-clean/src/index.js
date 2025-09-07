// src/index.js
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { SettingsProvider } from "./components/SettingsContext";
import { GoogleOAuthProvider } from "@react-oauth/google";

/* -------------------- Google Client ID wiring -------------------- */
/* CRA env first, then Vite, then <meta> fallback */
const CRA_ID =
  (typeof process !== "undefined" &&
    process.env &&
    process.env.REACT_APP_GOOGLE_CLIENT_ID) ||
  "";

const VITE_ID =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_GOOGLE_CLIENT_ID) ||
  "";

// Fallback: read from <meta name="google-signin-client_id" ...>
const META_ID =
  (typeof document !== "undefined" &&
    document
      .querySelector('meta[name="google-signin-client_id"]')
      ?.getAttribute("content")) ||
  "";

const GOOGLE_CLIENT_ID = CRA_ID || VITE_ID || META_ID || "";

if (!GOOGLE_CLIENT_ID) {
  console.warn(
    "Google client ID missing; set REACT_APP_GOOGLE_CLIENT_ID (or VITE_GOOGLE_CLIENT_ID)."
  );
}

/* ---------------- PWA install prompt plumbing ---------------- */
let _deferredInstallPrompt = null;

export function canPromptInstall() {
  return !!_deferredInstallPrompt;
}

export async function promptInstall() {
  if (!_deferredInstallPrompt) throw new Error("Install prompt not ready");
  _deferredInstallPrompt.prompt();
  const choice = await _deferredInstallPrompt.userChoice;
  _deferredInstallPrompt = null;
  return choice;
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  _deferredInstallPrompt = e;
  window.dispatchEvent(new Event("pwa-install-available"));
});

window.addEventListener("appinstalled", () => {
  _deferredInstallPrompt = null;
});

/* ---------------- Service Worker + Push ---------------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/service-worker.js");
      console.log("Service Worker registered:", registration);

      if (typeof Notification !== "undefined") {
        const permission = await Notification.requestPermission();
        if (permission === "granted" && process.env.REACT_APP_VAPID_PUBLIC_KEY) {
          const subscribeOptions = {
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(
              process.env.REACT_APP_VAPID_PUBLIC_KEY
            ),
          };
          const pushSubscription = await registration.pushManager.subscribe(subscribeOptions);
          console.log("PushSubscription:", pushSubscription);

          await fetch("/api/save-subscription", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subscription: pushSubscription,
              email: localStorage.getItem("userEmail"),
            }),
          });
        }
      }
    } catch (err) {
      console.error("SW registration / push setup failed:", err);
    }
  });
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID || "missing-client-id"}>
      <SettingsProvider>
        <App />
      </SettingsProvider>
    </GoogleOAuthProvider>
  </React.StrictMode>
);

// helper to convert VAPID key
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}
