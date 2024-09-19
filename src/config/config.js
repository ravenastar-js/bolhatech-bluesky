require('./dotenv');

const API_URL = 'https://bsky.social/xrpc';
const TG = process.env.TAG;
const FTEXT = process.env.FTEXT;

function convertString(t) {
    let words = t.split(',');
    return words.length === 1 ? t : words.map(word => `${word}`).join('|');
}

function fString(f) {
    let words = f.split(',');
    return words.length === 1 ? f : words;
}

const LUCENE = convertString(TG + `discloud,@${process.env.BLUESKY_USERNAME}`)
const FTX = fString(FTEXT)

const MAX_REQUESTS_PER_HOUR = 1666; // Limite de 1.666 registros por hora
const MAX_REQUESTS_PER_EXECUTION = 300; // Limite de 300 solicitações por execução do CronJob
const cronMinutes = 8;

const MAX_POINTS_PER_HOUR = 5000; // Limite de pontos por hora

const embed_color = "#4ec773"
const embed_bannerURL = "https://i.imgur.com/gGY2jfX.png"
const wh_avatarURL = "https://i.imgur.com/0q9F06h.png"
const wh_username = process.env.BLUESKY_USERNAME

module.exports = {
    API_URL,
    TG,
    FTX,
    LUCENE,
    MAX_REQUESTS_PER_HOUR,
    MAX_REQUESTS_PER_EXECUTION,
    cronMinutes,
    MAX_POINTS_PER_HOUR,
    embed_color,
    embed_bannerURL,
    wh_avatarURL,
    wh_username
};
