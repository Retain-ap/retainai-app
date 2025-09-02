// src/components/UserContext.jsx
import React, {
  createContext,
  useState,
  useEffect,
  useCallback,
  useContext,
} from "react";

// 1) Create context
const UserContext = createContext({
  user: null,
  refreshUser: () => Promise.resolve(),
});

// 2) Provider
export function UserProvider({ children }) {
  const [user, setUser] = useState(null);

  // Adjust to however you store the logged-in email:
  const getCurrentEmail = () => localStorage.getItem("userEmail");

  const fetchUser = useCallback(async () => {
    const email = getCurrentEmail();
    if (!email) {
      setUser(null);
      return;
    }
    try {
      const res = await fetch(`/api/user/${encodeURIComponent(email)}`);
      if (!res.ok) throw new Error("Failed to load user");
      const data = await res.json();
      setUser(data);
    } catch (err) {
      console.error("User fetch error:", err);
      setUser(null);
    }
  }, []);

  // On mount and whenever refreshUser is called
  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return (
    <UserContext.Provider value={{ user, refreshUser: fetchUser }}>
      {children}
    </UserContext.Provider>
  );
}

// 3) Hook
export function useUser() {
  return useContext(UserContext);
}
