import React from 'react';

function Footer() {
  return (
    <footer className="bg-black text-gold text-center py-4 mt-8">
      <p className="text-sm">© {new Date().getFullYear()} RetainAI. All rights reserved.</p>
    </footer>
  );
}

export default Footer;
