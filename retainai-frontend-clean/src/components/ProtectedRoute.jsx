// src/components/ProtectedRoute.jsx
import React from "react";
import { Navigate } from "react-router-dom";

const ProtectedRoute = ({ children }) => {
  let user = null;
  try {
    user = JSON.parse(localStorage.getItem("user"));
  } catch {
    user = null;
  }
  // Optionally require certain fields, e.g., user.email
  if (!user || !user.email) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

export default ProtectedRoute;
