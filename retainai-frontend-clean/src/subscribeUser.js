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

export async function subscribeUser(email) {
  try {
    const registration = await navigator.serviceWorker.ready;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('Push permission not granted.');
      return;
    }

    const response = await fetch(`${API_BASE}/api/vapid-public-key`);
    const { publicKey } = await response.json();

    const convertedKey = urlBase64ToUint8Array(publicKey);

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedKey,
    });

    await fetch(`${API_BASE}/api/save-subscription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, subscription }),
    });

    console.log('Push subscription successful.');
  } catch (error) {
    console.error('Push subscription error:', error);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}
