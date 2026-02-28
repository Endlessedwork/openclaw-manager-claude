import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { getAppSettings } from '../lib/api';

const DEFAULTS = {
  app_name: 'W.I.N.E',
  app_subtitle: 'Operation Control',
  app_version: '3.0',
};

const AppConfigContext = createContext(null);

export function AppConfigProvider({ children }) {
  const [config, setConfig] = useState(DEFAULTS);

  const refreshConfig = useCallback(async () => {
    try {
      const res = await getAppSettings();
      setConfig({ ...DEFAULTS, ...res.data });
    } catch {
      // keep defaults on failure
    }
  }, []);

  useEffect(() => {
    refreshConfig();
  }, [refreshConfig]);

  // Update document title when config changes
  useEffect(() => {
    document.title = `${config.app_name} ${config.app_subtitle}`;
  }, [config.app_name, config.app_subtitle]);

  return (
    <AppConfigContext.Provider value={{ config, refreshConfig }}>
      {children}
    </AppConfigContext.Provider>
  );
}

export function useAppConfig() {
  const ctx = useContext(AppConfigContext);
  if (!ctx) throw new Error('useAppConfig must be used within AppConfigProvider');
  return ctx;
}
