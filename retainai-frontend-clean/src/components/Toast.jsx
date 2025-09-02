// =============================================
// File: src/components/Toast.jsx
// Tiny toast for feedback
// =============================================

import React, { useEffect } from "react";

export default function Toast({ message, onClose, duration = 2500 }) {
  useEffect(() => {
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [onClose, duration]);
  if (!message) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-[#262626] text-white border border-[#3a3a3a] rounded-xl px-4 py-3 shadow">
        {message}
      </div>
    </div>
  );
}
