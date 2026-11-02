// All services listen on loopback. Secrets are read from a shared chmod-600 .env.
module.exports = {
  apps: [
    {
      name: "shopmaple-api",
      cwd: "/home/deploy/shopmaple/current/apps/api",
      script: "dist/server.js",
      node_args: "--env-file=/home/deploy/shopmaple/shared/store.env",
      env: { NODE_ENV: "production" },
      max_memory_restart: "512M",
      kill_timeout: 10000,
      restart_delay: 2000,
      min_uptime: 10000,
      max_restarts: 10,
      time: true,
    },
    {
      name: "shopmaple-web",
      cwd: "/home/deploy/shopmaple/current/apps/web",
      script: "../../node_modules/next/dist/bin/next",
      args: "start --hostname 127.0.0.1 --port 3110",
      // Node collects garbage only near its own heap ceiling (gigabytes by default), so without a cap
      // the store grows ~0.9 MB per homepage view until PM2 kills it at max_memory_restart.
      node_args: "--env-file=/home/deploy/shopmaple/shared/store.env --max-old-space-size=384",
      env: { NODE_ENV: "production" },
      max_memory_restart: "768M",
      kill_timeout: 10000,
      restart_delay: 2000,
      min_uptime: 10000,
      max_restarts: 10,
      time: true,
    },
    {
      name: "shopmaple-db",
      cwd: "/home/deploy/shopmaple",
      script: "/usr/lib/postgresql/16/bin/postgres",
      args: "-D /home/deploy/shopmaple/shared/postgres",
      interpreter: "none",
      kill_timeout: 30000,
      restart_delay: 2000,
      min_uptime: 10000,
      max_restarts: 10,
      time: true,
    },
  ],
};
