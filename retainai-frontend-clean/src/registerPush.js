// src/registerPush.js
// ---- API base (CRA + Vite safe) ----
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

export async function registerPush(userEmail) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    alert('Push notifications are not supported on this browser.');
    return;
  }

  try {
    // Register the service worker
    const reg = await navigator.serviceWorker.register('/sw.js');

    // Ask for permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      alert('Notification permission denied');
      return;
    }

    // Subscribe to push
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array('BGmDgXHS2IWCSS1it898SKxymC1bzMaTpxTPJieigzpquCKMDOe3mAkr3gyY8MqeowBkLAQp2KQ3kFbt02VBCzU')
    });

    // Send to backend
    await fetch(`${API_BASE}/api/save-subscription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription, email: userEmail })
    });

    console.log('Push subscription registered!');
  } catch (err) {
    console.error('Push registration failed:', err);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
