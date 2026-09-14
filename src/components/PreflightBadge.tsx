import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, ShieldAlert } from 'lucide-react';
import { PreflightStatus, PreflightReport } from '../types';

interface PreflightBadgeProps {
  status: PreflightStatus;
  size?: 'sm' | 'md';
}

export const PreflightBadge: React.FC<PreflightBadgeProps> = ({ status, size = 'md' }) => {
  if (status === 'PASS') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 font-bold uppercase tracking-wider rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 ${
          size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
        }`}
      >
        <CheckCircle2 className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        PASS
      </span>
    );
  }

  if (status === 'WARNING') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 font-bold uppercase tracking-wider rounded-md bg-amber-500/15 border border-amber-500/40 text-amber-400 ${
          size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
        }`}
      >
        <AlertTriangle className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        WARNING
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-bold uppercase tracking-wider rounded-md bg-rose-500/15 border border-rose-500/40 text-rose-400 ${
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
      }`}
    >
      <XCircle className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      BLOCKED
    </span>
  );
};

export const PreflightReportView: React.FC<{ report: PreflightReport }> = ({ report }) => {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between bg-zinc-900/90 border border-zinc-800 p-3 rounded-lg">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-zinc-400" />
          <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wide">Preflight Security Checks</span>
        </div>
        <PreflightBadge status={report.overallStatus} />
      </div>

      <div className="space-y-2">
        {report.checks.map((check) => {
          const isPass = check.status === 'PASS';
          const isWarn = check.status === 'WARNING';
          return (
            <div
              key={check.id}
              className={`p-3 rounded-lg border text-left transition-colors ${
                isPass
                  ? 'bg-zinc-900/40 border-zinc-800/80 text-zinc-300'
                  : isWarn
                  ? 'bg-amber-950/20 border-amber-800/40 text-amber-200'
                  : 'bg-rose-950/20 border-rose-800/40 text-rose-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  {isPass ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : isWarn ? (
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <h5 className="text-xs font-medium text-zinc-100">{check.title}</h5>
                    <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">{check.description}</p>
                    {check.details && (
                      <p className="text-[10px] font-mono mt-1 text-zinc-300 bg-zinc-950/60 px-2 py-1 rounded border border-zinc-800/80 break-all">
                        {check.details}
                      </p>
                    )}
                  </div>
                </div>
                <PreflightBadge status={check.status} size="sm" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
