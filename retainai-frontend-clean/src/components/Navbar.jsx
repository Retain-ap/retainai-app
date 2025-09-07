// src/components/Navbar.jsx
import React from "react";
import logoFallback from "../assets/logo.png"; // if your logo is in /public, remove this import and pass logoSrc="/retainai-logo.png"

const GOLD = "#F5D87E";

function Navbar({
  brand = "RetainAI",
  subtitle = "Welcome to your dashboard!",
  logoSrc,              // optional; falls back to bundled asset, then to /retainai-logo.png
  href = "/",           // where the brand link goes
  children,             // optional right-side content; overrides subtitle if provided
  className = "",
}) {
  const resolvedLogo =
    logoSrc || (logoFallback || "/retainai-logo.png");

  const onImgError = (e) => {
    // 1) try fallback asset; 2) hide image if that fails too
    if (logoFallback && e.currentTarget.src !== logoFallback) {
      e.currentTarget.src = logoFallback;
    } else if (e.currentTarget.src !== "/retainai-logo.png") {
      e.currentTarget.src = "/retainai-logo.png";
    } else {
      e.currentTarget.style.display = "none";
    }
  };

  return (
    <nav
      aria-label="Primary"
      className={[
        "sticky top-0 z-40 bg-black/90 backdrop-blur supports-[backdrop-filter]:bg-black/60",
        "text-white shadow-md",
        className,
      ].join(" ")}
      data-testid="navbar"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex justify-between items-center">
        <a
          href={href}
          className="flex items-center gap-3 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-400 rounded"
        >
          <img
            src={resolvedLogo}
            onError={onImgError}
            alt={`${brand} logo`}
            className="h-9 w-auto select-none"
            fetchPriority="high"
            decoding="async"
          />
          <span className="text-xl sm:text-2xl font-extrabold" style={{ color: GOLD }}>
            {brand}
          </span>
        </a>

        {children ? (
          <div className="flex items-center">{children}</div>
        ) : subtitle ? (
          <div className="text-xs sm:text-sm text-neutral-300 truncate max-w-[60%]" title={subtitle}>
            {subtitle}
          </div>
        ) : null}
      </div>
    </nav>
  );
}

export default React.memo(Navbar);
