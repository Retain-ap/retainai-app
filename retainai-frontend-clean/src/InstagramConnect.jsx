import { useState } from "react";

export default function InstagramConnect() {
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [shortToken, setShortToken] = useState("");
  const [longToken, setLongToken] = useState("");
  const [status, setStatus] = useState("");

  const handleExchange = async () => {
    setStatus("Fetching long-lived token...");
    try {
      const res = await fetch(
        `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`
      );
      const data = await res.json();
      if (data.access_token) {
        setLongToken(data.access_token);
        setStatus("✅ Token retrieved successfully!");
      } else {
        setStatus("❌ Failed: " + data.error.message);
      }
    } catch (err) {
      setStatus("❌ Error fetching token.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-xl space-y-6">
        <h2 className="text-2xl font-bold text-center">Instagram Token Generator</h2>

        <div>
          <label className="block font-semibold">Facebook App ID</label>
          <input
            className="w-full p-2 border border-gray-300 rounded-lg"
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
          />
        </div>

        <div>
          <label className="block font-semibold">Facebook App Secret</label>
          <input
            type="password"
            className="w-full p-2 border border-gray-300 rounded-lg"
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
          />
        </div>

        <div>
          <label className="block font-semibold">Short-Lived Token</label>
          <input
            className="w-full p-2 border border-gray-300 rounded-lg"
            value={shortToken}
            onChange={(e) => setShortToken(e.target.value)}
          />
        </div>

        <button
          className="w-full bg-blue-600 text-white p-3 rounded-xl font-bold hover:bg-blue-700 transition"
          onClick={handleExchange}
        >
          Get Long-Lived Token
        </button>

        {longToken && (
          <div className="bg-green-100 text-green-800 p-4 rounded-lg break-all text-sm">
            <strong>Long-Lived Token:</strong>
            <div>{longToken}</div>
          </div>
        )}

        {status && <p className="text-center text-gray-600">{status}</p>}
      </div>
    </div>
  );
}
