import React from "react";
import { GoogleOAuthProvider } from "@react-oauth/google";

// Use your actual Google OAuth client ID here:
const CLIENT_ID = "1034823318205-jlf8k3bi5pt81i51mpovl3o1f6vdqjof.apps.googleusercontent.com";

export default function GoogleAuthWrapper({ children }) {
  return (
    <GoogleOAuthProvider clientId={CLIENT_ID}>
      {children}
    </GoogleOAuthProvider>
  );
}
