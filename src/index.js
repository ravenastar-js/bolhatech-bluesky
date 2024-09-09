const { CronJob } = require('cron');
const { main } = require('./services/bluesky');
const { cronMinutes } = require('./config/config')

const cjt = `*/${cronMinutes} * * * *`; // ⏰ intervalo de tempo em minutos
const job = new CronJob(cjt, main);

job.start();

console.log(`
███████████████╗█████╗██████╗█████████████████████╗ 
██╔════╚══██╔══██╔══████╔══██╚══██╔══██╔════██╔══██╗
███████╗  ██║  █████████████╔╝  ██║  █████╗ ██║  ██║
╚════██║  ██║  ██╔══████╔══██╗  ██║  ██╔══╝ ██║  ██║
███████║  ██║  ██║  ████║  ██║  ██║  █████████████╔╝
╚══════╝  ╚═╝  ╚═╚═╝  ╚═╝  ╚═╝  ╚══════╚═════╝ 
🟢 by bolhatech.pages.dev`);