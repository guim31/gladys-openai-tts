// -----------------------------------------------------------------------------
// Process lifecycle helper: the last-resort handler for promise rejections
// nobody caught.
// -----------------------------------------------------------------------------

/**
 * Log a rejection nobody caught, then exit so the Gladys supervisor restarts
 * the integration in a clean state.
 * @param {object} deps
 * @param {{error: Function}} deps.logger - Where to log the rejection.
 * @param {(code: number) => void} [deps.exit] - Injectable for tests.
 * @param {NodeJS.EventEmitter} [deps.processRef] - Injectable for tests.
 * @returns {void}
 * @example
 * exitOnUnhandledRejection({ logger });
 */
export function exitOnUnhandledRejection({
  logger,
  exit = (code) => process.exit(code),
  processRef = process,
}) {
  processRef.on('unhandledRejection', (reason) => {
    logger.error(
      'Unhandled promise rejection, exiting so the integration restarts cleanly',
      reason,
    );
    exit(1);
  });
}
