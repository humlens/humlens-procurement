import { deliverDue } from '@/lib/outbox';
import { pullPaidBills } from '@/lib/accounting/sync';

// Background jobs that keep the connected apps in step without anyone
// pressing a button. Started once per server process from instrumentation.ts
// (long-running `next start`/`next dev`). On serverless hosting set
// DISABLE_SCHEDULER=1 and run workers/agentScheduler.ts from a cron instead.

type Job = { name: string; everyMs: number; run: () => Promise<unknown> };

export const jobs: Job[] = [
  { name: 'deliver messages to connected apps', everyMs: 15_000, run: () => deliverDue() },
  { name: 'check bills paid in the accounting system', everyMs: 30 * 60_000, run: () => pullPaidBills() },
];

const globalState = globalThis as unknown as { __humlensScheduler?: boolean };

export function startScheduler() {
  if (globalState.__humlensScheduler || process.env.DISABLE_SCHEDULER === '1' || process.env.NODE_ENV === 'test') return;
  globalState.__humlensScheduler = true;

  for (const job of jobs) {
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        await job.run();
      } catch (error) {
        console.error(`[scheduler] ${job.name} failed`, error);
      } finally {
        running = false;
      }
    };
    setTimeout(() => {
      void tick();
      setInterval(tick, job.everyMs).unref?.();
    }, 5_000).unref?.();
  }
  console.log(`[scheduler] started: ${jobs.map((job) => job.name).join('; ')}`);
}
