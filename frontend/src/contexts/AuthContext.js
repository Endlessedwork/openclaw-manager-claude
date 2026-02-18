import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import api from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const requestInterceptor = api.interceptors.request.use((config) => {
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    const responseInterceptor = api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          try {
            const res = await api.post('/auth/refresh', {}, { withCredentials: true });
            const newToken = res.data.access_token;
            setToken(newToken);
            setUser(res.data.user);
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return api(originalRequest);
          } catch {
            setToken(null);
            setUser(null);
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
  }, [token]);

  useEffect(() => {
    const tryRefresh = async () => {
      try {
        const res = await api.post('/auth/refresh', {}, { withCredentials: true });
        setToken(res.data.access_token);
        setUser(res.data.user);
      } catch {
        // No valid refresh token
      } finally {
        setLoading(false);
      }
    };
    tryRefresh();
  }, []);

  const login = useCallback(async (username, password) => {
    const res = await api.post('/auth/login', { username, password }, { withCredentials: true });
    setToken(res.data.access_token);
    setUser(res.data.user);
    return res.data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout', {}, { withCredentials: true });
    } catch {}
    setToken(null);
    setUser(null);
  }, []);

  const hasRole = useCallback((...roles) => {
    return user && roles.includes(user.role);
  }, [user]);

  const canEdit = useCallback(() => {
    return user && (user.role === 'admin' || user.role === 'editor');
  }, [user]);

  const isAdmin = useCallback(() => {
    return user && user.role === 'admin';
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
