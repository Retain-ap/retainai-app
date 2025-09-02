// src/components/CheckoutButton.jsx
import React from "react";
import { loadStripe } from "@stripe/stripe-js";

// ⬇️ Use your live publishable key
const stripePromise = loadStripe("pk_test_51KnWUNLKkR3ZKFQyx6IG7ZlxbQGT9UkY5ICqXpAb8apUQ8g0vFvW83dxZiQ1jtMKmY5i4dDaAZjartn8iywJxC3I00f9qE2kD8"); // <--- replace with your real live key

export default function CheckoutButton({ priceId, children }) {
  const handleCheckout = async () => {
    const stripe = await stripePromise;
    const { error } = await stripe.redirectToCheckout({
      lineItems: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      successUrl: window.location.origin + "/login?success=true",
      cancelUrl: window.location.origin + "/",
    });
    if (error) alert(error.message);
  };

  return (
    <button
      className="bg-yellow-400 text-black px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-yellow-300 transition block text-center"
      onClick={handleCheckout}
    >
      {children || "Start Free Trial"}
    </button>
  );
}
