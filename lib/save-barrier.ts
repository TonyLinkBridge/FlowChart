/** Wait for a flow's outstanding saves without waiting on unrelated flows. */
export class SaveBarrier {
  private readonly jobs = new Map<string, Set<Promise<unknown>>>();

  track<T>(flowId: string, promise: Promise<T>): Promise<T> {
    const pending = this.jobs.get(flowId) ?? new Set<Promise<unknown>>();
    this.jobs.set(flowId, pending);
    pending.add(promise);
    const remove = () => {
      pending.delete(promise);
      if (!pending.size && this.jobs.get(flowId) === pending) this.jobs.delete(flowId);
    };
    void promise.then(remove, remove);
    return promise;
  }

  async waitFor(flowId: string): Promise<void> {
    while (this.jobs.get(flowId)?.size) await Promise.all([...this.jobs.get(flowId)!]);
  }
}
