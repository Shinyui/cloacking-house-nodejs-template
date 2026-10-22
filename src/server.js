import { createServer } from 'node:http';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

try {
  const config = loadConfig();
  const app = await createApp({ config });
  const server = createServer(app);
  server.on('error', (error) => {
    console.error(JSON.stringify({ event: 'listen_failed', code: error.code }));
    process.exitCode = 1;
  });
  server.listen(config.port, '0.0.0.0', () => {
    console.log(JSON.stringify({ event: 'listening', port: server.address().port, ip_source: config.ipSource }));
  });

  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, () => {
      console.log(JSON.stringify({ event: 'shutdown', signal }));
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 10_000).unref();
    });
  }
} catch (error) {
  console.error(JSON.stringify({ event: 'startup_failed', message: error.message }));
  process.exitCode = 1;
}
