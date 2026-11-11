// Staging copy of the store (docs/operations-staging.md). Everything lives under /home/deploy/shopmaple-staging and
// listens on loopback only: web 3120, API 4120, PostgreSQL 55441 (its own cluster, never the live one on 55440).
// staging-setup.sh copies this file to /home/deploy/shopmaple-staging/ecosystem.config.cjs.
const STAGE = "/home/deploy/shopmaple-staging";
module.exports = {
  apps: [
    {
      name: "shopmaple-staging-api",
      cwd: `${STAGE}/current/apps/api`,
      script: "dist/server.js",
      node_args: `--env-file=${STAGE}/shared/staging.env`,
      env: { NODE_ENV: "production" },
      max_memory_restart: "384M",
      kill_timeout: 10000,
      restart_delay: 2000,
      min_uptime: 10000,
      max_restarts: 10,
      time: true,
    },
    {
      name: "shopmaple-staging-web",
      cwd: `${STAGE}/current/apps/web`,
      script: "../../node_modules/next/dist/bin/next",
      args: "start --hostname 127.0.0.1 --port 3120",
      node_args: `--env-file=${STAGE}/shared/staging.env --max-old-space-size=256`,
      env: { NODE_ENV: "production" },
      max_memory_restart: "512M",
      kill_timeout: 10000,
      restart_delay: 2000,
      min_uptime: 10000,
      max_restarts: 10,
      time: true,
    },
    {
      name: "shopmaple-staging-db",
      cwd: STAGE,
      script: "/usr/lib/postgresql/16/bin/postgres",
      args: `-D ${STAGE}/shared/postgres -p 55441 -k ${STAGE}/shared/socket -c listen_addresses=127.0.0.1`,
      interpreter: "none",
      kill_timeout: 30000,
      restart_delay: 2000,
      min_uptime: 10000,
      max_restarts: 10,
      time: true,
    },
  ],
};
