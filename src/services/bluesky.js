// 🌐 Carrega as variáveis de ambiente
require('../config/dotenv.js');
const axios = require('axios');
const fs = require('fs');
const { EmbedBuilder, WebhookClient } = require('discord.js');
const {
    API_URL, TG, MAX_REQUESTS_PER_HOUR, MAX_REQUESTS_PER_EXECUTION,
    cronMinutes, MAX_POINTS_PER_HOUR, embed_color, embed_bannerURL,
    wh_avatarURL, wh_username
} = require('../config/config');


const tokenState = new Map();

function loadToken() {
    return {
        token: "",
    };
}

function saveToken(newTokenState) {
    if (newTokenState.token !== undefined) {
        tokenState.set('token', newTokenState.token);
    }
}

let initialTokenState = loadToken();
saveToken(initialTokenState);

function getToken() {
    return {
        token: tokenState.get('token'),
    };
}

// Atualizando apenas o token
const updateToken = (newToken) => {
    saveToken({ token: newToken });
};



const stateFilePath = './state.json';
const webhookClient = new WebhookClient({ id: process.env.WH_ID, token: process.env.WH_TOKEN });

// 💾 Função para carregar o estado do arquivo JSON
function loadState() {
    if (fs.existsSync(stateFilePath)) {
        const rawData = fs.readFileSync(stateFilePath);
        return JSON.parse(rawData);
    }
    return {
        actionPoints: 0,
        lastHourReset: Date.now(),
        dailyRequestCount: 0,
        lastDailyReset: Date.now(),
        did: "",
    };
}

// 💾 Função para salvar o estado no arquivo JSON
function saveState(state) {
    fs.writeFileSync(stateFilePath, JSON.stringify(state));
}

// 🔄 Carrega o estado inicial
let { actionPoints, lastHourReset, dailyRequestCount, lastDailyReset, did } = loadState();
let token = getToken().token

// 🔑 Função para obter o token de acesso
async function getAccessToken() {
    try {
        if (token?.length > 0) return;
        if (dailyRequestCount + 3 > MAX_REQUESTS_PER_EXECUTION) {
            console.log('⚠️ Limite diário de solicitações atingido. Aguardando...');
            return;
        }
        const { data } = await axios.post(`${API_URL}/com.atproto.server.createSession`, {
            identifier: process.env.BLUESKY_USERNAME,
            password: process.env.BLUESKY_PASSWORD
        });

        dailyRequestCount += 3;
        did = data.did;
        
        updateToken(data.accessJwt)
        saveState({ actionPoints, lastHourReset, dailyRequestCount, lastDailyReset, did });
    } catch (err) {
        handleRateLimitError(err, 'getAccessToken');
    }
}


// 🔄 Função para trocar o token de acesso
async function changeToken() {
    try {
        if (dailyRequestCount + 3 > MAX_REQUESTS_PER_EXECUTION) {
            console.log('⚠️ Limite diário de solicitações atingido. Aguardando...');
            return;
        }
        console.log('🔄 token atualizado.');

        const { data } = await axios.post(`${API_URL}/com.atproto.server.createSession`, {
            identifier: process.env.BLUESKY_USERNAME,
            password: process.env.BLUESKY_PASSWORD
        });

        dailyRequestCount += 3;
        did = data.did;
        
        updateToken(data.accessJwt)
        saveState({ actionPoints, lastHourReset, dailyRequestCount, lastDailyReset, did });
    } catch (err) {
        handleRateLimitError(err, 'changeToken');
    }
}

// 🚫 Função para lidar com erros de limite de taxa
function handleRateLimitError(err, functionName) {
    if (err.response && err.response.data && err.response.data.error === "RateLimitExceeded") {
        console.log(`[ 🔴 ratelimit-reset in ${functionName} ] 🔗 https://hammertime.cyou?t=${err.response.headers['ratelimit-reset']}`);
    } else {
        console.error(`Error in ${functionName}:`, err.message || err);
    }
}

// 📣 Função para obter menções
async function getMentions(token) {
    try {
        const { data } = await axios.get(`${API_URL}/app.bsky.notification.listNotifications`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return { mentions: data.notifications.filter(({ reason }) => reason === 'mention') };
    } catch (err) {
        handleRateLimitError(err, 'getMentions');
    }
}

// 🔖 Função para obter tags
async function getTags(token) {
    try {
        const configTag = {
            method: 'get',
            maxBodyLength: Infinity,
            url: `${API_URL}/app.bsky.feed.searchPosts?q=${TG}&sort=latest&tag=${TG}&limit=100`,
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        };
        const { data } = await axios(configTag);
        return { tags: data.posts.filter(({ indexedAt }) => indexedAt).sort((a, b) => a.typeid - b.typeid) };
    } catch (err) {
        handleRateLimitError(err, 'getTags');
    }
}

// 📝 Função para criar dados de repostagem
const createRepostData = (target, did) => ({
    $type: 'app.bsky.feed.repost',
    repo: did,
    collection: 'app.bsky.feed.repost',
    record: {
        subject: { uri: target.uri, cid: target.cid },
        createdAt: new Date().toISOString(),
    },
});

function limitarTexto(texto, limite = 1000) {
        if (texto.length <= limite) {
            return texto;
        }
        return texto.slice(0, limite) + "[...]";
}

// 🔔 Função para enviar notificação via webhook no Discord
function sendWebhookNotification(target, repostData) {
    const t_uri = target.uri;
    const post_id = t_uri.split('/').pop();
    const link = `https://bsky.app/profile/${target.author.handle}/post/${post_id}`;

    let rtext = target.record?.text || "";
    let desc_embed = rtext.length === 0 ? "" : ` \`\`\`\n${rtext}\n\`\`\` `;

    const isoDate = target.record.createdAt;
    const unixEpochTimeInSeconds = Math.floor(new Date(isoDate).getTime() / 1000);

const files = target.embed;
const wh_files = [];

const getExtension = (url) => {
    if (url.includes("@gif") || url.includes(".gif")) return "gif"; 
    return "png";
};

const createFileObject = (url, name, description) => ({
    attachment: url,
    name,
    description: limitarTexto(description)
});

const isYouTubeUrl = (url) => {
    const youtubeDomains = ["youtube.com", "youtu.be"];
    return youtubeDomains.some(domain => url.includes(domain));
};

const isImageUrl = (url) => {
    const imageExtensions = [".png", ".jpeg", ".gif"];
    return imageExtensions.some(ext => url.includes(ext));
};

if (files?.images) {
    files.images.forEach((img, index) => {
        const extension = getExtension(img.fullsize);
        wh_files.push(createFileObject(img.fullsize, `${index + 1}.${extension}`, img.alt));
    });
}

if (files?.external && !isYouTubeUrl(files.external.uri)) {
    let externalUrl = files.external.uri;
    if (!isImageUrl(externalUrl)) {
        externalUrl = files.external.thumb;
    }
    const extension = getExtension(externalUrl);
    wh_files.push(createFileObject(externalUrl, `external.${extension}`, files.external.description));
}

    
    const WH_Embed = new EmbedBuilder()
        .setColor(embed_color)
        .setAuthor({
            name: `${target.author.handle}`,
            iconURL: `${target.author.avatar}`,
            url: `https://bsky.app/profile/${target.author.handle}`
        })
        .setDescription(`${desc_embed}\n-# \`⏰\` Publicação postada <t:${unixEpochTimeInSeconds}:R>\n-# <:rbluesky:1282450204947251263> [PUBLICAÇÃO REPOSTADA](${link}) por [@${wh_username}](https://bsky.app/profile/${wh_username})`)
        .setImage(embed_bannerURL)

    webhookClient.send({
        content: `<@&1282578310383145024>`,
        username: wh_username,
        avatarURL: wh_avatarURL,
        files: wh_files,
        embeds: [WH_Embed],
    });
    console.log(`📌 Repostado de ${target.author.handle}:\n🌱 CID: ${target.cid}\n🔄🔗 ${link}\n`);
}

// 🔄 Função para repostar uma publicação
async function repost(target, token, did) {
    try {
        if (!target.uri || !target.cid) {
            console.error('🎯 Alvo inválido para repostagem');
            return;
        }

        if (actionPoints + 3 > MAX_POINTS_PER_HOUR) {
            console.log('⚠️ Limite de pontos por hora atingido. Aguardando...');
            return;
        }

        const repostData = createRepostData(target, did);
        const { data } = await axios.post(`${API_URL}/com.atproto.repo.createRecord`, repostData, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        actionPoints += 3;
        saveState({ actionPoints, lastHourReset, dailyRequestCount, lastDailyReset, did });

        sendWebhookNotification(target, repostData);

        return { message: 'Reposted successfully', data };
    } catch (err) {
        handleRateLimitError(err, 'repost');
    }
}

// 🔍 Função para verificar se uma publicação já foi repostada
async function checkIfReposted(target, token) {
    try {
        const config = {
            method: 'get',
            maxBodyLength: Infinity,
            url: `https://public.api.bsky.app/xrpc/app.bsky.feed.getRepostedBy?uri=${target.uri}`,
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        };

        const { data } = await axios(config);
        return data.repostedBy.some(user => user.handle === process.env.BLUESKY_USERNAME);
    } catch (err) {
        handleRateLimitError(err, 'checkIfReposted');
    }
}


// 🏁 Função principal que coordena as operações
async function main() {
    try {
        validateEnvVariables();

        resetCountersIfNeeded();

        const startTime = new Date().toLocaleTimeString();
        console.log(`⏰ CronJob executado em ${startTime}`);

        await getAccessToken();

        const { mentions } = await getMentions(token);
        const { tags } = await getTags(token);

        const allPosts = [...mentions, ...tags];
        const unrepostedPosts = await filterUnrepostedPosts(allPosts, token);

        if (unrepostedPosts.length === 0) {
            console.log('══════✮❁•° 🦋 °•❁✮══════');
            return;
        }

        await repostUnrepostedPosts(unrepostedPosts, token, did);
    } catch (err) {
        handleRateLimitError(err, 'main');
    }
}

// ✅ Função para validar variáveis de ambiente
function validateEnvVariables() {
    if (!process.env.BLUESKY_USERNAME || !process.env.BLUESKY_PASSWORD) {
        throw new Error('Missing BLUESKY_USERNAME or BLUESKY_PASSWORD in environment variables');
    }
}

// 🔄 Função para resetar contadores se necessário
function resetCountersIfNeeded() {
    const now = Date.now();
    if (now - lastHourReset >= 3600000) {
        actionPoints = 0;
        lastHourReset = Date.now();
        saveState({ actionPoints, lastHourReset, dailyRequestCount, lastDailyReset, did });
        console.log('🔄 Pontos redefinidos para novo horário.');
    }

    if (now - lastDailyReset >= 86400000) {
        dailyRequestCount = 0;
        lastHourReset = Date.now();
        saveState({ actionPoints, lastHourReset, dailyRequestCount, lastDailyReset, did });
        console.log('🔄 Redefinição da contagem de solicitações diárias.');
    }
}

// 🔍 Função para filtrar publicações não repostadas
async function filterUnrepostedPosts(allPosts, token) {
    const unrepostedPosts = [];
    for (const post of allPosts) {
        const isReposted = await checkIfReposted(post, token);
        if (!isReposted) {
            unrepostedPosts.push(post);
        }
    }
    return unrepostedPosts;
}

// 🔄 Função para repostar publicações não repostadas
async function repostUnrepostedPosts(unrepostedPosts, token, did) {
    const maxRepostsPerExecution = Math.min(MAX_REQUESTS_PER_EXECUTION, Math.floor(MAX_REQUESTS_PER_HOUR / (60 / cronMinutes)));
    const delayTime = Math.max((cronMinutes * 60 * 1000) / maxRepostsPerExecution, 1000);

    for (const post of unrepostedPosts) {
        const delay = require('../utils/delay');
        await repost(post, token, did);
        await delay(delayTime);
    }
}

// ⏰ Configura intervalo para trocar o token periodicamente
let intervalo = 30 * 60 * 1000;
setInterval(changeToken, intervalo);

// 📤 Exporta a função principal
module.exports = { main };
