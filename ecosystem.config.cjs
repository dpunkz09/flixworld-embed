module.exports = {
  apps: [
    {
      name: "FlixworldEmbed",
      cwd: "/var/www/flixworld.xyz/flixworld-embed",
      // Run the compiled output directly â€” avoids nest CLI injecting
      // --enable-source-maps which causes significant CPU overhead in production.
      script: "dist/main.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "600M",
      node_args: "--max-old-space-size=512",
      env: {
        NODE_ENV: "production",
        PORT: 1234,
      },
      time: true,
    },
  ],
};
