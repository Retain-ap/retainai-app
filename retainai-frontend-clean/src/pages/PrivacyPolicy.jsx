// src/pages/PrivacyPolicy.jsx
import React from "react";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[#181a1b] text-gray-100">
      <div className="max-w-3xl mx-auto pt-16 pb-20 px-4">
        <h1 className="text-3xl md:text-4xl font-bold text-yellow-400 mb-7">Privacy Policy</h1>

        <p className="text-sm text-gray-400 mb-8">
          Last updated: {new Date().toLocaleDateString()}
        </p>

        <p className="mb-6">
          This Privacy Policy explains how RetainAI (“we”, “us”, “our”) collects, uses, and safeguards
          your information when you use our website and services (the “Service”). By using RetainAI,
          you agree to the practices described below.
        </p>

        <h2 className="text-2xl font-bold text-yellow-300 mt-8 mb-2">1. Information We Collect</h2>
        <ul className="list-disc ml-6 mb-6 space-y-2">
          <li><b>Account & Profile Data:</b> name, email, password (hashed), business details (e.g., business name, logo).</li>
          <li><b>Lead & Customer Data:</b> names, emails, phone numbers, tags/notes you add, message history, and appointment info.</li>
          <li><b>Usage Data:</b> app interactions, device/browser info, IP address, and diagnostic logs to improve performance.</li>
          <li><b>Cookies & Similar Tech:</b> essential cookies for authentication and session management; optional analytics (if enabled).</li>
        </ul>

        <h2 className="text-2xl font-bold text-yellow-300 mt-8 mb-2">2. How We Use Information</h2>
        <ul className="list-disc ml-6 mb-6 space-y-2">
          <li>Provide and maintain the Service (e.g., login, messaging, automations, appointments).</li>
          <li>Improve features, performance, and user experience.</li>
          <li>Communicate with you about updates, security alerts, and support.</li>
          <li>Process payments and invoicing if you subscribe.</li>
          <li>Comply with legal obligations and enforce our terms.</li>
        </ul>

        <h2 className="text-2xl font-bold text-yellow-300 mt-8 mb-2">3. Legal Basis (EEA/UK)</h2>
        <p className="mb-6">
          Where applicable, we process data under legitimate interests (operating and improving the Service),
          contract necessity (providing subscribed features), and consent (e.g., marketing where required).
        </p>

        <h2 className="text-2xl font-bold text-yellow-300 mt-8 mb-2">4. Sharing & Processors</h2>
        <p className="mb-3">
          We do not sell your personal data. We may share data with trusted service providers who process it on our behalf:
        </p>
        <ul className="list-disc ml-6 mb-6 space-y-2">
          <li><b>Payments:</b> Stripe (subscription billing, invoices).</li>
          <li><b>Email:</b> SendGrid (transactional and notification emails).</li>
          <li><b>Calendars:</b> Google Calendar (optional user-connected feature).</li>
          <li><b>Messaging:</b> Meta/WhatsApp Cloud API (optional messaging feature).</li>
          <li><b>Infrastructure/Analytics:</b> hosting, error logging, usage analytics (if enabled).</li>
        </ul>
        <p className="mb-6">
          We require processors to protect data and use it only as instructed by us.
          We may disclose information if required by law or to protect rights, safety, and security.
        </p>

        <h2 className="text-2xl font-bold text-yellow-300 mt-8 mb-2">5. Data Retention</h2>
        <p className="mb-6">
          We retain personal data for as long as your account is active or as needed to provide the Service.
          We may retain certain information for legal, accounting, or security purposes after account closure.
        </p>

        <h2 className="text-2xl font-bold text-yellow-300 mt-8 mb-2">6. Security</h2>
        <p className="mb-6">
          We use administrative, technical, and organizational measures to protect your information. No method of transmission
          or storage is 100% secure, but we continuously improve our safeguards.
        </p>

        <h2 className="text-2xl font-bold text-yellow-300 mt-8 mb-2">7. Your Choices & Rights</h2>
        <ul className="list-disc ml-6 mb-6 space-y-2">
          <li>Access, correct, or delete profile data from your account settings or by contacting support.</li>
          <li>Unsubscribe from marketing communications (where applicable) using provided links.</li>
          <li>EEA/UK residents may have additional rights (e.g., objection, restriction, portability).</li>
        </ul>

        <h2 className="text-2xl font-bold text-yellow-300 mt-8 mb-2">8. International Transfers</h2>
        <p className="mb-6">
          If we transfer data internationally, we use appropriate safeguards (e.g., SCCs) to protect your information.
        </p>

        <h2 className="text-2xl font-bold text-yellow-300 mt-8 mb-2">9. Children’s Privacy</h2>
        <p className="mb-6">
          RetainAI is not directed to children under 13 (or minimum age in your region). We do not knowingly collect data from children.
        </p>

        <h2 className="text-2xl font-bold text-yellow-300 mt-8 mb-2">10. Changes to this Policy</h2>
        <p className="mb-6">
          We may update this policy from time to time. We’ll notify you of material changes by email or in-app notices.
        </p>

        <h2 className="text-2xl font-bold text-yellow-300 mt-8 mb-2">11. Contact</h2>
        <p className="mb-6">
          Questions or requests? Email{" "}
          <a href="mailto:owner@retainai.ca" className="text-yellow-300 underline">owner@retainai.ca</a>.
        </p>

        <p className="text-xs text-gray-500">
          This Privacy Policy is provided for general informational purposes and does not constitute legal advice.
        </p>
      </div>
    </div>
  );
}
