import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { exitOnUnhandledRejection } from '../src/lifecycle.js';

test('an unhandled rejection is logged, then the process exits', () => {
  const processRef = new EventEmitter();
  const logged = [];
  const exits = [];
  exitOnUnhandledRejection({
    logger: { error: (...args) => logged.push(args) },
    exit: (code) => exits.push(code),
    processRef,
  });
  processRef.emit('unhandledRejection', new Error('boom'));
  assert.equal(logged.length, 1);
  assert.deepEqual(exits, [1]);
});
