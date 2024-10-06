const { CronJob } = require('cron');
const { main } = require('./services/bluesky');
const { cronMinutes } = require('./config/config')
 
const cjt = `*/${cronMinutes} * * * *`; // ⏰ intervalo de tempo em minutos
const job = new CronJob(cjt, main);

job.start();

const startTime = new Date().toLocaleTimeString();
console.log(`
███████████████╗█████╗██████╗█████████████████████╗ 
██╔════╚══██╔══██╔══████╔══██╚══██╔══██╔════██╔══██╗
███████╗  ██║  █████████████╔╝  ██║  █████╗ ██║  ██║
╚════██║  ██║  ██╔══████╔══██╗  ██║  ██╔══╝ ██║  ██║
███████║  ██║  ██║  ████║  ██║  ██║  █████████████╔╝
╚══════╝  ╚═╝  ╚═╚═╝  ╚═╝  ╚═╝  ╚══════╚═════╝ 
🟢 by bolhatech.blue | ⏰ ${startTime}`);