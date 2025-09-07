// src/components/Footer.jsx
import React from "react";

/* RetainAI theme */
const BG = "#181a1b";
const TEXT = "#e9edef";
const GOLD = "#f7cb53";
const BORDER = "#2a2a2a";

export default function Footer({
  businessName = "RetainAI",
  links = [], // e.g. [{ label: "Privacy", href: "/privacy" }, { label: "Terms", href: "/terms" }]
  version,    // e.g. "1.0.3"
}) {
  const year = new Date().getFullYear();

  return (
    <footer
      style={{
        background: BG,
        borderTop: `1px solid ${BORDER}`,
        padding: "14px 20px",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <p
          style={{
            margin: 0,
            color: TEXT,
            fontWeight: 800,
            letterSpacing: "-0.2px",
          }}
        >
          © {year} {businessName}. All rights reserved{version ? ` • v${version}` : ""}.
        </p>

        {Array.isArray(links) && links.length > 0 && (
          <nav
            aria-label="Footer"
            style={{ display: "flex", gap: 14, flexWrap: "wrap" }}
          >
            {links.map((link) => (
              <a
                key={(link.href || link.label) + String(link.label)}
                href={link.href}
                style={{
                  color: GOLD,
                  fontWeight: 800,
                  textDecoration: "none",
                  borderBottom: `2px solid transparent`,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderBottomColor = GOLD)}
                onMouseLeave={(e) => (e.currentTarget.style.borderBottomColor = "transparent")}
              >
                {link.label}
              </a>
            ))}
          </nav>
        )}
      </div>
    </footer>
  );
}
