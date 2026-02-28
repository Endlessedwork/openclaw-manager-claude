import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import api from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const tokenRef = useRef(null);
  const refreshPromiseRef = useRef(null);

  // Keep tokenRef in sync
  useEffect(() => { tokenRef.current = token; }, [token]);

  // Deduplicated refresh: all concurrent 401s share a single refresh call
  const doRefresh = useCallback(async () => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;
    refreshPromiseRef.current = api.post('/auth/refresh', {}, { withCredentials: true })
      .then(res => {
        const newToken = res.data.access_token;
        tokenRef.current = newToken;
        setToken(newToken);
        setUser(res.data.user);
        return newToken;
      })
      .finally(() => { refreshPromiseRef.current = null; });
    return refreshPromiseRef.current;
  }, []);

  // Set up interceptors once (no token dependency)
  useEffect(() => {
    const requestInterceptor = api.interceptors.request.use((config) => {
      if (tokenRef.current) {
        config.headers.Authorization = `Bearer ${tokenRef.current}`;
      }
      return config;
    });

    const responseInterceptor = api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        const isAuthEndpoint = originalRequest.url?.includes('/auth/');
        if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
          originalRequest._retry = true;
          try {
            const newToken = await doRefresh();
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return api(originalRequest);
          } catch {
            setToken(null);
            setUser(null);
            tokenRef.current = null;
            return Promise.reject(error);
          }
        }
        return Promise.reject(error);
      }
    );

    return () => {
      api.interceptors.request.eject(requestInterceptor);
      api.interceptors.response.eject(responseInterceptor);
    };
  }, [doRefresh]);

  // Initial refresh on mount
  useEffect(() => {
    doRefresh().catch(() => {}).finally(() => setLoading(false));
  }, [doRefresh]);

  const login = useCallback(async (username, password) => {
    const res = await api.post('/auth/login', { username, password }, { withCredentials: true });
    tokenRef.current = res.data.access_token;
    setToken(res.data.access_token);
    setUser(res.data.user);
    return res.data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout', {}, { withCredentials: true });
    } catch {}
    tokenRef.current = null;
    setToken(null);
    setUser(null);
  }, []);

  const hasRole = useCallback((...roles) => {
    return user && roles.includes(user.role);
  }, [user]);

  const canEdit = useCallback(() => {
    return user && (user.role === 'superadmin' || user.role === 'admin' || user.role === 'manager');
  }, [user]);

  const isAdmin = useCallback(() => {
    return user && user.role === 'superadmin';
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, hasRole, canEdit, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
