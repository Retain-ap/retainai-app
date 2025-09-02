// src/components/LandingPage.jsx
import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";

/**
 * Booking link (Calendly popup + fallback)
 * Add to public/index.html (in <head>):
 * <link href="https://assets.calendly.com/assets/external/widget.css" rel="stylesheet">
 * <script src="https://assets.calendly.com/assets/external/widget.js" async></script>
 */
const BOOKING_URL =
  "https://calendly.com/mateozufic1/retainai-setup-10-minutes?hide_gdpr_banner=1&primary_color=D6B25E";

// ---------- THEME ----------
const BG = {
  page: "#0B0C0E",
  card: "#15171B",
  line: "#24262B",
  gold: "#F5D87E",
  goldDeep: "#D7BB66",
  text60: "rgba(255,255,255,.60)",
  text80: "rgba(255,255,255,.80)",
};

// ---------- ASSETS ----------
const brandLogos = [
  "https://upload.wikimedia.org/wikipedia/commons/2/2f/Google_2015_logo.svg",
  "https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg",
  "https://upload.wikimedia.org/wikipedia/commons/5/51/IBM_logo.svg",
];
const DEMO_SRC = "/crm-demo.mp4"; // put your mp4 at public/crm-demo.mp4

// ---------- MONDAY-STYLE TIP BAR ----------
function TipBar() {
  const [open, setOpen] = useState(false);
  return (
    <div className="w-full border-b" style={{ background: "#0C0D10", borderColor: BG.line }}>
      <div className="max-w-7xl mx-auto px-6 py-2 flex items-center gap-3 text-sm">
        <span
          className="px-2 py-[2px] rounded-full text-[11px] font-semibold"
          style={{ background: "#121417", border: `1px solid ${BG.line}`, color: BG.goldDeep }}
        >
          Tip
        </span>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-left flex-1 hover:opacity-90"
          style={{ color: BG.text80 }}
          aria-expanded={open}
        >
          Use “AI Draft” first, then personalize. It converts better than sending raw templates.
        </button>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-xs px-2 py-1 rounded-lg border"
          style={{ borderColor: BG.line, color: BG.text60 }}
        >
          {open ? "Hide" : "Details"}
        </button>
      </div>
      {open && (
        <div className="max-w-7xl mx-auto px-6 pb-3 text-sm" style={{ color: BG.text60 }}>
          AI drafts use your lead’s tags, last message and tone. Edit the opener to sound like you, then send via
          WhatsApp. Average reply time drops ~40% from week one.
        </div>
      )}
    </div>
  );
}

// ---------- MINI HERO CARDS ----------
function KpiCard() {
  return (
    <div className="rounded-2xl p-4 border shadow-xl" style={{ background: BG.card, borderColor: BG.line }}>
      <div className="text-xs" style={{ color: BG.text60 }}>Follow-ups complete</div>
      <div className="flex items-end gap-2 mt-1">
        <div className="text-3xl font-extrabold">55%</div>
        <div className="text-xs" style={{ color: BG.text60 }}>this week</div>
      </div>
      <div className="mt-3 h-2 rounded-full overflow-hidden bg-[#0f1113] border" style={{ borderColor: BG.line }}>
        <div className="h-full" style={{ width: "55%", background: BG.gold }} />
      </div>
    </div>
  );
}
function ChatCard() {
  return (
    <div className="rounded-2xl p-4 border shadow-xl" style={{ background: BG.card, borderColor: BG.line }}>
      <div className="text-xs mb-2" style={{ color: BG.text60 }}>New Reply • WhatsApp</div>
      <div className="rounded-xl p-3 text-sm" style={{ background: "#0E1013", border: `1px solid ${BG.line}` }}>
        “Sounds good — can we book Thursday at 3pm?”
      </div>
      <div className="flex gap-2 mt-3">
        <span className="px-2 py-1 text-[11px] rounded-lg" style={{ background: "#0E1013", border: `1px solid ${BG.line}`, color: BG.text60 }}>Lead</span>
        <span className="px-2 py-1 text-[11px] rounded-lg" style={{ background: "#0E1013", border: `1px solid ${BG.line}`, color: BG.text60 }}>AI draft ready</span>
      </div>
    </div>
  );
}
function SparklineCard() {
  return (
    <div className="rounded-2xl p-4 border shadow-xl" style={{ background: BG.card, borderColor: BG.line }}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Work Summary</div>
        <div className="text-[11px]" style={{ color: BG.text60 }}>Last 6 months</div>
      </div>
      <div className="mt-4 h-24 rounded-lg relative overflow-hidden" style={{ background: "#0E1013", border: `1px solid ${BG.line}` }}>
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(245,216,126,.18), rgba(245,216,126,0) 60%), radial-gradient(120% 120% at 0% 100%, rgba(255,255,255,.05), transparent 60%)",
          }}
        />
        <svg viewBox="0 0 300 100" className="absolute inset-0">
          <path
            d="M0 80 C40 30, 80 60, 120 42 C160 25, 200 70, 240 50 C270 38, 300 60, 300 60"
            fill="none" stroke={BG.gold} strokeWidth="2.5" strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}

// ---------- ROI MINI CALCULATOR ----------
function ROINumbers({ leadsPerWeek, closeRate }) {
  const base = useMemo(
    () => Math.max(0, (Number(leadsPerWeek) || 0) * ((Number(closeRate) || 0) / 100) * 4),
    [leadsPerWeek, closeRate]
  );
  const uplift = 0.2;
  const withRetain = base * (1 + uplift);
  return (
    <div className="mt-4 text-sm" style={{ color: BG.text80 }}>
      <div>Est. bookings/month now: <b>{base.toFixed(1)}</b></div>
      <div>With RetainAI (+20%): <b style={{ color: BG.gold }}>{withRetain.toFixed(1)}</b></div>
      <div className="text-xs mt-1" style={{ color: BG.text60 }}>
        Assumes smarter follow-ups (no-response ↓ ~31%) and more human replies (reply time ↓ ~42%).
      </div>
    </div>
  );
}

// ---------- SMALL BADGE ----------
function Badge({ children }) {
  return (
    <span className="px-3 py-1 rounded-full text-sm" style={{ background: "#0E1013", border: `1px solid ${BG.line}` }}>
      {children}
    </span>
  );
}

// ---------- MAIN ----------
export default function LandingPage() {
  const [leadsPerWeek, setLeadsPerWeek] = useState(20);
  const [closeRate, setCloseRate] = useState(20);
  const [videoError, setVideoError] = useState(false);

  const fadeUp = {
    hidden: { opacity: 0, y: 24 },
    visible: (i = 1) => ({ opacity: 1, y: 0, transition: { delay: 0.08 * i } }),
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: BG.page, color: "#fff" }}>
      {/* BACKGROUND GLOWS */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-40 -right-32 w-[900px] h-[900px] blur-[140px] opacity-20 rounded-full" style={{ background: BG.gold }} />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[70vw] h-[70vh] blur-[120px] opacity-[.10] rounded-full" style={{ background: `linear-gradient(90deg, ${BG.gold}, transparent)` }} />
      </div>

      {/* NAVBAR */}
      <nav className="sticky top-0 z-40 w-full" style={{ background: "#0C0D10", borderBottom: `1px solid ${BG.line}` }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-3">
          <span className="font-extrabold text-2xl tracking-tight" style={{ color: BG.gold }}>RetainAI</span>
          <div className="hidden md:flex gap-7 text-sm font-medium">
            <a href="#features" className="hover:opacity-80 scroll-mt-24">Features</a>
            <a href="#how" className="hover:opacity-80 scroll-mt-24">How it works</a>
            <a href="#pricing" className="hover:opacity-80 scroll-mt-24">Pricing</a>
            <a href="#faq" className="hover:opacity-80 scroll-mt-24">FAQ</a>
          </div>
          <div className="flex gap-3">
            <a href="/login" className="border px-4 py-2 rounded-xl font-semibold hover:opacity-85" style={{ borderColor: BG.line, background: "#101216", color: BG.gold }}>Login</a>
            <a href="/signup" className="px-4 py-2 rounded-xl font-bold" style={{ background: BG.gold, color: "#0B0B0C" }}>
              Start Free Trial
            </a>
          </div>
        </div>
      </nav>

      {/* TIP BAR */}
      <TipBar />

      {/* HERO */}
      <section className="relative w-full z-10 isolate" style={{ borderBottom: `1px solid ${BG.line}` }}>
        <div className="max-w-7xl mx-auto px-6 pt-20 md:pt-28 pb-16 md:pb-20 grid md:grid-cols-2 gap-12 lg:gap-16">
          {/* LEFT COPY */}
          <div className="min-w-[320px]">
            <div className="text-sm mb-3 font-semibold uppercase tracking-widest" style={{ color: BG.goldDeep }}>
              Emotional-AI CRM
            </div>
            <motion.h1
              className="text-5xl md:text-6xl font-extrabold leading-tight tracking-tight"
              style={{ color: "#ffffff" }}
              initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}
            >
              The CRM that keeps clients coming back.
            </motion.h1>
            <motion.p
              className="text-xl md:text-2xl mt-6 font-medium max-w-xl"
              style={{ color: BG.text80 }}
              initial="hidden" whileInView="visible" viewport={{ once: true }} custom={2} variants={fadeUp}
            >
              <b>WhatsApp + AI replies that sound human</b> — so more leads say yes.
            </motion.p>

            {/* Trust bullets */}
            <motion.ul
              className="mt-4 text-sm grid grid-cols-1 sm:grid-cols-3 gap-2 max-w-xl"
              initial="hidden" whileInView="visible" viewport={{ once: true }} custom={2.5} variants={fadeUp}
              style={{ color: BG.text60 }}
            >
              <li>✓ Setup in &lt; 10 minutes</li>
              <li>✓ Cancel anytime</li>
              <li>✓ Guided onboarding</li>
            </motion.ul>

            <motion.div className="flex flex-wrap items-center gap-3 mt-8"
              initial="hidden" whileInView="visible" viewport={{ once: true }} custom={3} variants={fadeUp}>
              <a href="/signup" className="px-6 py-3 rounded-xl font-extrabold" style={{ background: BG.gold, color: "#0B0B0C" }}>
                Start 14-Day Trial
              </a>
              <a href="#pricing" className="px-5 py-3 rounded-xl font-semibold border hover:opacity-85"
                 style={{ borderColor: BG.line, background: "#101216", color: "#fff" }}>
                See Pricing
              </a>
              <span className="text-sm" style={{ color: BG.text60 }}>
                $30/mo — <span className="font-semibold" style={{ color: BG.gold }}>Launch $20/mo</span>
              </span>
            </motion.div>

            <div className="flex flex-wrap items-center gap-8 mt-8 opacity-70 hover:opacity-100 transition">
              {brandLogos.map((logo, i) => (
                <img key={i} src={logo} alt="Brand Logo" className="h-7 w-auto grayscale invert" />
              ))}
            </div>
          </div>

          {/* RIGHT VISUALS */}
          <div className="relative w-full">
            <div className="relative mx-auto max-w-md h-[520px] pointer-events-none" aria-hidden>
              <motion.div className="absolute left-4 right-4 top-0 rotate-[-5deg] z-30"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                <KpiCard />
              </motion.div>
              <motion.div className="absolute left-2 right-6 top-[170px] rotate-[5deg] z-20"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                <SparklineCard />
              </motion.div>
              <motion.div className="absolute left-6 right-2 bottom-0 z-10"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
                <ChatCard />
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* OUTCOME STRIP */}
      <section className="border-t" style={{ borderColor: BG.line }}>
        <div className="max-w-7xl mx-auto px-6 py-10 md:py-14 grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            ["Avg reply time", "↓ 42%"],
            ["No-response leads", "↓ 31%"],
            ["Customer rating (NPS)", "4.7 / 5"],
          ].map(([label, stat]) => (
            <div key={label} className="rounded-2xl p-7 border" style={{ background: BG.card, borderColor: BG.line }}>
              <div className="text-sm mb-2" style={{ color: BG.text60 }}>{label}</div>
              <div className="text-3xl font-extrabold" style={{ color: BG.gold }}>{stat}</div>
            </div>
          ))}
        </div>
      </section>

      {/* PERSONAS */}
      <section id="features" className="border-t" style={{ borderColor: BG.line }}>
        <div className="max-w-7xl mx-auto px-6 py-20 md:py-24">
          <div className="text-center">
            <div className="uppercase tracking-widest text-xs font-semibold mb-2" style={{ color: BG.text60 }}>
              Who it’s for
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold" style={{ color: BG.gold }}>
              Everything you need to retain clients
            </h2>
            <p className="text-sm mt-2" style={{ color: BG.text60 }}>
              Built for solo founders & local businesses that live in WhatsApp.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mt-10">
            {[
              ["Salon", "Rebook 2–3 extra clients/week."],
              ["Coaching", "Shorter time-to-yes with warm prompts."],
              ["Home services", "Fewer missed jobs. Faster follow-ups."],
              ["Real estate", "Human replies that drive showings."],
            ].map(([title, desc]) => (
              <div key={title} className="rounded-2xl p-7 border" style={{ background: BG.card, borderColor: BG.line }}>
                <div className="text-lg font-semibold">{title}</div>
                <div className="text-sm mt-1" style={{ color: BG.text80 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AUTOMATIONS */}
      <section className="border-t" style={{ borderColor: BG.line }}>
        <div className="max-w-7xl mx-auto px-6 py-20 md:py-24">
          <div className="text-center">
            <div className="uppercase tracking-widest text-xs font-semibold mb-2" style={{ color: BG.text60 }}>
              Automations
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold" style={{ color: BG.gold }}>
              Triggers and actions you can mix & match
            </h2>
            <p className="text-sm mt-2" style={{ color: BG.text60 }}>
              No-reply 24h → Send WhatsApp template → If no response, remind tomorrow.
            </p>
          </div>
          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="rounded-2xl p-7 border" style={{ background: BG.card, borderColor: BG.line }}>
              <div className="font-semibold mb-2">Triggers</div>
              <div className="flex flex-wrap gap-2">
                {["No reply 24h", "New lead", "Missed appointment", "Tag added"].map((t) => (
                  <span key={t} className="px-3 py-1 rounded-full text-sm" style={{ background: "#0E1013", border: `1px solid ${BG.line}` }}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-2xl p-7 border" style={{ background: BG.card, borderColor: BG.line }}>
              <div className="font-semibold mb-2">Actions</div>
              <div className="flex flex-wrap gap-2">
                {["WhatsApp template", "Reminder", "Schedule link", "Assign tag", "Email follow-up"].map((a) => (
                  <span key={a} className="px-3 py-1 rounded-full text-sm" style={{ background: "#0E1013", border: `1px solid ${BG.line}` }}>
                    {a}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* LIVE DEMO */}
      <section id="how" className="border-t" style={{ borderColor: BG.line }}>
        <div className="max-w-7xl mx-auto px-6 py-20 md:py-24">
          <div className="text-center">
            <div className="uppercase tracking-widest text-xs font-semibold mb-2" style={{ color: BG.text60 }}>
              See it in action
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold" style={{ color: BG.gold }}>
              Tag → AI Draft → Send → Auto follow-up
            </h2>
          </div>
          <div className="mt-8">
            {!videoError ? (
              <video
                className="w-full rounded-2xl border shadow-lg"
                style={{ borderColor: BG.line, background: "#0E1013" }}
                src={DEMO_SRC}
                controls
                onError={() => setVideoError(true)}
              />
            ) : (
              <div className="rounded-2xl p-10 border text-center" style={{ background: BG.card, borderColor: BG.line }}>
                <div className="text-lg font-semibold mb-2">Demo coming soon</div>
                <div className="text-sm" style={{ color: BG.text60 }}>
                  Drop your file at <code>public/crm-demo.mp4</code> to show it here.
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* INTEGRATIONS + PRIVACY */}
      <section className="border-t" style={{ borderColor: BG.line }}>
        <div className="max-w-7xl mx-auto px-6 py-20 md:py-24 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="rounded-2xl p-7 border" style={{ background: BG.card, borderColor: BG.line }}>
            <div className="uppercase tracking-widest text-xs font-semibold mb-2" style={{ color: BG.text60 }}>
              Integrations
            </div>
            <div className="text-sm mb-4" style={{ color: BG.text80 }}>Connect in &lt; 2 min.</div>
            <div className="flex items-center gap-4">
              <Badge>WhatsApp</Badge>
              <Badge>Gmail</Badge>
              <Badge>Google Calendar</Badge>
            </div>
          </div>
          <div className="rounded-2xl p-7 border md:col-span-2" style={{ background: BG.card, borderColor: BG.line }}>
            <div className="uppercase tracking-widest text-xs font-semibold mb-2" style={{ color: BG.text60 }}>
              Privacy & compliance
            </div>
            <div className="text-sm" style={{ color: BG.text80 }}>
              Your data stays in your account. PIPEDA-aware. WhatsApp Cloud API compliant.{" "}
              <a href="/privacy-policy" className="underline" style={{ color: BG.goldDeep }}>Read the policy</a>.
            </div>
          </div>
        </div>
      </section>

      {/* COMPARISON GRID */}
      <section className="border-t" style={{ borderColor: BG.line }}>
        <div className="max-w-7xl mx-auto px-6 py-20 md:py-24">
          <div className="text-center">
            <div className="uppercase tracking-widest text-xs font-semibold mb-2" style={{ color: BG.text60 }}>
              Why RetainAI
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold" style={{ color: BG.gold }}>
              Built for human conversations, not just databases
            </h2>
          </div>
          <div className="mt-8 overflow-x-auto">
            <table className="w-full text-sm border" style={{ borderColor: BG.line }}>
              <thead style={{ background: "#101216" }}>
                <tr>
                  <th className="text-left p-3 border-r" style={{ borderColor: BG.line }}></th>
                  <th className="text-left p-3 border-r" style={{ borderColor: BG.line }}>RetainAI</th>
                  <th className="text-left p-3" style={{ borderColor: BG.line }}>Big CRMs</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Emotional AI replies", "✓ Native & tone-aware", "Add-ons or none"],
                  ["Native WhatsApp", "✓ Built-in", "Often missing"],
                  ["Follow-up brain", "✓ Smart timings", "Manual or basic"],
                  ["Setup time", "Under 10 min", "Hours to days"],
                  ["Price", "$20–$30/mo", "$49+/mo"],
                ].map(([row, ours, theirs]) => (
                  <tr key={row} className="border-t" style={{ borderColor: BG.line }}>
                    <td className="p-3 font-medium">{row}</td>
                    <td className="p-3" style={{ color: BG.gold }}>{ours}</td>
                    <td className="p-3" style={{ color: BG.text80 }}>{theirs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="relative z-[30] isolate border-t" style={{ borderColor: BG.line }}>
        <div className="max-w-5xl mx-auto px-6 py-20 md:py-24 text-center">
          <div className="uppercase tracking-widest text-xs font-semibold mb-2" style={{ color: BG.text60 }}>
            Simple pricing
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold" style={{ color: BG.gold }}>Choose your plan</h2>
          <p className="text-sm mt-2" style={{ color: BG.text60 }}>
            14-day free trial • Cancel anytime • Keep your data if you cancel.
          </p>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Standard */}
            <div className="rounded-2xl p-7 border text-left flex flex-col gap-5" style={{ background: BG.card, borderColor: BG.line }}>
              <div>
                <div className="text-sm mb-2" style={{ color: BG.text60 }}>Standard</div>
                <div className="flex items-end gap-2">
                  <div className="text-4xl font-extrabold">$30</div>
                  <div className="mb-1 text-sm" style={{ color: BG.text60 }}>/mo</div>
                </div>
              </div>
              <ul className="space-y-2 text-sm" style={{ color: BG.text80 }}>
                <li>• Emotional-AI prompts</li>
                <li>• WhatsApp + email inbox</li>
                <li>• Automated follow-ups</li>
                <li>• Lead tagging & notes</li>
              </ul>
              <div className="pt-1">
                <a href="/signup" className="block w-full px-4 py-3 rounded-xl text-center font-bold border"
                   style={{ background: "#101216", borderColor: BG.line, color: "#fff" }}>
                  Start 14-Day Trial
                </a>
              </div>
              <div className="text-xs" style={{ color: BG.text60 }}>Credit card required. Cancel anytime.</div>
            </div>

            {/* Launch */}
            <div className="rounded-2xl p-7 border text-left relative overflow-hidden flex flex-col gap-5"
                 style={{ background: BG.card, borderColor: BG.line }}>
              <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full blur-2xl opacity-25" style={{ background: BG.gold }} />
              <div>
                <div className="text-sm mb-2" style={{ color: BG.text60 }}>Grand Opening</div>
                <div className="flex items-end gap-3">
                  <div className="text-4xl font-extrabold" style={{ color: BG.gold }}>$20</div>
                  <div className="mb-1 text-sm" style={{ color: BG.text60 }}>/mo</div>
                  <div className="line-through text-sm opacity-70">$30</div>
                </div>
              </div>
              <ul className="space-y-2 text-sm" style={{ color: BG.text80 }}>
                <li>• Everything in Standard</li>
                <li>• Live chat support</li>
                <li>• Early access features</li>
              </ul>
              <div className="pt-1">
                <a href="/signup" className="inline-block px-4 py-3 rounded-xl font-extrabold"
                   style={{ background: BG.gold, color: "#0B0B0C" }}>
                  Claim $20/mo
                </a>
              </div>
              <div className="text-xs" style={{ color: BG.text60 }}>Limited-time launch offer.</div>
            </div>
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF + ROI + SETUP CALL */}
      <section className="border-t" style={{ borderColor: BG.line }}>
        <div className="max-w-7xl mx-auto px-6 py-20 md:py-24 grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Testimonials */}
          <div className="lg:col-span-2">
            <div className="uppercase tracking-widest text-xs font-semibold mb-2" style={{ color: BG.text60 }}>
              Results from users
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                ["Ariana, Salon", "“Booked 7 extra appointments first week.”"],
                ["Marco, HVAC", "“No-reply leads finally came back.”"],
                ["Jade, Coach", "“Replies feel like me. More yes’s.”"],
              ].map(([name, quote]) => (
                <div key={name} className="p-6 rounded-2xl border" style={{ background: BG.card, borderColor: BG.line }}>
                  <div className="font-semibold mb-1">{name}</div>
                  <div className="text-sm" style={{ color: BG.text80 }}>{quote}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ROI + Book call */}
          <div>
            <div className="uppercase tracking-widest text-xs font-semibold mb-2" style={{ color: BG.text60 }}>
              ROI mini-calculator
            </div>
            <div className="p-6 rounded-2xl border" style={{ background: BG.card, borderColor: BG.line }}>
              <label className="text-sm" style={{ color: BG.text80 }}>Leads per week</label>
              <input
                type="number"
                value={leadsPerWeek}
                onChange={(e) => setLeadsPerWeek(e.target.value)}
                className="w-full mt-1 mb-3 px-3 py-2 rounded-lg bg-[#0E1013] border"
                style={{ borderColor: BG.line, color: "#fff" }}
              />
              <label className="text-sm" style={{ color: BG.text80 }}>Close rate (%)</label>
              <input
                type="number"
                value={closeRate}
                onChange={(e) => setCloseRate(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-[#0E1013] border"
                style={{ borderColor: BG.line, color: "#fff" }}
              />
              <ROINumbers leadsPerWeek={leadsPerWeek} closeRate={closeRate} />
              <a href="/signup" className="mt-4 inline-block px-4 py-3 rounded-xl font-bold"
                 style={{ background: BG.gold, color: "#0B0B0C" }}>
                See it with your leads → Start free
              </a>
            </div>

            <div className="mt-4 p-6 rounded-2xl border" style={{ background: BG.card, borderColor: BG.line }}>
              <div className="font-semibold mb-1">Guided setup</div>
              <div className="text-sm mb-3" style={{ color: BG.text80 }}>
                We’ll get you running in under 10 minutes.
              </div>
              <button
                onClick={() => {
                  if (window.Calendly) {
                    window.Calendly.initPopupWidget({ url: BOOKING_URL });
                  } else {
                    window.open(BOOKING_URL, "_blank", "noopener,noreferrer");
                  }
                }}
                className="inline-block px-4 py-2 rounded-xl border"
                style={{ borderColor: BG.line, color: "#fff", background: "#101216" }}
              >
                Book a 10-min setup call
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t" style={{ borderColor: BG.line }}>
        <div className="max-w-7xl mx-auto px-6 py-20 md:py-24">
          <div className="text-center">
            <div className="uppercase tracking-widest text-xs font-semibold mb-2" style={{ color: BG.text60 }}>
              Answered quickly
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold" style={{ color: BG.gold }}>FAQ</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
            {[
              ["Do I need a WhatsApp business number?", "You can start with a regular number; business number recommended for scale."],
              ["Will AI sound like me?", "Yes. It uses your notes & tags, and you can edit the tone presets."],
              ["Can I import leads later?", "Yes — CSV import and form integrations are supported."],
              ["Is my data private?", "Your data stays in your account. PIPEDA-aware and WhatsApp Cloud API compliant."],
            ].map(([q, a]) => (
              <div key={q} className="rounded-2xl p-7 border" style={{ background: BG.card, borderColor: BG.line }}>
                <div className="font-bold mb-2" style={{ color: BG.goldDeep }}>{q}</div>
                <div className="text-sm" style={{ color: BG.text80 }}>{a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t" style={{ borderColor: BG.line, background: "#0A0B0D" }}>
        <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ background: BG.gold }} />
            <span className="font-black text-xl" style={{ color: BG.gold }}>RetainAI</span>
          </div>
          <div className="flex gap-4 text-sm" style={{ color: BG.text60 }}>
            <a href="/privacy-policy" className="hover:opacity-80">Privacy Policy</a>
            <a href="/terms-of-service" className="hover:opacity-80">Terms of Service</a>
            <a href="mailto:owner@retainai.ca" className="hover:opacity-80">Contact</a>
          </div>
        </div>
        <div className="border-t text-center text-xs py-4" style={{ borderColor: BG.line, color: BG.text60 }}>
          © {new Date().getFullYear()} RetainAI. All rights reserved.
        </div>
      </footer>

      {/* STICKY MOBILE CTA */}
      <div className="md:hidden fixed bottom-3 left-3 right-3 z-50">
        <div className="rounded-2xl shadow-lg flex items-center justify-between px-4 py-3"
             style={{ background: BG.card, border: `1px solid ${BG.line}` }}>
          <span className="text-sm" style={{ color: BG.text80 }}>Start free — 14 days</span>
          <a href="/signup" className="px-4 py-2 rounded-xl font-bold" style={{ background: BG.gold, color: "#0B0B0C" }}>
            Start
          </a>
        </div>
      </div>
    </div>
  );
}
