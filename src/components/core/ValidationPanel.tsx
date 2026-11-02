/**
 * Inline validation panel — shows errors and warnings from validate().
 * Displayed as a collapsible section beneath the top bar in App.tsx.
 */

import { AlertCircle, AlertTriangle, X } from "lucide-react";
import type { ValidationIssue } from "../../types";

interface Props {
  issues: ValidationIssue[];
  onClose: () => void;
}

export default function ValidationPanel({ issues, onClose }: Props) {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  return (
    <div className="border-b border-th-border bg-th-surface px-4 py-2">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-2xs font-semibold text-th-fg-2">
            Validation
            {errors.length > 0 && (
              <span className="ml-1.5 rounded bg-red-100 px-1 py-0.5 text-red-700 dark:bg-red-900/50 dark:text-red-300">
                {errors.length} error{errors.length > 1 ? "s" : ""}
              </span>
            )}
            {warnings.length > 0 && (
              <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                {warnings.length} warning{warnings.length > 1 ? "s" : ""}
              </span>
            )}
            {issues.length === 0 && (
              <span className="ml-1.5 text-emerald-600 dark:text-emerald-400">All clear</span>
            )}
          </span>
          <button
            onClick={onClose}
            className="rounded p-0.5 text-th-fg-4 hover:text-th-fg"
            title="Close validation panel"
          >
            <X size={13} />
          </button>
        </div>

        {issues.length > 0 && (
          <ul className="space-y-0.5">
            {issues.map((issue, i) => (
              <li key={i} className="flex items-start gap-1.5">
                {issue.severity === "error" ? (
                  <AlertCircle size={12} className="mt-0.5 flex-shrink-0 text-red-600 dark:text-red-400" />
                ) : (
                  <AlertTriangle size={12} className="mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                )}
                <span
                  className={`text-2xs ${
                    issue.severity === "error" ? "text-red-700 dark:text-red-300" : "text-amber-800 dark:text-amber-300"
                  }`}
                >
                  <span className="font-medium capitalize">{issue.entityType}</span>
                  {" — "}
                  {issue.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
