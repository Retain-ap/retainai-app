import React from 'react';

function Navbar() {
  return (
    <nav className="bg-black text-gold p-4 flex justify-between items-center shadow-md">
      <div className="flex items-center space-x-3">
        <img src="/retainai-logo.png" alt="RetainAI Logo" className="h-10" />
        <span className="text-2xl font-bold">RetainAI</span>
      </div>
      <div className="text-sm">
        Welcome to your dashboard!
      </div>
    </nav>
  );
}

export default Navbar;