import React, { useEffect, useState } from "react";

export default function InstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isInStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  if (installed || isInStandalone) return null;

  if (isIOS) {
    return (
      <div style={{ background:"#232323", color:"#e9edef", padding:12, borderRadius:12 }}>
        <b>Add to Home Screen</b>
        <div style={{ fontSize:14, opacity:0.9, marginTop:6 }}>
          Open in Safari → Share → <b>Add to Home Screen</b>.
        </div>
      </div>
    );
  }

  if (!deferredPrompt) return null;

  return (
    <button onClick={async () => {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") setDeferredPrompt(null);
    }}>
      Install App
    </button>
  );
}
