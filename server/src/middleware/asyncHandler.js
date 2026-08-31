// Wraps an async Express route handler so rejected promises are forwarded
// to next() instead of needing a try/catch in every route.
export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
