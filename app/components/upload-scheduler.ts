export type UploadProgressSnapshot = {
  progress: number;
  uploadedBytes: number;
  speedBytesPerSecond: number;
  remainingSeconds: number | null;
};

type SchedulerJob = {
  taskId: string;
  run(): Promise<unknown>;
  resolve(value: unknown): void;
  reject(reason: unknown): void;
  signal?: AbortSignal;
  removeAbortListener?: () => void;
};

const INITIAL_GLOBAL_LIMIT = 4;
const MIN_GLOBAL_LIMIT = 2;
const MAX_GLOBAL_LIMIT = 6;
const MAX_TASK_LIMIT = 3;
const SUCCESSES_TO_INCREASE = 6;

export class AdaptiveUploadScheduler {
  readonly #queues = new Map<string, SchedulerJob[]>();
  readonly #taskOrder: string[] = [];
  readonly #activeByTask = new Map<string, number>();
  #active = 0;
  #cursor = 0;
  #limit = INITIAL_GLOBAL_LIMIT;
  #consecutiveSuccesses = 0;
  #drainRequested = false;

  schedule<T>(taskId: string, work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason ?? new DOMException("上传已暂停", "AbortError"));
        return;
      }
      const job: SchedulerJob = {
        taskId,
        run: work,
        resolve: (value) => resolve(value as T),
        reject,
        signal,
      };
      if (signal) {
        const handleAbort = () => {
          this.#requestDrain();
        };
        signal.addEventListener("abort", handleAbort, { once: true });
        job.removeAbortListener = () => signal.removeEventListener("abort", handleAbort);
      }
      const queue = this.#queues.get(taskId);
      if (queue) queue.push(job);
      else {
        this.#queues.set(taskId, [job]);
        this.#taskOrder.push(taskId);
      }
      this.#requestDrain();
    });
  }

  noteRetry(): void {
    this.#limit = Math.max(MIN_GLOBAL_LIMIT, this.#limit - 1);
    this.#consecutiveSuccesses = 0;
    this.#requestDrain();
  }

  #requestDrain(): void {
    if (this.#drainRequested) return;
    this.#drainRequested = true;
    queueMicrotask(() => {
      this.#drainRequested = false;
      this.#drain();
    });
  }

  #drain(): void {
    while (this.#active < this.#limit) {
      const job = this.#nextJob();
      if (!job) return;
      if (job.signal?.aborted) {
        job.removeAbortListener?.();
        job.reject(job.signal.reason ?? new DOMException("上传已暂停", "AbortError"));
        continue;
      }
      this.#active += 1;
      this.#activeByTask.set(job.taskId, (this.#activeByTask.get(job.taskId) ?? 0) + 1);
      void job.run().then(
        (value) => {
          this.#recordSuccess();
          job.resolve(value);
        },
        (error: unknown) => job.reject(error),
      ).finally(() => {
        job.removeAbortListener?.();
        this.#active -= 1;
        const remaining = (this.#activeByTask.get(job.taskId) ?? 1) - 1;
        if (remaining > 0) this.#activeByTask.set(job.taskId, remaining);
        else this.#activeByTask.delete(job.taskId);
        this.#requestDrain();
      });
    }
  }

  #nextJob(): SchedulerJob | null {
    if (this.#taskOrder.length === 0) return null;
    for (let checked = 0; checked < this.#taskOrder.length; checked += 1) {
      const index = this.#cursor % this.#taskOrder.length;
      const taskId = this.#taskOrder[index];
      this.#cursor = (index + 1) % this.#taskOrder.length;
      if ((this.#activeByTask.get(taskId) ?? 0) >= MAX_TASK_LIMIT) continue;
      const queue = this.#queues.get(taskId);
      const job = queue?.shift();
      if (job) return job;
    }
    return null;
  }

  #recordSuccess(): void {
    this.#consecutiveSuccesses += 1;
    if (this.#consecutiveSuccesses < SUCCESSES_TO_INCREASE) return;
    this.#limit = Math.min(MAX_GLOBAL_LIMIT, this.#limit + 1);
    this.#consecutiveSuccesses = 0;
  }
}

export function createUploadProgressTracker(
  totalBytes: number,
  initialUploadedBytes = 0,
): { confirm(bytes: number, nowMilliseconds?: number): UploadProgressSnapshot } {
  let uploadedBytes = Math.min(totalBytes, Math.max(0, initialUploadedBytes));
  const samples: Array<{ time: number; bytes: number }> = [
    { time: performance.now(), bytes: uploadedBytes },
  ];

  return {
    confirm(bytes, nowMilliseconds = performance.now()) {
      uploadedBytes = Math.min(totalBytes, uploadedBytes + Math.max(0, bytes));
      samples.push({ time: nowMilliseconds, bytes: uploadedBytes });
      while (
        samples.length > 2 &&
        (samples.length > 6 || nowMilliseconds - (samples[0]?.time ?? nowMilliseconds) > 5_000)
      ) {
        samples.shift();
      }
      const first = samples[0];
      const elapsedSeconds = first
        ? Math.max((nowMilliseconds - first.time) / 1_000, 0.1)
        : 0;
      const measuredBytes = first ? uploadedBytes - first.bytes : 0;
      const speedBytesPerSecond = measuredBytes > 0 ? measuredBytes / elapsedSeconds : 0;
      const remainingBytes = Math.max(0, totalBytes - uploadedBytes);
      return {
        progress: totalBytes > 0
          ? uploadedBytes >= totalBytes ? 100 : Math.floor((uploadedBytes / totalBytes) * 100)
          : 0,
        uploadedBytes,
        speedBytesPerSecond: remainingBytes === 0 ? 0 : Math.max(0, speedBytesPerSecond),
        remainingSeconds: remainingBytes === 0
          ? 0
          : speedBytesPerSecond > 0 ? remainingBytes / speedBytesPerSecond : null,
      };
    },
  };
}
