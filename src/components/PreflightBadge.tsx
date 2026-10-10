import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, ShieldCheck, Info } from 'lucide-react';
import { PreflightStatus, PreflightReport } from '../types';

interface PreflightBadgeProps {
  status: PreflightStatus;
  size?: 'sm' | 'md';
}

export const PreflightBadge: React.FC<PreflightBadgeProps> = ({ status, size = 'md' }) => {
  if (status === 'PASS') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 font-medium rounded-md bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 text-emerald-700 dark:text-emerald-300 ${
          size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
        }`}
      >
        <CheckCircle2 className={size === 'sm' ? 'w-3 h-3 text-emerald-600 dark:text-emerald-400' : 'w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400'} />
        <span>Passed</span>
      </span>
    );
  }

  if (status === 'INFO') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 font-medium rounded-md bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/25 text-sky-800 dark:text-sky-300 ${
          size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
        }`}
      >
        <Info className={size === 'sm' ? 'w-3 h-3 text-sky-600 dark:text-sky-400' : 'w-3.5 h-3.5 text-sky-600 dark:text-sky-400'} />
        <span>Notice</span>
      </span>
    );
  }

  if (status === 'WARNING') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 font-medium rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 text-amber-800 dark:text-amber-300 ${
          size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
        }`}
      >
        <AlertTriangle className={size === 'sm' ? 'w-3 h-3 text-amber-600 dark:text-amber-400' : 'w-3.5 h-3.5 text-amber-600 dark:text-amber-400'} />
        <span>Warning</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-md bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 text-rose-700 dark:text-rose-400 ${
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
      }`}
    >
      <XCircle className={size === 'sm' ? 'w-3 h-3 text-rose-600 dark:text-rose-400' : 'w-3.5 h-3.5 text-rose-600 dark:text-rose-400'} />
      <span>Action Required</span>
    </span>
  );
};

export const PreflightReportView: React.FC<{ report: PreflightReport }> = ({ report }) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between bg-jexi-elevated border border-jexi-subtle px-3.5 py-2.5 rounded-xl">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span className="text-xs font-semibold text-jexi-primary">Deterministic Safety Checks</span>
        </div>
        <PreflightBadge status={report.overallStatus} />
      </div>

      <div className="space-y-1.5">
        {report.checks.map((check) => {
          const isPass = check.status === 'PASS';
          const isInfo = check.status === 'INFO';
          const isWarn = check.status === 'WARNING';
          return (
            <div
              key={check.id}
              className={`p-3 rounded-xl border text-left transition-colors ${
                isPass
                  ? 'bg-jexi-surface border-jexi-subtle text-jexi-secondary'
                  : isInfo
                  ? 'bg-sky-50/70 dark:bg-sky-950/20 border-sky-200 dark:border-sky-800/40 text-sky-900 dark:text-sky-200'
                  : isWarn
                  ? 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40 text-amber-900 dark:text-amber-200'
                  : 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/40 text-rose-900 dark:text-rose-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  {isPass ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  ) : isInfo ? (
                    <Info className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                  ) : isWarn ? (
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <h5 className="text-xs font-semibold text-jexi-primary">{check.title}</h5>
                    <p className="text-[11px] text-jexi-muted mt-0.5 leading-relaxed">{check.description}</p>
                    {check.details && (
                      <p className="text-[10px] font-mono mt-1.5 text-jexi-secondary bg-jexi-elevated px-2 py-1 rounded border border-jexi-subtle break-all">
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

