// src/index.js
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import GoogleAuthWrapper from "./components/GoogleAuthProvider";
import { SettingsProvider } from "./components/SettingsContext";

// ---------------- PWA install prompt plumbing ----------------
let _deferredInstallPrompt = null;

export function canPromptInstall() {
  return !!_deferredInstallPrompt;
}

export async function promptInstall() {
  if (!_deferredInstallPrompt) throw new Error("Install prompt not ready");
  _deferredInstallPrompt.prompt();
  const choice = await _deferredInstallPrompt.userChoice; // { outcome: "accepted"|"dismissed" }
  _deferredInstallPrompt = null;
  return choice;
}

// Fired when the app becomes installable (Chrome/Edge desktop & Android)
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); // don’t show the mini-infobar; we’ll trigger it manually
  _deferredInstallPrompt = e;
  // Tell any UI (like Sidebar) that install is now available
  window.dispatchEvent(new Event("pwa-install-available"));
});

window.addEventListener("appinstalled", () => {
  _deferredInstallPrompt = null;
});
// --------------------------------------------------------------

// Register service worker + Push
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/service-worker.js");
      console.log("Service Worker registered:", registration);

      // Ask for push permission
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

        // Send to backend
        await fetch("/api/save-subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscription: pushSubscription,
            email: localStorage.getItem("userEmail"),
          }),
        });
      }
    } catch (err) {
      console.error("SW registration / push setup failed:", err);
    }
  });
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <SettingsProvider>
      <GoogleAuthWrapper>
        <App />
      </GoogleAuthWrapper>
    </SettingsProvider>
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
