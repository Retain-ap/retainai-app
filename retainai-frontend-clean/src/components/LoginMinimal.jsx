// src/components/MinimalLogin.jsx
import React, { useState } from "react";
import logo from "../assets/logo.png";
import "./MinimalLogin.css";

export default function MinimalLogin() {
  const [mode, setMode] = useState("signup"); // default to signup for demo, use 'login' if you prefer
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    business: "",
  });
  const [error, setError] = useState("");

  // Handle Google OAuth here (fill in your actual logic)
  function handleGoogle() {
    alert("Google OAuth coming soon!");
  }

  function nextStep() {
    if (mode === "signup") {
      if (step === 0 && !form.email) return setError("Email required.");
      if (step === 1 && !form.name) return setError("Name required.");
      if (step === 2 && !form.business) return setError("Business required.");
      setError("");
      setStep(step + 1);
    }
  }

  function prevStep() {
    setError("");
    setStep(Math.max(0, step - 1));
  }

  function handleSignup(e) {
    e.preventDefault();
    if (!form.password) return setError("Password required.");
    // Replace with your actual signup logic
    alert("Account created!");
  }

  function handleLogin(e) {
    e.preventDefault();
    if (!form.email || !form.password) return setError("All fields required.");
    // Replace with your actual login logic
    alert("Logged in!");
  }

  // Slides/steps for SIGNUP
  const signupSteps = [
    <>
      <label className="mlabel">What's your email?</label>
      <input
        className="minput"
        autoFocus
        type="email"
        placeholder="me@email.com"
        value={form.email}
        onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
      />
      <button type="button" className="mbtn next" onClick={nextStep}>Next</button>
    </>,
    <>
      <label className="mlabel">Your full name</label>
      <input
        className="minput"
        type="text"
        placeholder="Full Name"
        value={form.name}
        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
      />
      <div className="step-btns">
        <button type="button" className="mbtn back" onClick={prevStep}>Back</button>
        <button type="button" className="mbtn next" onClick={nextStep}>Next</button>
      </div>
    </>,
    <>
      <label className="mlabel">What type of business?</label>
      <input
        className="minput"
        type="text"
        placeholder="Eg. Salon, Real Estate"
        value={form.business}
        onChange={e => setForm(f => ({ ...f, business: e.target.value }))}
      />
      <div className="step-btns">
        <button type="button" className="mbtn back" onClick={prevStep}>Back</button>
        <button type="button" className="mbtn next" onClick={nextStep}>Next</button>
      </div>
    </>,
    <>
      <label className="mlabel">Set a password</label>
      <input
        className="minput"
        type="password"
        placeholder="Password"
        value={form.password}
        onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
      />
      <div className="step-btns">
        <button type="button" className="mbtn back" onClick={prevStep}>Back</button>
        <button type="submit" className="mbtn primary">Create account</button>
      </div>
    </>
  ];

  return (
    <div className="mlogin-bg">
      <div className="mlogin-card">
        {/* Left Hero Panel */}
        <div className="mlogin-left">
          <img src={logo} className="mlogin-logo" alt="RetainAI" />
          <div className="mlogin-title">RetainAI</div>
          <div className="mlogin-desc">Client relationships. Done right.</div>
        </div>
        {/* Right Form Card */}
        <div className="mlogin-right">
          <form
            className="mlogin-form"
            autoComplete="off"
            onSubmit={mode === "signup" ? handleSignup : handleLogin}
          >
            <div className="mlogin-headline">
              {mode === "signup" ? "Create your account" : "Sign in"}
            </div>
            {error && <div className="mlogin-error">{error}</div>}
            {mode === "signup" ? (
              <div className="mlogin-slide">{signupSteps[step]}</div>
            ) : (
              <>
                <label className="mlabel">Your email</label>
                <input
                  className="minput"
                  type="email"
                  placeholder="me@email.com"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  autoFocus
                />
                <label className="mlabel">Password</label>
                <input
                  className="minput"
                  type="password"
                  placeholder="Password"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                />
                <button className="mbtn primary" type="submit">Login</button>
              </>
            )}
            <button
              type="button"
              className="mbtn google"
              onClick={handleGoogle}
            >
              <span style={{ display: "flex", alignItems: "center", marginRight: 9 }}>
                <svg width="22" height="22" viewBox="0 0 48 48"><g><path fill="#4285F4" d="M44.5 20H24v8.5h11.7C34.6 32.6 29.9 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c2.8 0 5.3.9 7.4 2.6l6.3-6.3C33.7 5.1 29.1 3 24 3 12.9 3 4 11.9 4 23s8.9 20 20 20c11 0 19-7.9 19-20 0-1.3-.1-2.7-.3-4z"/><path fill="#34A853" d="M6.3 14.7l7 5.1C15.2 17 18.4 15 24 15c2.8 0 5.3.9 7.4 2.6l6.3-6.3C33.7 5.1 29.1 3 24 3 16.3 3 9.2 7.7 6.3 14.7z"/><path fill="#FBBC05" d="M24 43c5.6 0 10.3-1.8 13.7-5l-6.3-5.2c-2 .8-4.2 1.2-7.4 1.2-5.9 0-10.6-3.4-12.3-8.3l-7 5.4C9.2 39.2 16.3 43 24 43z"/><path fill="#EA4335" d="M44.5 20H24v8.5h11.7c-1.1 2.9-4.4 6-11.7 6-6.6 0-12-5.4-12-12s5.4-12 12-12c2.8 0 5.3.9 7.4 2.6l6.3-6.3C33.7 5.1 29.1 3 24 3 12.9 3 4 11.9 4 23s8.9 20 20 20c11 0 19-7.9 19-20 0-1.3-.1-2.7-.3-4z"/></g></svg>
              </span>
              {mode === "signup" ? "Sign up with Google" : "Sign in with Google"}
            </button>
            <div className="mlogin-toggle">
              {mode === "signup" ? (
                <>Already have an account?{" "}
                  <span onClick={() => { setMode("login"); setStep(0); setError(""); }}>
                    Sign in
                  </span>
                </>
              ) : (
                <>No account?{" "}
                  <span onClick={() => { setMode("signup"); setStep(0); setError(""); }}>
                    Create one
                  </span>
                </>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
