// src/components/InstallButton.jsx
import React, { useEffect, useState } from "react";

const CARD = "#232323";
const TEXT = "#e9edef";
const BORDER = "#2a3942";
const GOLD = "#ffd966";

export default function InstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(() => {
    try {
      return localStorage.getItem("pwa_installed") === "1";
    } catch {
      return false;
    }
  });
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  // Detect platform/state once on mount
  useEffect(() => {
    try {
      const ua = navigator.userAgent || "";
      setIsIOS(/iphone|ipad|ipod/i.test(ua));
      const standalone =
        (window.matchMedia &&
          window.matchMedia("(display-mode: standalone)").matches) ||
        // iOS Safari standalone flag
        window.navigator.standalone;
      setIsStandalone(!!standalone);
    } catch {
      /* noop */
    }
  }, []);

  // Capture install prompt & installed event
  useEffect(() => {
    const onBeforeInstallPrompt = (e) => {
      e.preventDefault(); // keep for later
      setDeferredPrompt(e);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      try {
        localStorage.setItem("pwa_installed", "1");
      } catch {}
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  if (installed || isStandalone) return null;

  // iOS doesn’t support beforeinstallprompt — show native instructions
  if (isIOS) {
    return (
      <div
        style={{
          background: CARD,
          color: TEXT,
          padding: 12,
          borderRadius: 12,
          border: `1px solid ${BORDER}`,
        }}
      >
        <b style={{ color: GOLD }}>Add to Home Screen</b>
        <div style={{ fontSize: 14, opacity: 0.9, marginTop: 6 }}>
          Open in Safari → Share → <b>Add to Home Screen</b>.
        </div>
      </div>
    );
  }

  // For Chrome/Edge etc. (when beforeinstallprompt fired)
  if (!deferredPrompt) return null;

  return (
    <div
      style={{
        background: CARD,
        color: TEXT,
        padding: 12,
        borderRadius: 12,
        border: `1px solid ${BORDER}`,
        display: "inline-flex",
        gap: 10,
        alignItems: "center",
      }}
    >
      <span>Install this app for quicker access.</span>
      <button
        onClick={async () => {
          try {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === "accepted") {
              setInstalled(true);
              try {
                localStorage.setItem("pwa_installed", "1");
              } catch {}
            }
            setDeferredPrompt(null);
          } catch {
            setDeferredPrompt(null);
          }
        }}
        style={{
          background: GOLD,
          color: "#191919",
          border: "none",
          borderRadius: 8,
          padding: "8px 14px",
          fontWeight: 800,
          cursor: "pointer",
        }}
      >
        Install App
      </button>
    </div>
  );
}
