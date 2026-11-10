// context/AuthContext.jsx

import React, { createContext, useContext, useState, useEffect } from "react";
import { unsubscribePushOnLogout } from "../services/pushNotifications";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  // On page load, check localStorage for existing token
  useEffect(() => {
    const savedToken = localStorage.getItem("token");
    const savedUser = localStorage.getItem("user");

    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }
  }, []);

  // 🔑 LOGIN — Save token + user to localStorage
  const login = (userData) => {
    // Save token to localStorage
    if (userData.token) {
      localStorage.setItem("token", userData.token);
      setToken(userData.token);
    }

    // Save user info to localStorage
    localStorage.setItem("user", JSON.stringify(userData));
    setUser(userData);
  };

  // 🔑 LOGOUT — Remove everything
  const logout = () => {
    unsubscribePushOnLogout(); // this browser stops getting this user's pushes
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
  };

  // Check if user is logged in
  const isAuthenticated = !!token;

  return (
    <AuthContext.Provider
      value={{ user, token, login, logout, isAuthenticated }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);