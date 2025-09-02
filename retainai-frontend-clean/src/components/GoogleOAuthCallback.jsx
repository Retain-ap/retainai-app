// src/pages/GoogleOAuthCallback.jsx
import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
export default function GoogleOAuthCallback() {
  const navigate = useNavigate();
  const { search } = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(search);
    const code = params.get("code");
    const user = JSON.parse(localStorage.getItem("user"));
    if (!code || !user?.email) {
      alert("Missing code or user email");
      navigate("/app/settings");
      return;
    }
    fetch(`${process.env.REACT_APP_API_URL}/api/google/exchange-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, user_email: user.email })
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          alert(data.error);
        }
        navigate("/app/settings?gcal_connected=1");
      });
  }, [navigate, search]);

  return <div>Connecting Google…</div>;
}
