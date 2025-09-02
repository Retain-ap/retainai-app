import { useState } from "react";

export default function TokenGenerator() {
  const [shortToken, setShortToken] = useState("");
  const [longToken, setLongToken] = useState("");
  const [status, setStatus] = useState("");

  const handleExchange = async () => {
    setStatus("⏳ Exchanging token...");
    try {
      const response = await fetch(
        `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=YOUR_APP_ID&client_secret=YOUR_APP_SECRET&fb_exchange_token=${shortToken}`
      );
      const data = await response.json();

      if (data.access_token) {
        setLongToken(data.access_token);
        setStatus("✅ Long-lived token generated!");

        // Save token to backend
        const saveRes = await fetch("http://localhost:5000/store-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: data.access_token }),
        });

        const result = await saveRes.json();
        if (!saveRes.ok) {
          setStatus("⚠️ Token saved, but backend error.");
        } else {
          console.log("Saved to backend:", result);
        }
      } else {
        setStatus("❌ Error: " + (data.error?.message || "Unknown error"));
      }
    } catch (err) {
      console.error("Exchange failed:", err);
      setStatus("❌ Network or server error.");
    }
  };

  return (
    <section className="bg-brand-black text-white py-12 px-6 rounded-xl shadow-lg max-w-3xl mx-auto border border-brand-gold mt-12">
      <h2 className="text-2xl font-bold mb-4 text-brand-gold text-center">🎯 Instagram Token Generator</h2>

      <input
        type="text"
        placeholder="Paste short-lived token"
        value={shortToken}
        onChange={(e) => setShortToken(e.target.value)}
        className="w-full p-3 rounded mb-4 text-black"
      />

      <button
        onClick={handleExchange}
        className="bg-brand-gold text-black font-semibold px-6 py-3 rounded hover:bg-brand-goldHover transition w-full"
      >
        Get Long-Lived Token
      </button>

      {longToken && (
        <div className="mt-4 text-sm break-words bg-gray-800 p-3 rounded text-green-300">
          <strong>Long Token:</strong> {longToken}
        </div>
      )}

      {status && (
        <p className="mt-4 text-sm text-gray-300">{status}</p>
      )}
    </section>
  );
}
