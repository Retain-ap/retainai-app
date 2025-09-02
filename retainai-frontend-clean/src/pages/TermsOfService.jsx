// src/pages/TermsOfService.jsx
import React from "react";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-[#181a1b] text-gray-100">
      <div className="max-w-3xl mx-auto pt-16 pb-20 px-4">
        <h1 className="text-3xl md:text-4xl font-bold text-yellow-400 mb-7">Terms of Service</h1>

        <p className="text-sm text-gray-400 mb-8">
          Last updated: {new Date().toLocaleDateString()}
        </p>

        <h2 className="text-2xl font-bold text-yellow-300 mt-8 mb-2">1. Acceptance of Terms</h2>
        <p className="mb-6">
          By using RetainAI, you agree to these Terms of Service and our{" "}
          <a href="/privacy-policy" className="text-yellow-300 underline">Privacy Policy</a>.
        </p>

        <h2 className="text-2xl font-bold text-yellow-300 mt-8 mb-2">2. Use of Service</h2>
        <ul className="list-disc ml-6 mb-6 space-y-2">
          <li>You must provide accurate registration information.</li>
          <li>You are responsible for all activity on your account.</li>
          <li>Do not use RetainAI for unlawful, abusive, or harmful purposes.</li>
        </ul>

        <h2 className="text-2xl font-bold text-yellow-300 mt-8 mb-2">3. Payment & Subscription</h2>
        <ul className="list-disc ml-6 mb-6 space-y-2">
          <li>RetainAI is billed monthly. Grand Opening promo: $20/mo (limited time). Regular price: $30/mo.</li>
          <li>A 14-day free trial is available; credit card required to start the trial.</li>
          <li>Cancel anytime from your dashboard; cancellations take effect at the end of the current billing cycle.</li>
        </ul>

        <h2 className="text-2xl font-bold text-yellow-300 mt-8 mb-2">4. Data & Privacy</h2>
        <p className="mb-6">
          We handle your data according to our{" "}
          <a href="/privacy-policy" className="text-yellow-300 underline">Privacy Policy</a>.
        </p>

        <h2 className="text-2xl font-bold text-yellow-300 mt-8 mb-2">5. Service Availability</h2>
        <ul className="list-disc ml-6 mb-6 space-y-2">
          <li>We strive for high uptime but service may be interrupted for maintenance or unforeseen events.</li>
          <li>RetainAI is not liable for losses resulting from service interruptions.</li>
        </ul>

        <h2 className="text-2xl font-bold text-yellow-300 mt-8 mb-2">6. Account Termination</h2>
        <ul className="list-disc ml-6 mb-6 space-y-2">
          <li>We may suspend or terminate accounts that violate these terms or abuse the service.</li>
        </ul>

        <h2 className="text-2xl font-bold text-yellow-300 mt-8 mb-2">7. Updates to Terms</h2>
        <p className="mb-6">
          These Terms may be updated periodically. We will notify users of significant changes via email or in-app notices.
        </p>

        <div className="mt-12 text-gray-400 text-sm pb-10">
          Questions? Email{" "}
          <a href="mailto:owner@retainai.ca" className="text-yellow-300 underline">
            owner@retainai.ca
          </a>
        </div>
      </div>
    </div>
  );
}
