require('./dotenv');

const API_URL = 'https://bsky.social/xrpc';
const TG = process.env.TAG;

const MAX_REQUESTS_PER_HOUR = 1666; // Limite de 1.666 registros por hora
const MAX_REQUESTS_PER_EXECUTION = 300; // Limite de 300 solicitações por execução do CronJob
const cronMinutes = 8;

const MAX_REQUESTS_DAILY = 300;
const MAX_POINTS_PER_HOUR = 5000; // Limite de pontos por hora

const embedColor = "#4ec773"
const bannerURL = "https://i.imgur.com/2B01blo.png"
const avatarURL = "https://i.imgur.com/0q9F06h.png"
const webhookUsername = process.env.BLUESKY_USERNAME

module.exports = {
    API_URL,
    TG,
    MAX_REQUESTS_PER_HOUR,
    MAX_REQUESTS_PER_EXECUTION,
    cronMinutes,
    MAX_POINTS_PER_HOUR,
    embedColor,
    bannerURL,
    avatarURL,
    webhookUsername,
    MAX_REQUESTS_DAILY
};