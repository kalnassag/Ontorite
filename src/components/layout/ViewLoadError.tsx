/**
 * Inline fallback when a view fails to render. A failed lazy import gets a
 * specific hint: in development it almost always means new dependencies
 * haven't been installed; after a deployment, the page is running stale code.
 */

import { AlertTriangle } from "lucide-react";

export default function ViewLoadError({ error }: { error: Error }) {
  const chunkFailed = /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(error.message);
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-lg space-y-2 rounded border border-th-border bg-th-surface p-4 text-xs">
        <div className="flex items-center gap-2 font-medium text-th-fg">
          <AlertTriangle size={14} className="text-amber-500" />
          {chunkFailed ? "This view's code couldn't be loaded." : "This view hit an error."}
        </div>
        {chunkFailed ? (
          <ul className="list-disc space-y-1 pl-5 text-th-fg-3">
            <li>
              Running from source? New dependencies may be missing — run <code className="font-mono text-th-fg-2">npm install</code> and
              restart the dev server (<code className="font-mono text-th-fg-2">npx vite --force</code> if it was running during the install).
            </li>
            <li>Using a deployed copy? It was probably updated since this page loaded — reload.</li>
          </ul>
        ) : (
          <pre className="overflow-auto font-mono text-2xs text-red-400">{error.message}</pre>
        )}
        <div className="flex items-center gap-2 pt-1">
          <button onClick={() => window.location.reload()} className="rounded bg-blue-600 px-3 py-1 font-medium text-white hover:bg-blue-500">
            Reload
          </button>
          <span className="text-2xs text-th-fg-4">Your ontologies are saved and other views keep working.</span>
        </div>
      </div>
    </div>
  );
}
