import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { apps } = createRequire(import.meta.url)('./ecosystem.staging.config.cjs');
const byName = Object.fromEntries(apps.map(app => [app.name, app]));
const megabytes = value => Number(/^(\d+)M$/.exec(value)?.[1]);

test('staging runs exactly its own three processes, none named like production', () => {
  assert.deepEqual(Object.keys(byName).sort(), ['shopmaple-staging-api', 'shopmaple-staging-db', 'shopmaple-staging-web']);
});

test('staging never reads the production environment, release or database', () => {
  for (const app of apps) {
    const text = JSON.stringify(app);
    assert.doesNotMatch(text, /shopmaple\/shared\/store\.env|\/home\/deploy\/shopmaple\/(current|shared)/, app.name);
    assert.doesNotMatch(text, /55440|:3110|:4110/, app.name);
  }
  assert.match(byName['shopmaple-staging-api'].node_args, /--env-file=\/home\/deploy\/shopmaple-staging\/shared\/staging\.env/);
  assert.match(byName['shopmaple-staging-web'].args, /--hostname 127\.0\.0\.1 --port 3120/);
  assert.match(byName['shopmaple-staging-db'].args, /-p 55441 .*listen_addresses=127\.0\.0\.1/);
});

test('the staging web heap cap leaves room under its memory restart', () => {
  const web = byName['shopmaple-staging-web'];
  const cap = Number(/--max-old-space-size=(\d+)/.exec(web.node_args)?.[1]);
  assert.ok(cap > 0 && cap + 256 <= megabytes(web.max_memory_restart));
});
