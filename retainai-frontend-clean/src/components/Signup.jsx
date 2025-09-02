// src/components/Signup.jsx
import React, { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import { jwtDecode } from "jwt-decode";
import logo from "../assets/logo.png";
import defaultAvatar from "../assets/default-avatar.png";

// ---- Theme ----
const BG = {
  page: "#0B0C0E",
  card: "#15171B",
  line: "#24262B",
  gold: "#F5D87E",
  goldDeep: "#D7BB66",
  text60: "rgba(255,255,255,.60)",
  text80: "rgba(255,255,255,.80)",
};

// Slides order
const SLIDES = ["email", "password", "name", "businessName", "businessType", "location", "teamSize", "avatar", "extra"];

function Progress({ step, total }) {
  const pct = Math.round(((step + 1) / total) * 100);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1, color: BG.text60 }}>STEP {step + 1} / {total}</div>
        <div style={{ fontSize: 12, color: BG.text60 }}>{pct}%</div>
      </div>
      <div style={{ height: 8, borderRadius: 999, overflow: "hidden", border: `1px solid ${BG.line}`, background: "#0E1013" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: BG.gold }} />
      </div>
    </div>
  );
}

function Slide({ active, children }) {
  return (
    <div
      style={{
        position: "absolute",
        left: active ? 0 : "120%",
        top: 0,
        width: "100%",
        opacity: active ? 1 : 0,
        transition: "left .35s cubic-bezier(.9,.01,.29,.98), opacity .35s",
      }}
    >
      {children}
    </div>
  );
}

function Chip({ children, onClick, active = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 12px",
        borderRadius: 999,
        fontSize: 14,
        border: `1px solid ${BG.line}`,
        background: active ? BG.gold : "#0E1013",
        color: active ? "#0B0B0C" : "#fff",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

export default function Signup() {
  const [step, setStep] = useState(0);

  // form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [location, setLocation] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [avatar, setAvatar] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  const [referral, setReferral] = useState("");
  const [agree, setAgree] = useState(true);

  const [error, setError] = useState("");
  const [googleProcessing, setGoogleProcessing] = useState(false);
  const navigate = useNavigate();

  const total = SLIDES.length;

  const pwStrength = useMemo(() => {
    let s = 0;
    if (password.length >= 8) s++;
    if (/[A-Z]/.test(password)) s++;
    if (/[0-9]/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    return s;
  }, [password]);

  // Google signup
  const handleGoogleSuccess = async (credentialResponse) => {
    setGoogleProcessing(true);
    try {
      const token = credentialResponse.credential;
      const decoded = jwtDecode(token);
      setEmail(decoded.email || "");
      setName(decoded.name || "");
      setAvatar(decoded.picture || defaultAvatar);
      setError("");
      setGoogleProcessing(false);
      setStep(1);
    } catch {
      setError("Google signup error.");
      setGoogleProcessing(false);
    }
  };

  // avatar upload
  function handleAvatarUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAvatar(reader.result);
    reader.readAsDataURL(file);
  }

  // step validation
  function canContinue(current = step) {
    switch (SLIDES[current]) {
      case "email": return /^\S+@\S+\.\S+$/.test(email);
      case "password": return password.length >= 8;
      case "name": return name.trim().length > 1;
      case "businessName": return businessName.trim().length > 1;
      case "businessType": return businessType.trim().length > 1;
      case "location": return location.trim().length > 1;
      case "teamSize": return String(teamSize).trim().length > 0;
      default: return true;
    }
  }
  function nextStep() { if (!canContinue(step)) return setError("Please complete this step."); setError(""); setStep((s) => Math.min(total - 1, s + 1)); }
  function prevStep() { setError(""); setStep((s) => Math.max(0, s - 1)); }
  const onEnter = (e, fn) => e.key === "Enter" && fn();

  // submit
  async function handleSignup(e) {
    e.preventDefault();
    setError("");
    if (!agree) { setError("Please agree to the Terms and Privacy Policy."); return; }
    if (!email || !password || !name || !businessName || !businessType || !location || !teamSize) {
      setError("All required fields must be filled.");
      return;
    }
    try {
      const res = await fetch("http://localhost:5000/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          name,
          businessName,
          businessType,
          location,
          teamSize,
          logo: avatar || defaultAvatar,
          phone,
          website,
          instagram,
          referral,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Signup failed."); return; }
      if (data.checkoutUrl) { window.location = data.checkoutUrl; return; }
      localStorage.setItem("user", JSON.stringify({
        email, name, logo: avatar || defaultAvatar, businessName, businessType, location, teamSize, phone, website, instagram, referral,
      }));
      navigate("/app");
    } catch { setError("Signup error."); }
  }

  return (
    <div style={{ minHeight: "100vh", background: BG.page, color: "#fff" }}>
      {/* gold glows */}
      <div aria-hidden style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div
          style={{
            position: "absolute",
            top: -240,
            right: -200,
            width: 900,
            height: 900,
            borderRadius: "9999px",
            filter: "blur(140px)",
            opacity: 0.2,
            background: BG.gold,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "35%",
            left: "50%",
            transform: "translateX(-50%)",
            width: "70vw",
            height: "60vh",
            borderRadius: "9999px",
            filter: "blur(120px)",
            opacity: 0.1,
            background: `linear-gradient(90deg, ${BG.gold}, transparent)`,
          }}
        />
      </div>

      {/* top bar */}
      <div style={{ position: "sticky", top: 0, zIndex: 5, background: "#0C0D10", borderBottom: `1px solid ${BG.line}` }}>
        <div
          style={{
            maxWidth: 1120,
            margin: "0 auto",
            padding: "12px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src={logo} alt="RetainAI" style={{ width: 28, height: 28, borderRadius: 6 }} />
            <span style={{ color: BG.gold, fontWeight: 900, letterSpacing: 0.2 }}>RetainAI</span>
          </div>
          <div style={{ fontSize: 13, color: BG.text60 }}>
            Have an account?{" "}
            <Link to="/login" style={{ color: BG.goldDeep, textDecoration: "underline" }}>
              Log in
            </Link>
          </div>
        </div>
      </div>

      {/* content (symmetrical spacing) */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 1120,
          margin: "0 auto",
          padding: "64px 24px",
          display: "grid",
          gridTemplateColumns: "520px 1fr",
          gap: 24,
        }}
      >
        {/* info/benefits card */}
        <aside
          style={{
            borderRadius: 24,
            border: `1px solid ${BG.line}`,
            background:
              "radial-gradient(1200px 800px at -10% 100%, rgba(245,216,126,.12), transparent 60%), #101216",
            minHeight: 560,
            padding: 28,
            position: "relative",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img src={logo} alt="RetainAI" style={{ width: 48, height: 48, borderRadius: 12, background: "#111" }} />
            <div style={{ fontSize: 28, fontWeight: 900, color: BG.gold }}>RetainAI</div>
          </div>
          <div style={{ marginTop: 10, color: BG.text80 }}>Start free — 14 days</div>
          <h1 style={{ marginTop: 10, fontSize: 24, fontWeight: 800, lineHeight: 1.3 }}>
            Set up your account. We’ll personalize RetainAI to your business.
          </h1>
          <ul style={{ marginTop: 16, color: BG.text80, fontSize: 14, lineHeight: 1.6 }}>
            <li>• WhatsApp + email in one inbox</li>
            <li>• Emotional-AI replies that sound like you</li>
            <li>• Smart follow-ups so fewer leads go cold</li>
            <li>• Guided onboarding (10 minutes)</li>
          </ul>
          <div style={{ position: "absolute", bottom: 28, left: 28, right: 28, fontSize: 12, color: BG.text60 }}>
            By continuing, you agree to our{" "}
            <a href="/terms-of-service" style={{ color: BG.goldDeep, textDecoration: "underline" }}>Terms</a>{" "}
            and{" "}
            <a href="/privacy-policy" style={{ color: BG.goldDeep, textDecoration: "underline" }}>Privacy Policy</a>.
          </div>
        </aside>

        {/* form card */}
        <main
          style={{
            borderRadius: 24,
            border: `1px solid ${BG.line}`,
            background: BG.card,
            padding: 28,
            minHeight: 560,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <form onSubmit={handleSignup} autoComplete="on" style={{ position: "relative", minHeight: 460 }}>
            <Progress step={step} total={SLIDES.length} />

            <div style={{ position: "relative", marginTop: 16, minHeight: 360 }}>
              {/* Email */}
              <Slide active={step === 0}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <label style={{ color: BG.text60, fontSize: 14 }}>What’s your email?</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => onEnter(e, nextStep)}
                    placeholder="you@business.com"
                    autoFocus
                    style={{ padding: "12px 14px", borderRadius: 12, border: `1px solid ${BG.line}`, background: "#0E1013", color: "#fff", fontSize: 16 }}
                  />
                  <button type="button" onClick={nextStep} disabled={!/^\S+@\S+\.\S+$/.test(email)} style={{ background: BG.gold, color: "#0B0B0C", fontWeight: 800, border: 0, borderRadius: 12, padding: "12px 0", fontSize: 16, opacity: /^\S+@\S+\.\S+$/.test(email) ? 1 : 0.7 }}>
                    Continue
                  </button>

                  <div style={{ display: "flex", alignItems: "center", gap: 10, color: BG.text60, fontWeight: 700, fontSize: 14, margin: "6px 0" }}>
                    <div style={{ flex: 1, borderBottom: `1px solid ${BG.line}` }} />
                    <span>or</span>
                    <div style={{ flex: 1, borderBottom: `1px solid ${BG.line}` }} />
                  </div>

                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={() => setError("Google Signup Failed")}
                    width="100%"
                    text="signup_with"
                    theme="filled_black"
                    shape="pill"
                  />
                  {googleProcessing && <div style={{ color: BG.gold, marginTop: 8 }}>Loading Google…</div>}
                </div>
              </Slide>

              {/* Password */}
              <Slide active={step === 1}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <label style={{ color: BG.text60, fontSize: 14 }}>Create a password</label>
                  <div style={{ position: "relative" }}>
                    <input
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => onEnter(e, nextStep)}
                      placeholder="Min 8 characters"
                      style={{ width: "100%", padding: "12px 14px", paddingRight: 54, borderRadius: 12, border: `1px solid ${BG.line}`, background: "#0E1013", color: "#fff", fontSize: 16 }}
                    />
                    <button type="button" onClick={() => setShowPw((v) => !v)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: BG.text60, background: "transparent", border: 0, cursor: "pointer" }}>
                      {showPw ? "Hide" : "Show"}
                    </button>
                  </div>
                  {/* strength */}
                  <div>
                    <div style={{ height: 4, borderRadius: 999, overflow: "hidden", background: "#0E1013", border: `1px solid ${BG.line}` }}>
                      <div style={{ width: `${(pwStrength / 4) * 100}%`, height: "100%", background: pwStrength >= 3 ? BG.gold : "#7a6c3a", transition: "width .2s" }} />
                    </div>
                    <div style={{ fontSize: 12, color: BG.text60, marginTop: 6 }}>
                      Use 8+ characters with a mix of letters, numbers, and symbols.
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button type="button" onClick={prevStep} style={{ padding: "12px 0", flex: 1, borderRadius: 12, border: `1px solid ${BG.line}`, background: "#101216", color: "#fff" }}>Back</button>
                    <button type="button" onClick={nextStep} disabled={password.length < 8} style={{ padding: "12px 0", flex: 1, borderRadius: 12, border: 0, fontWeight: 800, background: BG.gold, color: "#0B0B0C", opacity: password.length < 8 ? 0.7 : 1 }}>Continue</button>
                  </div>
                </div>
              </Slide>

              {/* Name */}
              <Slide active={step === 2}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <label style={{ color: BG.text60, fontSize: 14 }}>What’s your name?</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => onEnter(e, nextStep)} placeholder="Ariana Smith" style={{ padding: "12px 14px", borderRadius: 12, border: `1px solid ${BG.line}`, background: "#0E1013", color: "#fff", fontSize: 16 }} />
                  <div style={{ display: "flex", gap: 10 }}>
                    <button type="button" onClick={prevStep} style={{ padding: "12px 0", flex: 1, borderRadius: 12, border: `1px solid ${BG.line}`, background: "#101216", color: "#fff" }}>Back</button>
                    <button type="button" onClick={nextStep} disabled={!name.trim()} style={{ padding: "12px 0", flex: 1, borderRadius: 12, border: 0, fontWeight: 800, background: BG.gold, color: "#0B0B0C", opacity: name.trim() ? 1 : 0.7 }}>Continue</button>
                  </div>
                </div>
              </Slide>

              {/* Business name */}
              <Slide active={step === 3}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <label style={{ color: BG.text60, fontSize: 14 }}>Business name</label>
                  <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} onKeyDown={(e) => onEnter(e, nextStep)} placeholder="Juvjeli Nails" style={{ padding: "12px 14px", borderRadius: 12, border: `1px solid ${BG.line}`, background: "#0E1013", color: "#fff", fontSize: 16 }} />
                  <div style={{ display: "flex", gap: 10 }}>
                    <button type="button" onClick={prevStep} style={{ padding: "12px 0", flex: 1, borderRadius: 12, border: `1px solid ${BG.line}`, background: "#101216", color: "#fff" }}>Back</button>
                    <button type="button" onClick={nextStep} disabled={!businessName.trim()} style={{ padding: "12px 0", flex: 1, borderRadius: 12, border: 0, fontWeight: 800, background: BG.gold, color: "#0B0B0C", opacity: businessName.trim() ? 1 : 0.7 }}>Continue</button>
                  </div>
                </div>
              </Slide>

              {/* Business type */}
              <Slide active={step === 4}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <label style={{ color: BG.text60, fontSize: 14 }}>What type of business?</label>
                  <input value={businessType} onChange={(e) => setBusinessType(e.target.value)} onKeyDown={(e) => onEnter(e, nextStep)} placeholder="Nail salon, Barbershop, Agency…" style={{ padding: "12px 14px", borderRadius: 12, border: `1px solid ${BG.line}`, background: "#0E1013", color: "#fff", fontSize: 16 }} />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {["Salon", "Barbershop", "HVAC", "Real estate", "Coaching", "Agency"].map((t) => (
                      <Chip key={t} onClick={() => setBusinessType(t)} active={businessType === t}>{t}</Chip>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button type="button" onClick={prevStep} style={{ padding: "12px 0", flex: 1, borderRadius: 12, border: `1px solid ${BG.line}`, background: "#101216", color: "#fff" }}>Back</button>
                    <button type="button" onClick={nextStep} disabled={!businessType.trim()} style={{ padding: "12px 0", flex: 1, borderRadius: 12, border: 0, fontWeight: 800, background: BG.gold, color: "#0B0B0C", opacity: businessType.trim() ? 1 : 0.7 }}>Continue</button>
                  </div>
                </div>
              </Slide>

              {/* Location */}
              <Slide active={step === 5}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <label style={{ color: BG.text60, fontSize: 14 }}>Where do you operate?</label>
                  <input value={location} onChange={(e) => setLocation(e.target.value)} onKeyDown={(e) => onEnter(e, nextStep)} placeholder="City, Province/State" style={{ padding: "12px 14px", borderRadius: 12, border: `1px solid ${BG.line}`, background: "#0E1013", color: "#fff", fontSize: 16 }} />
                  <div style={{ display: "flex", gap: 10 }}>
                    <button type="button" onClick={prevStep} style={{ padding: "12px 0", flex: 1, borderRadius: 12, border: `1px solid ${BG.line}`, background: "#101216", color: "#fff" }}>Back</button>
                    <button type="button" onClick={nextStep} disabled={!location.trim()} style={{ padding: "12px 0", flex: 1, borderRadius: 12, border: 0, fontWeight: 800, background: BG.gold, color: "#0B0B0C", opacity: location.trim() ? 1 : 0.7 }}>Continue</button>
                  </div>
                </div>
              </Slide>

              {/* Team size */}
              <Slide active={step === 6}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <label style={{ color: BG.text60, fontSize: 14 }}>Team size</label>
                  <input type="number" min={1} value={teamSize} onChange={(e) => setTeamSize(e.target.value)} onKeyDown={(e) => onEnter(e, nextStep)} placeholder="1" style={{ padding: "12px 14px", borderRadius: 12, border: `1px solid ${BG.line}`, background: "#0E1013", color: "#fff", fontSize: 16 }} />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {[1, 2, 5, 10, 20].map((n) => <Chip key={n} onClick={() => setTeamSize(String(n))} active={String(teamSize) === String(n)}>{n}</Chip>)}
                    <Chip onClick={() => setTeamSize("50+")} active={teamSize === "50+"}>50+</Chip>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button type="button" onClick={prevStep} style={{ padding: "12px 0", flex: 1, borderRadius: 12, border: `1px solid ${BG.line}`, background: "#101216", color: "#fff" }}>Back</button>
                    <button type="button" onClick={nextStep} disabled={!String(teamSize).trim()} style={{ padding: "12px 0", flex: 1, borderRadius: 12, border: 0, fontWeight: 800, background: BG.gold, color: "#0B0B0C", opacity: String(teamSize).trim() ? 1 : 0.7 }}>Continue</button>
                  </div>
                </div>
              </Slide>

              {/* Avatar */}
              <Slide active={step === 7}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                  <div style={{ color: BG.text60, fontSize: 14 }}>Add a logo or profile photo (optional)</div>
                  <label style={{ cursor: "pointer", textAlign: "center" }}>
                    <img src={avatar || defaultAvatar} alt="Profile" style={{ width: 90, height: 90, objectFit: "cover", borderRadius: "50%", border: `3px solid ${BG.gold}` }} />
                    <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleAvatarUpload} />
                    <div style={{ marginTop: 6, fontWeight: 600, color: BG.goldDeep }}>Upload image</div>
                  </label>
                  <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                    <button type="button" onClick={prevStep} style={{ padding: "12px 18px", borderRadius: 12, border: `1px solid ${BG.line}`, background: "#101216", color: "#fff" }}>Back</button>
                    <button type="button" onClick={nextStep} style={{ padding: "12px 18px", borderRadius: 12, border: 0, fontWeight: 800, background: BG.gold, color: "#0B0B0C" }}>Continue</button>
                  </div>
                </div>
              </Slide>

              {/* Extras + submit */}
              <Slide active={step === 8}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <label style={{ color: BG.text60, fontSize: 14 }}>Final details (optional)</label>
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" style={{ padding: "12px 14px", borderRadius: 12, border: `1px solid ${BG.line}`, background: "#0E1013", color: "#fff", fontSize: 16 }} />
                  <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Website" style={{ padding: "12px 14px", borderRadius: 12, border: `1px solid ${BG.line}`, background: "#0E1013", color: "#fff", fontSize: 16 }} />
                  <input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="Instagram" style={{ padding: "12px 14px", borderRadius: 12, border: `1px solid ${BG.line}`, background: "#0E1013", color: "#fff", fontSize: 16 }} />
                  <input value={referral} onChange={(e) => setReferral(e.target.value)} placeholder="How did you hear about us?" style={{ padding: "12px 14px", borderRadius: 12, border: `1px solid ${BG.line}`, background: "#0E1013", color: "#fff", fontSize: 16 }} />

                  <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 14 }}>
                    <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 3, accentColor: BG.gold }} />
                    <span style={{ color: BG.text60 }}>
                      I agree to the <a href="/terms-of-service" style={{ color: BG.goldDeep, textDecoration: "underline" }}>Terms</a> and{" "}
                      <a href="/privacy-policy" style={{ color: BG.goldDeep, textDecoration: "underline" }}>Privacy Policy</a>.
                    </span>
                  </label>

                  <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                    <button type="button" onClick={prevStep} style={{ padding: "12px 0", flex: 1, borderRadius: 12, border: `1px solid ${BG.line}`, background: "#101216", color: "#fff" }}>Back</button>
                    <button type="submit" style={{ padding: "12px 0", flex: 1, borderRadius: 12, border: 0, fontWeight: 800, background: BG.gold, color: "#0B0B0C" }}>
                      Create account
                    </button>
                  </div>

                  {error && (
                    <div style={{ marginTop: 10, fontSize: 14, background: "#1a1306", border: "1px solid #6b4e00", color: BG.gold, borderRadius: 10, padding: "8px 10px" }}>
                      {error}
                    </div>
                  )}
                </div>
              </Slide>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}
