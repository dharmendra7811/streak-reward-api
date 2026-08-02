import cron from 'node-cron';
import { processDailyStreaks } from '../services/streak.service';

/** Registers the midnight streak-processing job. Disable with SCHEDULER_ENABLED=false. */
export function startScheduler(): void {
  if (process.env.SCHEDULER_ENABLED === 'false') return;

  const timezone = process.env.SCHEDULER_TIMEZONE || 'Asia/Kolkata';
  cron.schedule(
    '0 0 * * *',
    () => {
      processDailyStreaks().catch((err: unknown) => {
        console.error('Scheduler run failed:', err);
      });
    },
    { timezone },
  );
}
