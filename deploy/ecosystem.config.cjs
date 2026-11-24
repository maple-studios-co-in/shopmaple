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
      // With that cap the heap stays near 130 MB, yet PM2 still restarted the store at 768M several times a day (25
      // times, 19 to 24 Nov 2026). The memory was outside the heap: glibc gives each thread its own allocator arena (up
      // to 32 on this 4-core VPS), the image resizer's worker threads and Node's thread pool spread their memory across
      // about 20 of them, and what they free is rarely handed back, so the process climbed 300 to 550 MB there in sudden
      // steps. Two arenas keep freed memory reusable; it is the setting the image library's own guide gives for glibc.
      env: { NODE_ENV: "production", MALLOC_ARENA_MAX: "2" },
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
