// src/components/CheckoutButton.jsx
import React, { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { STRIPE_PK } from "../config";

// Resolve publishable key (prefer config, then env). Avoid hardcoding in source.
const PUBLISHABLE_KEY =
  STRIPE_PK ||
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_STRIPE_PK) ||
  (typeof process !== "undefined" &&
    process.env &&
    process.env.REACT_APP_STRIPE_PK) ||
  "";

const stripePromise = loadStripe(PUBLISHABLE_KEY);

export default function CheckoutButton({
  priceId,
  mode = "subscription", // "subscription" | "payment"
  quantity = 1,
  customerEmail, // optional: prefill email
  clientReferenceId, // optional: your internal id
  successPath = "/login?success=true",
  cancelPath = "/",
  className = "",
  children,
  onError,
}) {
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    if (!priceId) {
      const msg = "Missing priceId for Checkout.";
      onError ? onError(new Error(msg)) : alert(msg);
      return;
    }
    if (!PUBLISHABLE_KEY) {
      const msg = "Stripe publishable key is not configured.";
      onError ? onError(new Error(msg)) : alert(msg);
      return;
    }

    try {
      setLoading(true);
      const stripe = await stripePromise;
      if (!stripe) {
        throw new Error("Stripe.js failed to load.");
      }

      const { error } = await stripe.redirectToCheckout({
        lineItems: [{ price: priceId, quantity }],
        mode, // "subscription" or "payment"
        successUrl: window.location.origin + successPath,
        cancelUrl: window.location.origin + cancelPath,
        ...(customerEmail ? { customerEmail } : {}),
        ...(clientReferenceId ? { clientReferenceId } : {}),
        billingAddressCollection: "auto",
        // allowPromotionCodes: true, // uncomment if desired
      });

      if (error) {
        onError ? onError(error) : alert(error.message);
      }
    } catch (err) {
      onError ? onError(err) : alert(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleCheckout}
      disabled={loading}
      className={
        "bg-yellow-400 text-black px-6 py-3 rounded-xl font-bold shadow-lg " +
        "hover:bg-yellow-300 transition block text-center disabled:opacity-60 " +
        className
      }
    >
      {loading ? "Redirecting…" : children || "Start Free Trial"}
    </button>
  );
}
