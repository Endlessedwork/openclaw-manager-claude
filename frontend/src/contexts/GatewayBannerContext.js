import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { getGatewayStatus, restartGateway } from '../lib/api';
import { toast } from 'sonner';

const GatewayBannerContext = createContext(null);

const STORAGE_KEY = 'openclaw-restart-needed';

export function GatewayBannerProvider({ children }) {
  const [restartNeeded, setRestartNeeded] = useState(
    () => sessionStorage.getItem(STORAGE_KEY) === 'true'
  );
  const [dismissed, setDismissed] = useState(false);
  const [restarting, setRestarting] = useState(false);

  // Check backend on mount
  useEffect(() => {
    getGatewayStatus()
      .then(res => {
        const needed = res.data.restart_needed;
        setRestartNeeded(needed);
        sessionStorage.setItem(STORAGE_KEY, String(needed));
        if (!needed) setDismissed(false);
      })
      .catch(() => {});
  }, []);

  const markRestartNeeded = useCallback(() => {
    setRestartNeeded(true);
    setDismissed(false);
    sessionStorage.setItem(STORAGE_KEY, 'true');
  }, []);

  const handleRestart = useCallback(async () => {
    setRestarting(true);
    try {
      await restartGateway();
      setRestartNeeded(false);
      setDismissed(false);
      sessionStorage.setItem(STORAGE_KEY, 'false');
      toast.success('Gateway restart initiated');
    } catch {
      toast.error('Failed to restart gateway');
    } finally {
      setRestarting(false);
    }
  }, []);

  const dismissBanner = useCallback(() => {
    setDismissed(true);
  }, []);

  return (
    <GatewayBannerContext.Provider value={{
      restartNeeded,
      dismissed,
      restarting,
      markRestartNeeded,
      handleRestart,
      dismissBanner,
    }}>
      {children}
    </GatewayBannerContext.Provider>
  );
}

export function useGatewayBanner() {
  const ctx = useContext(GatewayBannerContext);
  if (!ctx) throw new Error('useGatewayBanner must be used within GatewayBannerProvider');
  return ctx;
}
