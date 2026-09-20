import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { auth, setTokens, clearTokens, getAccessToken } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    if (!getAccessToken()) {
      setLoading(false);
      return;
    }
    try {
      const data = await auth.me();
      setUser(data.user);
      setProfile(data.profile);
    } catch {
      clearTokens();
      setUser(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const login = useCallback(async (creds) => {
    const data = await auth.login(creds);
    setTokens(data.access_token, data.refresh_token);
    setUser(data.user);
    const me = await auth.me();
    setProfile(me.profile);
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const data = await auth.register(payload);
    setTokens(data.access_token, data.refresh_token);
    setUser(data.user);
    const me = await auth.me();
    setProfile(me.profile);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await auth.logout();
    } catch {
      /* token may already be invalid */
    }
    clearTokens();
    setUser(null);
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    const me = await auth.me();
    setProfile(me.profile);
    setUser(me.user);
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, register, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
