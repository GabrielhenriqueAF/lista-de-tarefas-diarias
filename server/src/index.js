import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig(process.env);
const app = createApp({ config, repositories: {} });

await app.listen({ port: config.port, host: '127.0.0.1' });
