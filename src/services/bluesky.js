require('../config/dotenv.js');
const axios = require('axios');
const { API_URL, TG, MAX_REQUESTS_PER_HOUR, MAX_REQUESTS_PER_EXECUTION, cronMinutes, MAX_POINTS_PER_HOUR, embedColor, bannerURL, avatarURL, webhookUsername, MAX_REQUESTS_DAILY } = require('../config/config');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, WebhookClient, EmbedBuilder } = require('discord.js');

const webhookClient = new WebhookClient({ id: process.env.WH_ID, token: process.env.WH_TOKEN });

const fs = require('fs');
const stateFilePath = './state.json';

function loadState() {
    if (fs.existsSync(stateFilePath)) {
        const rawData = fs.readFileSync(stateFilePath);
        return JSON.parse(rawData);
    }
    return {
        actionPoints: 0,
        lastHourReset: Date.now(),
        dailyRequestCount: 0,
        lastDailyReset: Date.now()
    };
}

function saveState(state) {
    fs.writeFileSync(stateFilePath, JSON.stringify(state));
}

let { actionPoints, lastHourReset, dailyRequestCount, lastDailyReset } = loadState();

async function getAccessToken() {
    try {
        if (dailyRequestCount + 1 > MAX_REQUESTS_DAILY) {
            console.log('⚠️ Daily request limit reached. Waiting...');
            return;
        }


        // 🔑 Request an access token using Bluesky credentials
        const { data } = await axios.post(`${API_URL}/com.atproto.server.createSession`, {
            identifier: process.env.BLUESKY_USERNAME,
            password: process.env.BLUESKY_PASSWORD
        });

        dailyRequestCount += 1; // ➕ Increment dailyRequestCount for createSession
        saveState({ dailyRequestCount });

        return { token: data.accessJwt, did: data.did };
    } catch (err) {
        if (err.response && err.response.data && err.response.data.error === "RateLimitExceeded") {
            console.log(`[ 🔴 ratelimit-reset in getAccessToken ] 🔗 https://hammertime.cyou?t=${err.response.headers['ratelimit-reset']}`);
            return { error: "RateLimitExceeded" };
        }
        console.error('Error getting access token:', err.message || err);
        throw err;
    }
}

async function getMentions(token) {
    try {
        // 📥 Fetch mentions from Bluesky notifications
        const { data } = await axios.get(`${API_URL}/app.bsky.notification.listNotifications`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return { mentions: data.notifications.filter(({ reason }) => reason === 'mention') };
    } catch (err) {
        console.error('Error getting mentions:', err);
        throw err;
    }
}

async function getTags(token) {
    try {
        // 🏷️ Search for posts with a specific tag
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
        console.error('Error getting tags:', err);
        throw err;
    }
}

const createRepostData = (target, did) => ({
    // 📝 Create repost data structure
    $type: 'app.bsky.feed.repost',
    repo: did,
    collection: 'app.bsky.feed.repost',
    record: {
        subject: { uri: target.uri, cid: target.cid },
        createdAt: new Date().toISOString(),
    },
});

async function repost(target, token, did) {
    try {
        if (!target.uri || !target.cid) {
            console.error('Invalid target for repost');
            return;
        }

        // 🔍 Check if the points limit has been reached
        if (actionPoints + 3 > MAX_POINTS_PER_HOUR) {
            console.log('⚠️ Points per hour limit reached. Waiting...');
            return;
        }

        // 📝 Create repost data and send repost request
        const repostData = createRepostData(target, did);

        const { data } = await axios.post(`${API_URL}/com.atproto.repo.createRecord`, repostData, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        actionPoints += 3; // ➕ Increment action points for CREATE
        saveState({ actionPoints });
        const t_uri = target.uri;
        const post_id = t_uri.split('/').pop();
        const link = `https://bsky.app/profile/${target.author.handle}/post/${post_id}`;

        let rtext = target.record?.text || "";
        let desc_embed = rtext.length === 0 ? "" : ` \`\`\`\n${rtext}\n\`\`\` `;

        const isoDate = target.record.createdAt;
        const unixEpochTimeInSeconds = Math.floor(new Date(isoDate).getTime() / 1000);

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setEmoji("1282450204947251263")
                    .setLabel('PUBLICAÇÃO REPOSTADA')
                    .setURL(link)
                    .setStyle(ButtonStyle.Link),
                new ButtonBuilder()
                    .setEmoji("1282709273939284093")
                    .setLabel(`${target.author.handle}`)
                    .setURL(`https://discord.discloudbot.com`)
                    .setStyle(ButtonStyle.Link),
                new ButtonBuilder()
                    .setEmoji("1282709273939284093")
                    .setLabel(`https://bsky.app/profile/@${webhookUsername}`)
                    .setURL(`https://discord.discloudbot.com`)
                    .setStyle(ButtonStyle.Link),
            );

        const WH_Embed = new EmbedBuilder()
            .setColor(embedColor)
            .setAuthor({
                content: `@bolhatech`,
                name: `${target.author.handle}`,
                iconURL: `${target.author.avatar}`,
                url: `https://bsky.app/profile/${target.author.handle}`
            })
            .setDescription(`${desc_embed}`)
            .setImage(bannerURL)
            .setTimestamp(unixEpochTimeInSeconds);

        webhookClient.send({
            username: webhookUsername,
            avatarURL: avatarURL,
            components: [row],
            embeds: [WH_Embed]
        });

        console.log(`📌 Reposted from ${target.author.handle}:\n🌱 CID: ${target.cid}\n🔄🔗 ${link}\n`);

        return { message: 'Reposted successfully', data };
    } catch (error) {
        console.error('Error reposting:', error);
        throw error;
    }
}

async function checkIfReposted(target, token) {
    try {
        // 🔍 Check if the post has already been reposted
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
    } catch (error) {
        console.error('Error checking repost status:', error);
        throw error;
    }
}

async function main() {
    try {
        if (!process.env.BLUESKY_USERNAME || !process.env.BLUESKY_PASSWORD) {
            throw new Error('Missing BLUESKY_USERNAME or BLUESKY_PASSWORD in environment variables');
        }

        // 🔄 Resetting Point Counters
        const now = Date.now();
        if (now - lastHourReset >= 3600000) { // ⏰ 1 hour in milliseconds
            actionPoints = 0;
            lastHourReset = now;
            saveState({ actionPoints, lastHourReset });
            console.log('🔄 Points reset to new time');
        }

        if (now - lastDailyReset >= 86400000) { // ⏰ 24 hours in milliseconds
            dailyRequestCount = 0;
            lastHourReset = now;
            saveState({ dailyRequestCount, lastDailyReset });
            console.log('🔄 Daily request count reset');
        }

        const startTime = new Date().toLocaleTimeString();
        console.log(`⏰ Tick executed ${startTime}`);

        const { token, did, error } = await getAccessToken();
        if (error === "RateLimitExceeded") return;

        // 📥 Fetch mentions and tags
        const { mentions } = await getMentions(token);
        const { tags } = await getTags(token);

        const allPosts = [...mentions, ...tags];
        const unrepostedPosts = [];

        // 🔍 Check each post if it has been reposted
        for (const post of allPosts) {
            const isReposted = await checkIfReposted(post, token);
            if (!isReposted) {
                unrepostedPosts.push(post);
            }
        }

        if (unrepostedPosts.length === 0) {
            console.log('⋆.˚🦋༘⋆');
            return;
        }

        const maxRepostsPerExecution = Math.min(MAX_REQUESTS_PER_EXECUTION, Math.floor(MAX_REQUESTS_PER_HOUR / (60 / cronMinutes)));
        const delayTime = Math.max((cronMinutes * 60 * 1000) / maxRepostsPerExecution, 1000);

        // 🔄 Repost all unreposted posts
        for (const post of unrepostedPosts) {
            await repost(post, token, did);
            await delay(delayTime); // ⏰ delay time
        }
    } catch (err) {
        if (err.error === "RateLimitExceeded") return console.log(`[ 🔴 ratelimit-reset ] 🔗 https://hammertime.cyou?t=${err.headers['ratelimit-reset']}`)
        else console.error('Error:', err);
        throw err;
    }
}

module.exports = {
    main
};