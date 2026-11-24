import type { ReactElement } from 'react';
import { factoryErrorDetail } from './lib/read-failure';

/**
 * Said above values kept from an earlier read when the latest read failed (the cache keeps
 * them), so a failed refresh never passes for fresh data. Nothing when there is no error.
 */
export function StaleRead({ error }: { error: Error | undefined }): ReactElement | null {
  if (error === undefined) return null;
  return (
    <p role="status" className="text-console-12 text-warning">
      Could not refresh: {factoryErrorDetail(error)}. Showing the last values read.
    </p>
  );
}
