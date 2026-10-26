/** Schedule one enabled delivery cycle at a time and drain it before DB shutdown. */
export function startEnquiryDeliveryRunner(run: () => Promise<unknown>, onError: () => void) {
  let stopped = false;
  let active: Promise<void> | undefined;
  const timer = setInterval(() => {
    if (stopped || active) return;
    active = Promise.resolve().then(run).then(
      () => undefined,
      () => { onError(); },
    ).finally(() => { active = undefined; });
  }, 30_000);
  timer.unref();
  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      await active;
    },
  };
}
