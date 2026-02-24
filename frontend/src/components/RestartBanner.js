import React from 'react';
import { AlertTriangle, RotateCcw, X, Loader2 } from 'lucide-react';
import { useGatewayBanner } from '../contexts/GatewayBannerContext';
import { useAuth } from '../contexts/AuthContext';

export default function RestartBanner() {
  const { restartNeeded, dismissed, restarting, handleRestart, dismissBanner } = useGatewayBanner();
  const { isAdmin } = useAuth();

  if (!restartNeeded || dismissed) return null;

  return (
    <div
      data-testid="restart-banner"
      className="mx-8 mt-4 mb-0 flex items-center gap-3 px-4 py-3 rounded-lg border border-amber-500/30 bg-amber-500/5"
    >
      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-semibold text-amber-500" style={{ fontFamily: 'Manrope, sans-serif' }}>
          Gateway restart needed
        </span>
        <span className="text-xs text-theme-faint ml-2">
          Configuration has changed. Restart the gateway to apply.
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {isAdmin() && (
          <button
            data-testid="restart-now-btn"
            onClick={handleRestart}
            disabled={restarting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:opacity-50"
          >
            {restarting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RotateCcw className="w-3.5 h-3.5" />
            )}
            {restarting ? 'Restarting...' : 'Restart Now'}
          </button>
        )}
        <button
          data-testid="dismiss-banner-btn"
          onClick={dismissBanner}
          className="p-1 text-theme-dimmed hover:text-theme-muted transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
