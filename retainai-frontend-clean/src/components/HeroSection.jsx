// src/components/HeroSection.jsx
import React from "react";

const GOLD = "#f7cb53";
const BG = "#181a1b";
const TEXT = "#e9edef";

export default function HeroSection() {
  return (
    <section
      aria-label="RetainAI: automate DMs and book more appointments"
      className="min-h-[70vh] flex items-center justify-center px-6 py-16"
      style={{
        // layered gradient + image for reliable contrast
        backgroundImage:
          `linear-gradient(0deg, rgba(24,26,27,.88), rgba(24,26,27,.82)), url('/retainai-bg.png')`,
        backgroundColor: BG,
        backgroundBlendMode: "overlay",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="w-full max-w-5xl mx-auto text-center">
        <img
          src="/retainai-logo.png"
          alt="RetainAI logo"
          className="mx-auto mb-6 h-24 w-auto"
          loading="eager"
          decoding="async"
        />

        <h1
          className="font-extrabold leading-tight tracking-tight mb-4"
          style={{ color: TEXT, fontSize: "clamp(2.25rem, 4vw, 3.5rem)" }}
        >
          RetainAI
        </h1>

        <p
          className="mx-auto mb-8"
          style={{
            color: "#cfd5db",
            maxWidth: 880,
            fontSize: "clamp(1.05rem, 2.2vw, 1.375rem)",
            lineHeight: 1.5,
            fontWeight: 600,
          }}
        >
          Automate Instagram DMs, capture leads, and book more appointments — all with AI.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
          <a
            href="/login"
            className="px-6 py-3 rounded-xl font-bold shadow-lg hover:opacity-95 transition"
            style={{ background: GOLD, color: "#111" }}
          >
            Start Free Trial
          </a>
          <a
            href="#how-it-works"
            className="px-6 py-3 rounded-xl font-bold border transition"
            style={{
              borderColor: GOLD,
              color: GOLD,
              background: "transparent",
            }}
          >
            See How It Works
          </a>
        </div>

        {/* tiny trust row */}
        <div
          className="mt-6 text-sm"
          style={{ color: "#9aa3ab", fontWeight: 700 }}
        >
          No credit card required · Cancel anytime
        </div>
      </div>
    </section>
  );
}
