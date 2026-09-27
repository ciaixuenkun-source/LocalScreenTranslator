class RegionTranslationCoordinator {
  constructor(translatorService) {
    this.translatorService = translatorService;
    this.current = null;
    this.nextRequestId = 0;
  }

  cancel() {
    this.current?.controller.abort();
    this.current = null;
  }

  isCurrent(task) {
    return Boolean(this.current === task && !task.controller.signal.aborted);
  }

  async translate({ sessionId, text, mode, onStatus, onChunk, onStreamReset }) {
    this.cancel();
    const task = {
      requestId: ++this.nextRequestId,
      sessionId,
      controller: new AbortController()
    };
    this.current = task;

    try {
      const result = await this.translatorService.translate(text, {
        mode,
        signal: task.controller.signal,
        includeDetails: true,
        onStatus: (status) => {
          if (this.isCurrent(task)) onStatus?.(status, task);
        },
        onChunk: (chunk) => {
          if (this.isCurrent(task)) onChunk?.(chunk, task);
        },
        onStreamReset: () => {
          if (this.isCurrent(task)) onStreamReset?.(task);
        }
      });
      return this.isCurrent(task)
        ? { ok: true, result, task }
        : { ok: false, stale: true, task };
    } catch (error) {
      if (!this.isCurrent(task)) return { ok: false, stale: true, task };
      return { ok: false, error, task };
    } finally {
      if (this.current === task) this.current = null;
    }
  }
}

module.exports = { RegionTranslationCoordinator };
