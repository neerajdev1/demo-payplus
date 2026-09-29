// pm2 process file for the VPS. Start with: pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "payplus-test-store",
      script: "node_modules/next/dist/bin/next",
      // Bound to localhost so the app is only reachable through nginx.
      args: "start --hostname 127.0.0.1 --port 3100",
      cwd: __dirname,
      // Keep a single process: webhook events are held in memory, so cluster
      // instances would each see a different list.
      exec_mode: "fork",
      instances: 1,
      env: { NODE_ENV: "production" },
      max_memory_restart: "512M",
      time: true,
    },
  ],
};
