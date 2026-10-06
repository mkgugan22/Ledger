export function createConcurrencyLimiter({ limit, maxQueue = limit * 4 }) {
  let active = 0;
  const queue = [];

  const drain = () => {
    while (active < limit && queue.length) {
      const item = queue.shift();
      active += 1;
      Promise.resolve()
        .then(item.task)
        .then(item.resolve, item.reject)
        .finally(() => {
          active -= 1;
          drain();
        });
    }
  };

  return function run(task) {
    if (active >= limit && queue.length >= maxQueue) {
      const error = new Error("Ledger is busy right now. Please try again in a moment.");
      error.status = 503;
      error.expose = true;
      return Promise.reject(error);
    }
    return new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      drain();
    });
  };
}
