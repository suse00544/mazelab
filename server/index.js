const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch'); 
const { run, all, get } = require('./database');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3001;
const HOST = process.env.REPLIT_DEV_DOMAIN || 'localhost:3001';

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Static files for images
const uploadsDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// --- API ROUTES ---

// 1. ARTICLES
app.get('/api/articles', async (req, res) => {
    try {
        const rows = await all('SELECT * FROM articles ORDER BY created_at DESC');
        const articles = rows.map(r => ({
            ...r,
            tags: JSON.parse(r.tags || '[]'),
            isPublic: !!r.isPublic
        }));
        res.json(articles);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/articles', async (req, res) => {
    const a = req.body;
    try {
        await run(`INSERT OR REPLACE INTO articles (id, title, content, summary, category, tags, tone, estimatedReadTime, created_at, isPublic, ownerId, imageUrl, deletedAt) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [a.id, a.title, a.content, a.summary, a.category, JSON.stringify(a.tags), a.tone, a.estimatedReadTime, a.created_at, a.isPublic ? 1 : 0, a.ownerId, a.imageUrl, a.deletedAt]
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/articles/delete', async (req, res) => {
    try {
        await run('UPDATE articles SET deletedAt = ? WHERE id = ?', [Date.now(), req.body.id]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/articles/restore', async (req, res) => {
    try {
        await run('UPDATE articles SET deletedAt = NULL WHERE id = ?', [req.body.id]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2. INTERACTIONS
app.get('/api/interactions', async (req, res) => {
    try {
        const { experimentId } = req.query;
        let sql = 'SELECT * FROM interactions';
        let params = [];
        if (experimentId) {
            sql += ' WHERE experimentId = ? ORDER BY timestamp ASC';
            params.push(experimentId);
        }
        const rows = await all(sql, params);
        res.json(rows.map(r => ({
            ...r,
            clicked: !!r.clicked,
            liked: !!r.liked,
            favorited: !!r.favorited,
            articleContext: JSON.parse(r.articleContext || '{}')
        })));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/interactions', async (req, res) => {
    const i = req.body;
    try {
        await run(`INSERT INTO interactions (id, userId, articleId, experimentId, sessionId, clicked, dwellTime, scrollDepth, liked, favorited, comment, timestamp, articleContext)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [i.id, i.userId, i.articleId, i.experimentId, i.sessionId, i.clicked ? 1 : 0, i.dwellTime, i.scrollDepth, i.liked ? 1 : 0, i.favorited ? 1 : 0, i.comment, i.timestamp, JSON.stringify(i.articleContext)]
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 3. EXPERIMENTS & SESSIONS
app.get('/api/experiments', async (req, res) => {
    try {
        const { userId } = req.query;
        const rows = await all('SELECT * FROM experiments WHERE userId = ? ORDER BY startTimestamp DESC', [userId]);
        res.json(rows.map(r => ({ ...r, active: !!r.active })));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/experiments', async (req, res) => {
    const e = req.body;
    try {
        if (e.active) {
            await run('UPDATE experiments SET active = 0 WHERE userId = ?', [e.userId]);
        }
        await run(`INSERT OR REPLACE INTO experiments (id, userId, startTimestamp, name, active, customStrategyPrompt, customContentPrompt)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [e.id, e.userId, e.startTimestamp, e.name, e.active ? 1 : 0, e.customStrategyPrompt, e.customContentPrompt]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/sessions', async (req, res) => {
    try {
        const { experimentId } = req.query;
        const rows = await all('SELECT * FROM sessions WHERE experimentId = ? ORDER BY timestamp ASC', [experimentId]);
        
        // Hydrate articles
        const allArts = await all('SELECT * FROM articles');
        const artMap = new Map(allArts.map(a => [a.id, a]));

        const hydrated = rows.map(r => {
            const ids = JSON.parse(r.articleIds || '[]');
            const articles = ids.map(id => {
                const a = artMap.get(id);
                if (!a) return null;
                return { ...a, tags: JSON.parse(a.tags||'[]'), isPublic: !!a.isPublic };
            }).filter(Boolean);

            return {
                sessionId: r.sessionId,
                experimentId: r.experimentId,
                strategy: JSON.parse(r.strategy || 'null'),
                articles: articles,
                timestamp: r.timestamp,
                roundIndex: r.roundIndex,
                debug: JSON.parse(r.debug || 'null')
            };
        });
        
        res.json(hydrated);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/sessions', async (req, res) => {
    const s = req.body;
    try {
        const articleIds = s.articles.map(a => a.id);
        await run(`INSERT INTO sessions (sessionId, experimentId, strategy, articleIds, timestamp, roundIndex, debug)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [s.sessionId, s.experimentId, JSON.stringify(s.strategy), JSON.stringify(articleIds), s.timestamp, s.roundIndex, JSON.stringify(s.debug)]
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 4. USER SEEDS
app.get('/api/user_seeds', async (req, res) => {
    try {
        const { userId } = req.query;
        const row = await get('SELECT articleIds FROM user_seeds WHERE userId = ?', [userId]);
        res.json(row ? JSON.parse(row.articleIds) : []);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/user_seeds', async (req, res) => {
    const { userId, articleIds } = req.body;
    try {
        await run(`INSERT OR REPLACE INTO user_seeds (userId, articleIds) VALUES (?, ?)`, [userId, JSON.stringify(articleIds)]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 5. GLOBAL CONFIG
app.get('/api/config', async (req, res) => {
    try {
        const r1 = await get('SELECT value FROM global_config WHERE key = ?', ['strategyPrompt']);
        const r2 = await get('SELECT value FROM global_config WHERE key = ?', ['contentPrompt']);
        res.json({
            strategyPrompt: r1 ? r1.value : null,
            contentPrompt: r2 ? r2.value : null
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/config', async (req, res) => {
    try {
        const { strategyPrompt, contentPrompt } = req.body;
        if (strategyPrompt) await run('INSERT OR REPLACE INTO global_config (key, value) VALUES (?, ?)', ['strategyPrompt', strategyPrompt]);
        if (contentPrompt) await run('INSERT OR REPLACE INTO global_config (key, value) VALUES (?, ?)', ['contentPrompt', contentPrompt]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- JINA API ENDPOINTS ---
// Get your Jina AI API key for free: https://jina.ai/?sui=apikey
const JINA_API_KEY = process.env.JINA_API_KEY;

const downloadImage = async (url) => {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
        const buffer = await response.buffer();
        const ext = path.extname(new URL(url).pathname) || '.jpg';
        const filename = `${uuidv4()}${ext}`;
        const filePath = path.join(uploadsDir, filename);
        fs.writeFileSync(filePath, buffer);
        return `https://${HOST}/uploads/${filename}`;
    } catch (e) {
        console.error("Image download failed:", e.message);
        return null;
    }
};

// Reader API - fetch content from a single URL
app.post('/api/jina/import', async (req, res) => {
    const { url, apiKey } = req.body;
    if (!url) return res.status(400).json({ error: "URL required" });

    const token = apiKey || JINA_API_KEY;
    if (!token) return res.status(400).json({ error: "Jina API Key required" });

    try {
        const jinaRes = await fetch('https://r.jina.ai/', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Return-Format': 'markdown'
            },
            body: JSON.stringify({ url })
        });
        
        if (!jinaRes.ok) {
            const errText = await jinaRes.text();
            throw new Error(`Jina API Error: ${jinaRes.status} - ${errText}`);
        }
        
        const json = await jinaRes.json();
        const data = json.data || {};
        
        let content = data.content || '';
        let coverImageUrl = null;
        
        // Extract First Image from markdown
        const imgRegex = /!\[.*?\]\((.*?)\)/;
        const match = content.match(imgRegex);
        if (match && match[1]) {
            const localUrl = await downloadImage(match[1]);
            if (localUrl) coverImageUrl = localUrl;
        }

        res.json({
            title: data.title || 'Untitled',
            content: content,
            coverImageUrl: coverImageUrl, 
            url: data.url || url
        });

    } catch (e) {
        console.error("Jina Reader Error:", e.message, e.stack);
        res.status(500).json({ error: e.message || 'Unknown error occurred' });
    }
});

// Search API - search and get results
app.post('/api/jina/search', async (req, res) => {
    const { query, apiKey, num, page } = req.body;
    if (!query) return res.status(400).json({ error: "Query required" });

    const token = apiKey || JINA_API_KEY;
    if (!token) return res.status(400).json({ error: "Jina API Key required" });

    try {
        const searchBody = { q: query };
        if (num) searchBody.num = num;
        if (page) searchBody.page = page;
        
        const jinaRes = await fetch('https://s.jina.ai/', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(searchBody)
        });
        
        if (!jinaRes.ok) {
            const errText = await jinaRes.text();
            throw new Error(`Jina Search Error: ${jinaRes.status} - ${errText}`);
        }
        
        const json = await jinaRes.json();
        res.json(json);

    } catch (e) {
        console.error("Jina Search Error:", e.message);
        res.status(500).json({ error: e.message });
    }
});

// --- MCP PROXY ENDPOINTS ---
// SSE proxy for MCP connections (bypasses CORS)
app.get('/api/mcp/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).json({ error: 'URL required' });
    }

    console.log(`[MCP Proxy] SSE connection to: ${targetUrl}`);

    try {
        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'Accept': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'ngrok-skip-browser-warning': 'true'
            }
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => 'Unknown error');
            console.error(`[MCP Proxy] HTTP Error: ${response.status}`);
            return res.status(response.status).json({ error: errText });
        }

        // Set SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        // Stream the response
        response.body.on('data', (chunk) => {
            res.write(chunk);
        });

        response.body.on('end', () => {
            console.log('[MCP Proxy] Stream ended');
            res.end();
        });

        response.body.on('error', (err) => {
            console.error('[MCP Proxy] Stream error:', err.message);
            res.end();
        });

        req.on('close', () => {
            console.log('[MCP Proxy] Client disconnected');
            response.body.destroy();
        });

    } catch (e) {
        console.error('[MCP Proxy] Connection error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// POST proxy for MCP JSON-RPC requests
app.post('/api/mcp/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).json({ error: 'URL required' });
    }

    console.log(`[MCP Proxy] POST to: ${targetUrl}`);

    try {
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true'
            },
            body: JSON.stringify(req.body)
        });

        const text = await response.text();
        
        if (!response.ok) {
            console.error(`[MCP Proxy] POST Error: ${response.status}`);
            return res.status(response.status).send(text);
        }

        res.setHeader('Content-Type', 'application/json');
        res.send(text);

    } catch (e) {
        console.error('[MCP Proxy] POST error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});