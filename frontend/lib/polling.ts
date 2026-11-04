// Polling helpers for admin views that refresh on an interval.

type VisibilitySource = Pick<Document, "hidden" | "addEventListener" | "removeEventListener">;

export interface PollingOptions {
  /** One refresh. `firstRun` is true for the immediate run started by `immediate`. */
  run: (signal: AbortSignal, firstRun: boolean) => Promise<unknown>;
  intervalMs: number;
  /** Run once right away instead of waiting a full interval first. */
  immediate?: boolean;
  /** Pauses polling while hidden and refreshes when shown again; defaults to `document` in the browser. */
  visibility?: VisibilitySource | null;
  /** Start paused (see Poller.pause). The `immediate` first run still happens. */
  paused?: boolean;
}

export interface Poller {
  /** Stops polling for good and aborts the in-flight run. */
  stop: () => void;
  /** Skips interval runs until resumed; a run already in flight finishes normally. */
  pause: () => void;
  /** Ends a pause. Refreshes right away if an interval run was skipped while paused, else keeps the current timer. */
  resume: () => void;
}

export const isAbortError = (err: unknown) =>
  err instanceof Error && err.name === "AbortError";

/**
 * Calls `run` every `intervalMs` until stopped.
 * The next run is scheduled only after the previous one settles, so requests never overlap;
 * stopping aborts the in-flight run through its signal.
 */
export function createPoller({ run, intervalMs, immediate = false, visibility, paused = false }: PollingOptions): Poller {
  const vis = visibility === undefined ? (typeof document === "undefined" ? null : document) : visibility;
  let stopped = false;
  let isPaused = paused;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | null = null;

  const schedule = () => {
    if (!stopped) timer = setTimeout(() => tick(false), intervalMs);
  };

  const tick = async (firstRun: boolean) => {
    timer = undefined;
    if (stopped) return;
    // While hidden or paused nothing is scheduled; becoming visible or resume() restarts polling
    if ((vis?.hidden || isPaused) && !firstRun) return;
    controller = new AbortController();
    try {
      await run(controller.signal, firstRun);
    } catch (err) {
      if (!isAbortError(err)) console.error("Polling run failed:", err);
    } finally {
      controller = null;
      schedule();
    }
  };

  // Refresh stale data once polling may run again: only when an interval run was skipped (no timer pending)
  // and no run is in flight, so a resume never starts a second request
  const refreshIfIdle = () => {
    if (!stopped && !isPaused && !vis?.hidden && !controller && timer === undefined) tick(false);
  };
  vis?.addEventListener("visibilitychange", refreshIfIdle);

  if (immediate) tick(true);
  else schedule();

  return {
    stop: () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      controller?.abort();
      vis?.removeEventListener("visibilitychange", refreshIfIdle);
    },
    pause: () => {
      isPaused = true;
    },
    resume: () => {
      if (!isPaused) return;
      isPaused = false;
      refreshIfIdle();
    },
  };
}

/** createPoller without pause controls; returns the stop function (handy as an effect cleanup). */
export function startPolling(options: PollingOptions): () => void {
  return createPoller(options).stop;
}
