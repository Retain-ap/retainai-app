// src/index.js
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { SettingsProvider } from "./components/SettingsContext";
import { GoogleOAuthProvider } from "@react-oauth/google";

// ---- Env helpers: CRA first, then Vite ----
const env = (craKey, viteKey) =>
  (typeof process !== "undefined" && process.env && process.env[craKey]) ||
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env[viteKey]) ||
  "";

const GOOGLE_CLIENT_ID   = env("REACT_APP_GOOGLE_CLIENT_ID", "VITE_GOOGLE_CLIENT_ID");
const API_BASE           = env("REACT_APP_API_BASE",         "VITE_API_BASE");
const VAPID_PUBLIC_KEY   = env("REACT_APP_VAPID_PUBLIC_KEY", "VITE_VAPID_PUBLIC_KEY");

if (!GOOGLE_CLIENT_ID) {
  console.warn("Google client ID missing; set REACT_APP_GOOGLE_CLIENT_ID (or VITE_GOOGLE_CLIENT_ID).");
}

// ---------------- PWA install prompt plumbing ----------------
let _deferredInstallPrompt = null;
export const canPromptInstall = () => !!_deferredInstallPrompt;
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
window.addEventListener("appinstalled", () => { _deferredInstallPrompt = null; });
// --------------------------------------------------------------

// Register service worker + Push
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/service-worker.js");
      console.log("Service Worker registered:", registration);

      // Ask for push permission (https or localhost)
      const isSecure = location.protocol === "https:" || location.hostname === "localhost";
      if (isSecure && typeof Notification !== "undefined" && VAPID_PUBLIC_KEY) {
        const permission = await Notification.requestPermission();
        if (permission === "granted" && registration.pushManager) {
          const subscribeOptions = {
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          };
          const pushSubscription = await registration.pushManager.subscribe(subscribeOptions);
          console.log("PushSubscription:", pushSubscription);

          const base = (API_BASE || window.location.origin).replace(/\/$/, "");
          await fetch(`${base}/api/save-subscription`, {
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
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) out[i] = rawData.charCodeAt(i);
  return out;
}
