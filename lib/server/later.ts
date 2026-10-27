import "server-only";

import { after } from "next/server";

// Run a task after the response (next/server after()), so the member is not
// kept waiting for an email. Outside a request (a script), it just runs.
// Never throws; the task's own failure is logged.
export function later(label: string, task: () => Promise<unknown>): void {
  const run = async () => {
    try {
      await task();
    } catch (err) {
      console.error(`${label} failed:`, err);
    }
  };
  try {
    after(run);
  } catch {
    void run();
  }
}
