const { AtpAgent } = require('@atproto/api');
const dotenv = require('dotenv');
const { CronJob } = require('cron');
const axios = require('axios');

dotenv.config();

const API_URL = 'https://bsky.social/xrpc';
const TG = process.env.TAG

// 🌐 Create a Bluesky Agent
const agent = new AtpAgent({
    service: 'https://bsky.social',
});

async function getAccessToken() {
    try {
        // 🔑 Request an access token using Bluesky credentials
        const { data } = await axios.post(`${API_URL}/com.atproto.server.createSession`, {
            identifier: process.env.BLUESKY_USERNAME,
            password: process.env.BLUESKY_PASSWORD
        });
        return { token: data.accessJwt, did: data.did };
    } catch (error) {
        console.error('Error getting access token:', error);
        throw error;
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
    } catch (error) {
        console.error('Error getting mentions:', error);
        throw error;
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
    } catch (error) {
        console.error('Error getting tags:', error);
        throw error;
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

        // 🔄 Create repost data and send repost request
        const repostData = createRepostData(target, did);

        const { data } = await axios.post(`${API_URL}/com.atproto.repo.createRecord`, repostData, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        console.log(`Reposted: ${target.cid}`);
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

// ⏰ delay
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


async function main() {
    try {
        if (!process.env.BLUESKY_USERNAME || !process.env.BLUESKY_PASSWORD) {
            throw new Error('Missing BLUESKY_USERNAME or BLUESKY_PASSWORD in environment variables');
        }

        // 🔐 Log in to Bluesky and get access token
        await agent.login({ identifier: process.env.BLUESKY_USERNAME, password: process.env.BLUESKY_PASSWORD });

        const startTime = new Date().toLocaleTimeString();
        console.log(`Tick executed ${startTime}`);

        const { token, did } = await getAccessToken();

        // 📥 Fetch mentions and tags
        const { mentions } = await getMentions(token);
        const { tags } = await getTags(token);

        const allPosts = [...mentions, ...tags];
        const unrepostedPosts = [];

        // 🔄 Check each post if it has been reposted
        for (const post of allPosts) {
            const isReposted = await checkIfReposted(post, token);
            if (!isReposted) {
                unrepostedPosts.push(post);
            }
        }

        if (unrepostedPosts.length === 0) {
            console.log('No new posts to repost');
            return;
        }

        // 🔄 Repost all unreposted posts
        for (const post of unrepostedPosts) {
            await repost(post, token, did);
            await delay(1000); // delay 1 seg
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

// ⏰ Run this on a cron job
const local = '* * * * *'; // ⏰ time interval to check posts (no time) & local test
const localtime = '*/6 * * * *'; // ⏰ time interval to check posts (every 6 min)
const discloud = '*/6 * * * *'; // ⏰ time interval to check posts (every 6 min)

const job = new CronJob(local, main);

job.start();

// 🟢 Print "bot started" when the job starts
console.log(`
███████████████╗█████╗██████╗█████████████████████╗ 
██╔════╚══██╔══██╔══████╔══██╚══██╔══██╔════██╔══██╗
███████╗  ██║  █████████████╔╝  ██║  █████╗ ██║  ██║
╚════██║  ██║  ██╔══████╔══██╗  ██║  ██╔══╝ ██║  ██║
███████║  ██║  ██║  ████║  ██║  ██║  █████████████╔╝
╚══════╝  ╚═╝  ╚═╝  ╚═╚═╝  ╚═╝  ╚═╝  ╚══════╚═════╝ 
🟢 by bolhatech.pages.dev                                                                           
`);