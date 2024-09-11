// 🌐 Carrega as variáveis de ambiente
require('../config/dotenv.js');
const fs = require('fs');
const { EmbedBuilder, WebhookClient } = require('discord.js');
const {
    API_URL, TG, MAX_REQUESTS_PER_HOUR, MAX_REQUESTS_PER_EXECUTION,
    cronMinutes, MAX_POINTS_PER_HOUR, embed_color, embed_bannerURL,
    wh_avatarURL, wh_username
} = require('../config/config');
const { AtpAgent, AtpSessionEvent } = require('@atproto/api');

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
        sessionData: null,
    };
}

// 💾 Função para salvar o estado no arquivo JSON
function saveState(state) {
    fs.writeFileSync(stateFilePath, JSON.stringify(state));
}

// 🔄 Carrega o estado inicial
let { actionPoints, lastHourReset, dailyRequestCount, lastDailyReset, sessionData } = loadState();

// 🔑 Função para obter o token de acesso
async function getAccessToken(agent) {
    try {
        if (sessionData) {
            await agent.resumeSession(sessionData);
        } else {
            await agent.login({
                identifier: process.env.BLUESKY_USERNAME,
                password: process.env.BLUESKY_PASSWORD
            });
        }

        sessionData = agent.session;
        saveState({ actionPoints, lastHourReset, dailyRequestCount, lastDailyReset, sessionData });
    } catch (err) {
        handleRateLimitError(err, 'getAccessToken');
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
async function getMentions(agent) {
    try {
        const { data } = await agent.listNotifications({ reason: 'mention' });
        return { mentions: data.notifications };
    } catch (err) {
        handleRateLimitError(err, 'getMentions');
    }
}

// 🔖 Função para obter tags
async function getTags(agent) {
    try {
        const { data } = await agent.getPosts({ q: TG, sort: 'latest', tag: TG, limit: 100 });
        return { tags: data.posts };
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

// 🔔 Função para enviar notificação via webhook no Discord
function sendWebhookNotification(target, repostData) {
    const t_uri = target.uri;
    const post_id = t_uri.split('/').pop();
    const link = `https://bsky.app/profile/${target.author.handle}/post/${post_id}`;

    let rtext = target.record?.text || "";
    let desc_embed = rtext.length === 0 ? "" : ` \`\`\`\n${rtext}\n\`\`\` `;

    const isoDate = target.record.createdAt;
    const unixEpochTimeInSeconds = Math.floor(new Date(isoDate).getTime() / 1000);

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
        embeds: [WH_Embed],
    });
    console.log(`📌 Repostado de ${target.author.handle}:\n🌱 CID: ${target.cid}\n🔄🔗 ${link}\n`);
}

// 🔄 Função para repostar uma publicação
async function repost(target, agent, did) {
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
        await agent.repost(target.uri, target.cid);

        actionPoints += 3;
        saveState({ actionPoints, lastHourReset, dailyRequestCount, lastDailyReset, sessionData });

        sendWebhookNotification(target, repostData);

        return { message: 'Reposted successfully' };
    } catch (err) {
        handleRateLimitError(err, 'repost');
    }
}


// 🔍 Função para verificar se uma publicação já foi repostada
async function checkIfReposted(target, agent) {
    try {
        const { data } = await agent.getRepostedBy({ uri: target.uri });
        return data.repostedBy.some(user => user.handle === process.env.BLUESKY_USERNAME);
    } catch (err) {
        handleRateLimitError(err, 'checkIfReposted');
    }
}

// 🔄 Função para filtrar publicações não repostadas
async function filterUnrepostedPosts(allPosts, agent) {
    const unrepostedPosts = [];
    for (const post of allPosts) {
        const isReposted = await checkIfReposted(post, agent);
        if (!isReposted) {
            unrepostedPosts.push(post);
        }
    }
    return unrepostedPosts;
}


// 🔄 Função para repostar publicações não repostadas
async function repostUnrepostedPosts(unrepostedPosts, agent, did) {
    const maxRepostsPerExecution = Math.min(MAX_REQUESTS_PER_EXECUTION, Math.floor(MAX_REQUESTS_PER_HOUR / (60 / cronMinutes)));
    const delayTime = Math.max((cronMinutes * 60 * 1000) / maxRepostsPerExecution, 1000);

    for (const post of unrepostedPosts) {
        const delay = require('../utils/delay');
        await repost(post, agent, did);
        await delay(delayTime);
    }
}

// 🏁 Função principal que coordena as operações
async function main() {
    try {
        validateEnvVariables();

        resetCountersIfNeeded();

        const startTime = new Date().toLocaleTimeString();
        console.log(`⏰ CronJob executado às ${startTime}`);

        const agent = new AtpAgent({
            service: API_URL,
            persistSession: (evt, sess) => {
                if (evt === AtpSessionEvent.Create || evt === AtpSessionEvent.Update) {
                    saveState({ actionPoints, lastHourReset, dailyRequestCount, lastDailyReset, sessionData: sess });
                }
            }
        });

        if (sessionData) {
            await agent.resumeSession(sessionData);
        } else {
            await getAccessToken(agent);
        }

        const { mentions } = await getMentions(agent);
        const { tags } = await getTags(agent);

        const allPosts = [...mentions, ...tags];
        const unrepostedPosts = await filterUnrepostedPosts(allPosts, agent);

        if (unrepostedPosts.length === 0) {
            console.log('══════✮❁•° 🦋 °•❁✮══════');
            return;
        }

        await repostUnrepostedPosts(unrepostedPosts, agent, did);
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
        saveState({ actionPoints, lastHourReset, dailyRequestCount, lastDailyReset, sessionData });
        console.log('🔄 Pontos redefinidos para novo horário.');
    }

    if (now - lastDailyReset >= 86400000) {
        dailyRequestCount = 0;
        lastHourReset = Date.now();
        saveState({ actionPoints, lastHourReset, dailyRequestCount, lastDailyReset, sessionData });
        console.log('🔄 Redefinição da contagem de solicitações diárias.');
    }
}

// 📤 Exporta a função principal
module.exports = { main };
