import React from 'react';

function HeroSection() {
  return (
    <section
      className="bg-cover bg-center text-gold min-h-[70vh] flex flex-col justify-center items-center px-4"
      style={{
        backgroundImage: "url('/retainai-bg.png')",
        backgroundColor: '#0f0f0fbf',
        backgroundBlendMode: 'overlay',
      }}
    >
      <img src="/retainai-logo.png" alt="RetainAI Logo" className="h-24 mb-4" />
      <h1 className="text-4xl md:text-6xl font-bold mb-4 text-center">
        RetainAI
      </h1>
      <p className="text-lg md:text-2xl text-center max-w-2xl">
        Automate Instagram DMs, capture leads, and book more appointments — all with AI.
      </p>
    </section>
  );
}

export default HeroSection;