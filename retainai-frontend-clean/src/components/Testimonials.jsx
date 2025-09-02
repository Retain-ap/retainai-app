// src/components/Testimonials.jsx
import React from "react";

export default function Testimonials() {
  return (
    <section className="text-white py-16 bg-[#101012] border-t border-[#232323] px-4">
      <h2 className="text-3xl font-bold text-center text-yellow-400 mb-10">What Our Users Say</h2>
      <div className="max-w-4xl mx-auto grid gap-6 md:grid-cols-2">
        <div className="bg-[#161618] p-6 rounded-2xl shadow border border-[#232323]">
          <p className="italic text-gray-200">
            "RetainAI helped us book 3× more clients in 2 weeks. It’s like having a full-time assistant working DMs."
          </p>
          <p className="mt-4 text-sm text-yellow-300">— Jasmine, Lash Tech</p>
        </div>
        <div className="bg-[#161618] p-6 rounded-2xl shadow border border-[#232323]">
          <p className="italic text-gray-200">
            "Our inbox used to be chaos. Now we get leads organized, scheduled, and followed up automatically."
          </p>
          <p className="mt-4 text-sm text-yellow-300">— Tyler, Barber Shop Owner</p>
        </div>
      </div>
    </section>
  );
}
