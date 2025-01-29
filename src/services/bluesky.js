// 🌐 Carrega as variáveis de ambiente
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const pathToFfmpeg = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');
const { EmbedBuilder, WebhookClient } = require('discord.js');
const {
    API_URL, LUCENE, FTX, MAX_REQUESTS_PER_HOUR, MAX_REQUESTS_PER_EXECUTION,
    cronMinutes, MAX_POINTS_PER_HOUR, embed_color, embed_bannerURL,
    wh_avatarURL, wh_username, WH_ID_1, WH_TOKEN_1, BLUESKY_USERNAME,
    WH_ID_2, WH_TOKEN_2, BLUESKY_PASSWORD, OnlyOptIn, FOLLOWERS_LIMIT
} = require('../config/config');

// 🗝️ Cria um objeto para armazenar o token
let tokenObject = { token: "" };

// 🗝️ Função para definir o token em tokenObject
function tokenSet(newToken) {
    tokenObject.token = newToken;
}

// 🗝️ Cria um objeto para armazenar a lista de usuários seguidores
let fuser;

// 🗝️ Função para definir a lista de usuários em fuser
function fuserSet(userList) {
    fuser = userList;
}

const stateFilePath = './state.json';
const webhookClient_1 = new WebhookClient({ id: WH_ID_1, token: WH_TOKEN_1 });
const webhookClient_2 = new WebhookClient({ id: WH_ID_2, token: WH_TOKEN_2 });

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
let { token } = tokenObject

// 🔑 Função para obter o token de acesso
async function getAccessToken() {
    try {
        if (token?.length > 0) return;
        if (dailyRequestCount + 3 > MAX_REQUESTS_PER_EXECUTION) {
            console.log('⚠️ Limite diário de solicitações atingido. Aguardando...');
            return;
        }
        const { data } = await axios.post(`${API_URL}/com.atproto.server.createSession`, {
            identifier: BLUESKY_USERNAME,
            password: BLUESKY_PASSWORD
        });

        dailyRequestCount += 3;
        token = data.accessJwt;
        did = data.did;

        tokenSet(token)
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
            identifier: BLUESKY_USERNAME,
            password: BLUESKY_PASSWORD
        });

        dailyRequestCount += 3;
        token = data.accessJwt;
        did = data.did;

        tokenSet(token)
        saveState({ actionPoints, lastHourReset, dailyRequestCount, lastDailyReset, did });
    } catch (err) {
        handleRateLimitError(err, 'changeToken');
    }
}



function buildFollowersUrl(cursor) {
    let url = `${API_URL}/app.bsky.graph.getFollowers?actor=${BLUESKY_USERNAME}&limit=${FOLLOWERS_LIMIT}`;
    if (cursor) {
        url += `&cursor=${cursor}`;
    }
    return url;
}

async function getFollowers(token) {
    try {
        let allFollowers = [];
        let cursor = null;

        while (true) {
            const followersUrl = buildFollowersUrl(cursor);

            const configFollowers = {
                method: 'get',
                maxBodyLength: Infinity,
                url: followersUrl,
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            };

            const { data } = await axios(configFollowers);
            allFollowers = allFollowers.concat(data.followers);

            if (data.cursor) {
                cursor = data.cursor;
            } else {
                break;
            }
        }

        fuserSet(allFollowers);
        console.log("✳️ " + allFollowers.length);
    } catch (err) {
        handleRateLimitError(err, 'getFollowers');
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


// 🔖 Função para obter posts
async function searchPosts(token) {
    try {
        const configPosts = {
            method: 'get',
            maxBodyLength: Infinity,
            url: `${API_URL}/app.bsky.feed.searchPosts?q=${LUCENE}&sort=latest&limit=100`,
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        };

        const { data } = await axios(configPosts);

        // ⚜️ Filtrar e ordenar posts
        const filteredPosts = data.posts
            .filter(({
                indexedAt,
                record,
                author
            }) => {

                const OptIn = OnlyOptIn.some(user => author.did.includes(user.did));
                const ping = record.text.includes(`@${BLUESKY_USERNAME}`);
                const containsBlockedWords = !FTX.some(word => record.text.toLowerCase().includes(word.toLowerCase()));
                const bFollowers = fuser.some(user => author.did.includes(user.did));

                // Se o usuário estiver na lista "opt-in", mencionar o @bolhatech.blue e não houver palavras bloqueadas => repostar publicações somente com menções.
                if (indexedAt && containsBlockedWords && OptIn && ping) return true;

                // Se o usuário estiver na lista "opt-in" porém não mencionar o @bolhatech.blue => ignorar posts.
                if (indexedAt && containsBlockedWords && OptIn && !ping) return false;

                // Permite posts de seguidores e que não contêm palavras bloqueadas. Funcionamento padrão e irá repostar suas publicações que contenham tags, gatilhos e menções.
                if (indexedAt && containsBlockedWords && bFollowers) return true;

                // Configuração Padrão (a menos que as exceções acima se apliquem), 100% "opt-in".
                return indexedAt && containsBlockedWords && ping
            }).sort((a, b) => a.typeid - b.typeid);

        return { posts: filteredPosts };
    } catch (err) {
        handleRateLimitError(err, 'searchPosts');
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
async function sendWebhookNotification(target, repostData) {
    try {
        // 📌 Extrai a URI do alvo
        const t_uri = target.uri;
        const post_id = t_uri.split('/').pop();
        const link = `https://bsky.app/profile/${target.author.handle}/post/${post_id}`;

        // ✏️ Obtém o texto do post e prepara a descrição do embed
        let rtext = target.record?.text || "";
        let desc_embed = rtext.length === 0 ? "" : ` \`\`\`\n${rtext}\n\`\`\` `;

        // 🕒 Converte a data ISO para Unix Epoch Time em segundos
        const isoDate = target.record.createdAt;
        const unixEpochTimeInSeconds = Math.floor(new Date(isoDate).getTime() / 1000);

        // 📂 Obtém os arquivos embutidos no post
        const files = target.embed;
        let wh_files = [];

        // 🔍 Função para obter a extensão do arquivo
        const getExtension = (url) => {
            if (url.includes("@gif") || url.includes(".gif")) return "gif";
            return "png";
        };

        // 🗂️ Função para criar um objeto de arquivo
        const createFileObject = (url, name, description) => ({
            attachment: url,
            name,
            description: limitarTexto(description)
        });

        // 🖼️ Função para verificar se a URL é de uma imagem
        const isImageUrl = (url) => {
            const imageExtensions = [".png", ".jpeg", ".gif"];
            return imageExtensions.some(ext => url.includes(ext));
        };

        // 🖋️ Cria o embed para o webhook
        const WH_Embed = new EmbedBuilder()
            .setColor(embed_color)
            .setAuthor({
                name: `${target.author.handle}`,
                iconURL: `${target.author.avatar}`,
                url: `https://bsky.app/profile/${target.author.handle}`
            })
            .setDescription(`${desc_embed}\n-# \`⏰\` Publicação postada <t:${unixEpochTimeInSeconds}:R>\n-# <:rbluesky:1282450204947251263> [PUBLICAÇÃO REPOSTADA](${link}) por [@${wh_username}](https://bsky.app/profile/${wh_username})`)
            .setImage(embed_bannerURL)

        // 🎥 Função para download e conversão de vídeo
        const downloadAndConvertVideo = async (url, outputPath) => {
            // ⚙️ Configura o caminho do FFmpeg
            ffmpeg.setFfmpegPath(pathToFfmpeg);
            console.log(`🎥 Iniciando download e conversão do vídeo: ${url}`);
            return new Promise((resolve, reject) => {
                ffmpeg(url)
                    .output(outputPath)
                    .addOption('-max_muxing_queue_size', '1512')
                    .addOption('-bufsize', '25M')
                    .on('start', () => {
                        console.log('🚀 Conversão iniciada...');
                    })
                    .on('end', () => {
                        console.log('🎉 Conversão concluída!');
                        resolve();
                    })
                    .on('error', (err) => {
                        console.error('⚠️ Erro durante a conversão:');
                        reject(err);
                    })
                    .run();
            });
        };

        // 📂 Função para processar os arquivos embutidos
        const processFiles = async (files) => {
            if (files?.$type.includes("images#view")) {
                files.images.forEach((img, index) => {
                    const extension = getExtension(img.fullsize);
                    wh_files.push(createFileObject(img.fullsize, `${index + 1}.${extension}`, img.alt));
                });
            }
            if (files?.$type.includes("recordWithMedia#view")) {
                files.media.images.forEach((img, index) => {
                    const extension = getExtension(img.fullsize);
                    wh_files.push(createFileObject(img.fullsize, `${index + 1}.${extension}`, img.alt));
                });
            }
            if (files?.$type.includes("external#view")) {
                let externalUrl = files.external.uri;
                if (!isImageUrl(externalUrl)) externalUrl = files?.external.thumb;
                const extension = getExtension(externalUrl);
                wh_files.push(createFileObject(externalUrl, `external.${extension}`, files?.external.description));
            }
            if (files?.$type.includes("video#view")) {
                let videoCount = 1;
                const video = files;
                const outputFilePath = path.join(__dirname, `${videoCount}-${post_id}.mp4`);
                await downloadAndConvertVideo(video.playlist, outputFilePath);
                wh_files.push(createFileObject(outputFilePath, `${videoCount}-${post_id}.mp4`, video.alt));
                videoCount++;
            }
        };

        try {
            // 🚀 Processa os arquivos embutidos 
            await processFiles(files);
        } catch (err) {
            handleRateLimitError(err, 'processFiles');
        }

        // 📤 Envia o webhook com os arquivos e o embed para ambos os webhooks
        await Promise.all([
            webhookClient_1.send({
                content: `<@&1282578310383145024>`,
                username: wh_username,
                avatarURL: wh_avatarURL,
                files: wh_files,
                embeds: [WH_Embed],
            }),
            webhookClient_2.send({
                content: `<@&1334158343572553748>`,
                username: wh_username,
                avatarURL: wh_avatarURL,
                files: wh_files,
                embeds: [WH_Embed],
            })
        ]);

        // 🗑️ Remove o arquivo após o envio
        wh_files.forEach(file => {
            if (fs.existsSync(file.attachment)) {
                fs.unlinkSync(file.attachment);
            }
        });

        console.log(`📌 Repostado de ${target.author.handle}:\n🌱 CID: ${target.cid}\n🔄🔗 ${link}\n`);

    } catch (err) {
        handleRateLimitError(err, 'sendWebhookNotification');
    }

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
        await getFollowers(token);

        const { posts } = await searchPosts(token);

        const allPosts = [...posts];
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
    if (!BLUESKY_USERNAME || !BLUESKY_PASSWORD) {
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
