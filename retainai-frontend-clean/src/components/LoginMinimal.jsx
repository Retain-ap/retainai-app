// src/components/MinimalLogin.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import logo from "../assets/logo.png";
import "./MinimalLogin.css";

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

const SUPPORT_EMAIL = "owner@retainai.ca";

function Banner({ tone = "info", children }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`mlogin-banner ${tone}`}
    >
      {children}
    </div>
  );
}

function strengthOf(pw = "") {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const label =
    score >= 4 ? "Strong" : score === 3 ? "Medium" : pw ? "Weak" : "";
  return { score, label };
}

const emailOk = (v) => /^\S+@\S+\.\S+$/.test(v || "");

export default function MinimalLogin() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const initialMode = params.get("mode") === "login" ? "login" : "signup";
  const next = params.get("next") || "/app";

  const [mode, setMode] = useState(initialMode); // "signup" | "login"
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    business: "",
  });
  const [error, setError] = useState("");
  const [capsOn, setCapsOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const emailRef = useRef(null);
  const pwRef = useRef(null);

  // Redirect if already signed in
  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem("user") || "null");
      if (u?.email) navigate("/app", { replace: true });
    } catch {}
  }, [navigate]);

  // -------- Google OAuth --------
  async function onGoogleSuccess(credentialResponse) {
    setBusy(true);
    setError("");
    try {
      const token = credentialResponse.credential;
      const res = await fetch(`${API_BASE}/api/oauth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Google login failed.");
        setBusy(false);
        return;
      }
      localStorage.setItem(
        "user",
        JSON.stringify({
          email: data.user.email,
          name: data.user.name,
          logo: data.user.logo,
          businessType: data.user.businessType,
        })
      );
      localStorage.setItem("userEmail", data.user.email);
      document.cookie = `user_email=${encodeURIComponent(
        data.user.email
      )}; Path=/; SameSite=Lax; Max-Age=2592000`;
      navigate(next, { replace: true });
    } catch {
      setError("Google login error.");
    } finally {
      setBusy(false);
    }
  }

  // -------- Signup wizard logic --------
  function nextStep() {
    setError("");
    if (step === 0 && !emailOk(form.email)) {
      setError("Please enter a valid email.");
      emailRef.current?.focus();
      return;
    }
    if (step === 1 && !form.name.trim()) {
      setError("Name required.");
      return;
    }
    if (step === 2 && !form.business.trim()) {
      setError("Business required.");
      return;
    }
    setStep((s) => Math.min(3, s + 1));
  }
  function prevStep() {
    setError("");
    setStep((s) => Math.max(0, s - 1));
  }

  // -------- API calls --------
  async function handleSignup(e) {
    e.preventDefault();
    setError("");
    const { score } = strengthOf(form.password);
    if (score < 3) {
      setError("Please choose a stronger password.");
      pwRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          name: form.name,
          businessType: form.business,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Signup failed.");
        setBusy(false);
        return;
      }
      // Persist session (mirror your Login.jsx)
      localStorage.setItem(
        "user",
        JSON.stringify({
          email: form.email,
          name: form.name,
          logo: data.user?.logo,
          businessType: form.business,
        })
      );
      localStorage.setItem("userEmail", form.email);
      document.cookie = `user_email=${encodeURIComponent(
        form.email
      )}; Path=/; SameSite=Lax; Max-Age=2592000`;
      navigate("/app", { replace: true });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    if (!emailOk(form.email) || !form.password) {
      setError("Email and password are required.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed.");
        setBusy(false);
        return;
      }
      localStorage.setItem(
        "user",
        JSON.stringify({
          email: form.email,
          businessType: data.user.businessType,
          name: data.user.name,
          logo: data.user.logo,
        })
      );
      localStorage.setItem("userEmail", form.email);
      document.cookie = `user_email=${encodeURIComponent(
        form.email
      )}; Path=/; SameSite=Lax; Max-Age=2592000`;
      navigate(next, { replace: true });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // -------- Password strength meter --------
  const pw = strengthOf(form.password);
  const pwPct = Math.min(100, (pw.score / 5) * 100);

  // -------- Slides for signup --------
  const signupSlides = [
    {
      key: "email",
      content: (
        <>
          <label className="mlabel">What's your email?</label>
          <input
            ref={emailRef}
            className="minput"
            autoFocus
            type="email"
            placeholder="me@email.com"
            value={form.email}
            onChange={(e) =>
              setForm((f) => ({ ...f, email: e.target.value.trim() }))
            }
            onKeyDown={(e) => e.key === "Enter" && nextStep()}
          />
          <button type="button" className="mbtn next" onClick={nextStep}>
            Next
          </button>
        </>
      ),
    },
    {
      key: "name",
      content: (
        <>
          <label className="mlabel">Your full name</label>
          <input
            className="minput"
            type="text"
            placeholder="Full Name"
            value={form.name}
            onChange={(e) =>
              setForm((f) => ({ ...f, name: e.target.value }))
            }
            onKeyDown={(e) => e.key === "Enter" && nextStep()}
          />
          <div className="step-btns">
            <button type="button" className="mbtn back" onClick={prevStep}>
              Back
            </button>
            <button type="button" className="mbtn next" onClick={nextStep}>
              Next
            </button>
          </div>
        </>
      ),
    },
    {
      key: "business",
      content: (
        <>
          <label className="mlabel">What type of business?</label>
          <input
            className="minput"
            type="text"
            placeholder="Eg. Salon, Real Estate"
            value={form.business}
            onChange={(e) =>
              setForm((f) => ({ ...f, business: e.target.value }))
            }
            onKeyDown={(e) => e.key === "Enter" && nextStep()}
          />
          <div className="step-btns">
            <button type="button" className="mbtn back" onClick={prevStep}>
              Back
            </button>
            <button type="button" className="mbtn next" onClick={nextStep}>
              Next
            </button>
          </div>
        </>
      ),
    },
    {
      key: "password",
      content: (
        <>
          <label className="mlabel">Set a password</label>
          <input
            ref={pwRef}
            className="minput"
            type="password"
            placeholder="Password (8+ chars)"
            value={form.password}
            onChange={(e) =>
              setForm((f) => ({ ...f, password: e.target.value }))
            }
            onKeyUp={(e) => setCapsOn(e.getModifierState?.("CapsLock"))}
          />
          {capsOn && <div className="tiny-hint">Caps Lock is on</div>}
          <div className="pw-meter">
            <div className="pw-fill" style={{ width: `${pwPct}%` }} />
          </div>
          <div className={`pw-label ${pw.label.toLowerCase()}`}>
            {pw.label}
          </div>
          <div className="step-btns">
            <button type="button" className="mbtn back" onClick={prevStep}>
              Back
            </button>
            <button type="submit" className="mbtn primary" disabled={busy}>
              {busy ? "Creating…" : "Create account"}
            </button>
          </div>
        </>
      ),
    },
  ];

  // -------- UI --------
  const totalSteps = signupSlides.length;
  const progressPct = Math.round(((step + 1) / totalSteps) * 100);

  return (
    <div className="mlogin-bg">
      <div className="mlogin-card">
        {/* Left Hero Panel */}
        <div className="mlogin-left">
          <img src={logo} className="mlogin-logo" alt="RetainAI" />
          <div className="mlogin-title">RetainAI</div>
          <div className="mlogin-desc">Client relationships. Done right.</div>
          {mode === "signup" && (
            <div className="progress">
              <div className="progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
          )}
        </div>

        {/* Right Form Card */}
        <div className="mlogin-right">
          <form
            className="mlogin-form"
            autoComplete="off"
            onSubmit={mode === "signup" ? handleSignup : handleLogin}
            aria-busy={busy}
          >
            <div className="mlogin-headline">
              {mode === "signup" ? "Create your account" : "Sign in"}
            </div>

            {error && <Banner tone="error">{error}</Banner>}

            {mode === "signup" ? (
              <div key={signupSlides[step].key} className="mlogin-slide">
                {signupSlides[step].content}
              </div>
            ) : (
              <>
                <label className="mlabel">Your email</label>
                <input
                  className="minput"
                  type="email"
                  placeholder="me@email.com"
                  value={form.email}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, email: e.target.value }))
                  }
                  onKeyDown={(e) => e.key === "Enter" && handleLogin(e)}
                  autoFocus
                />
                <label className="mlabel">Password</label>
                <input
                  className="minput"
                  type="password"
                  placeholder="Password"
                  value={form.password}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, password: e.target.value }))
                  }
                  onKeyUp={(e) => setCapsOn(e.getModifierState?.("CapsLock"))}
                />
                {capsOn && <div className="tiny-hint">Caps Lock is on</div>}
                <button className="mbtn primary" type="submit" disabled={busy}>
                  {busy ? "Signing in…" : "Login"}
                </button>
              </>
            )}

            {/* Google OAuth */}
            <div className="oauth-sep">
              <span className="rule" />
              <span className="or">or</span>
              <span className="rule" />
            </div>

            <div className="google-wrap">
              <GoogleLogin
                onSuccess={onGoogleSuccess}
                onError={() => setError("Google Login Failed")}
                width="100%"
                shape="pill"
                theme="filled_black"
                text={mode === "signup" ? "signup_with" : "signin_with"}
              />
            </div>

            {/* Toggle */}
            <div className="mlogin-toggle">
              {mode === "signup" ? (
                <>
                  Already have an account?{" "}
                  <span
                    onClick={() => {
                      setMode("login");
                      setStep(0);
                      setError("");
                    }}
                  >
                    Sign in
                  </span>
                </>
              ) : (
                <>
                  No account?{" "}
                  <span
                    onClick={() => {
                      setMode("signup");
                      setStep(0);
                      setError("");
                    }}
                  >
                    Create one
                  </span>
                </>
              )}
            </div>

            {/* Support link */}
            <div className="mlogin-support">
              Need help?{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                  "Login help — RetainAI"
                )}`}
              >
                Contact support
              </a>
              .
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
