import { useEffect, useState, useCallback } from "react";

export default function usePWAInstall() {
  const [deferred, setDeferred] = useState(null);
  const [canInstall, setCanInstall] = useState(false);

  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true;

  const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    const onBefore = (e) => {
      e.preventDefault();
      setDeferred(e);
      setCanInstall(true);
    };
    const onInstalled = () => {
      setDeferred(null);
      setCanInstall(false);
    };
    window.addEventListener("beforeinstallprompt", onBefore);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBefore);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferred) throw new Error("Install prompt not ready");
    deferred.prompt();
    const choice = await deferred.userChoice; // {outcome: "accepted" | "dismissed"}
    setDeferred(null);
    setCanInstall(false);
    return choice;
  }, [deferred]);

  return { canInstall, install, isStandalone, isiOS };
}
