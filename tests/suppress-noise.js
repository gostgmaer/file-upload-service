'use strict';

// Suppress console.error during tests. The error-handler middleware logs every
// 4xx/5xx response, which produces noisy but expected output in test runs.
// Silence it here so only genuine test failures pollute the output.
beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());
