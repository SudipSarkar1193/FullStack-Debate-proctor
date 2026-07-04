import React, { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";
import type { User } from "@/types"; // Import User type from centralized types file

// 💡 Define the context type
interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (userData: User) => void;
  logout: () => void;
}

// 🧠 Create the context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 🪄 Custom hook to use AuthContext
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};

// 🏠 Props type for AuthProvider
interface AuthProviderProps {
  children: ReactNode;
}

// 🧩 AuthProvider component
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for user in localStorage on initial load
    try {
      const savedUser = localStorage.getItem("debateUser");
      if (savedUser) {
        setUser(JSON.parse(savedUser));
      }
    } catch (error) {
      console.error("Failed to parse user from localStorage", error);
      localStorage.removeItem("debateUser");
    } finally {
      setLoading(false);
    }
  }, []);

  const login = (userData: User) => {
    // Omit password before saving to state and localStorage for security
    const { password, ...userToStore } = userData;
    setUser(userToStore);
    localStorage.setItem("debateUser", JSON.stringify(userToStore));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("debateUser");
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
