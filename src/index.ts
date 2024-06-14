import 'dotenv/config';
import { App } from './app';

process.on('uncaughtException', function (err) {
  console.error(err);
});

process.on('SIGINT', err => {
  console.error('SIGINT', err);
  process.exit();
});

const app = new App();
app.init();
