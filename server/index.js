const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch'); 
const { run, all, get } = require('./database');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.NODE_ENV === 'production' ? 5000 : 3001;
const HOST = process.env.REPLIT_DEV_DOMAIN || `localhost:${PORT}`;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check endpoint for deployment
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

// Serve static frontend build in production
if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, '../dist');
    app.use(express.static(distPath));
}

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

// --- ONBOARDING QUESTIONS API ---
app.get('/api/onboarding/questions', async (req, res) => {
    try {
        const rows = await all('SELECT * FROM onboarding_questions WHERE active = 1 ORDER BY sort_order ASC');
        res.json(rows.map(r => ({
            ...r,
            options: r.options ? JSON.parse(r.options) : null,
            required: !!r.required
        })));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/onboarding/questions', async (req, res) => {
    const q = req.body;
    try {
        await run(`INSERT OR REPLACE INTO onboarding_questions 
            (id, question, type, options, min_val, max_val, required, sort_order, category, active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [q.id, q.question, q.type, JSON.stringify(q.options || []), q.min, q.max, 
             q.required ? 1 : 0, q.order, q.category, 1]
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/onboarding/questions/:id', async (req, res) => {
    try {
        await run('UPDATE onboarding_questions SET active = 0 WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- USER PROFILES API ---
app.get('/api/user-profile/:userId', async (req, res) => {
    try {
        const row = await get('SELECT * FROM user_profiles WHERE userId = ?', [req.params.userId]);
        if (!row) return res.json(null);
        res.json({
            ...row,
            answers: JSON.parse(row.answers || '{}'),
            demographics: JSON.parse(row.demographics || '{}'),
            interests: JSON.parse(row.interests || '[]'),
            recent_topics: JSON.parse(row.recent_topics || '[]')
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/user-profile', async (req, res) => {
    const p = req.body;
    try {
        const now = Date.now();
        await run(`INSERT OR REPLACE INTO user_profiles 
            (userId, answers, demographics, interests, recent_topics, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM user_profiles WHERE userId = ?), ?), ?)`,
            [p.userId, JSON.stringify(p.answers || {}), JSON.stringify(p.demographics || {}),
             JSON.stringify(p.interests || []), JSON.stringify(p.recent_topics || []),
             p.userId, now, now]
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- TRACE API ---
app.get('/api/trace/:runId', async (req, res) => {
    try {
        const run_data = await get('SELECT * FROM trace_runs WHERE id = ?', [req.params.runId]);
        if (!run_data) return res.json(null);
        const steps = await all('SELECT * FROM trace_steps WHERE run_id = ? ORDER BY started_at ASC', [req.params.runId]);
        res.json({
            ...run_data,
            steps: steps.map(s => ({
                ...s,
                input: s.input ? JSON.parse(s.input) : null,
                output: s.output ? JSON.parse(s.output) : null
            }))
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/trace/run', async (req, res) => {
    const r = req.body;
    try {
        await run(`INSERT INTO trace_runs (id, experiment_id, user_id, type, status, started_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [r.id, r.experiment_id, r.user_id, r.type, 'running', Date.now()]
        );
        res.json({ success: true, id: r.id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/trace/step', async (req, res) => {
    const s = req.body;
    try {
        await run(`INSERT INTO trace_steps (id, run_id, step_name, status, started_at, input)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [s.id, s.run_id, s.step_name, 'running', Date.now(), JSON.stringify(s.input || null)]
        );
        res.json({ success: true, id: s.id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/trace/step/:id', async (req, res) => {
    const { status, output, error } = req.body;
    try {
        const now = Date.now();
        const step = await get('SELECT started_at FROM trace_steps WHERE id = ?', [req.params.id]);
        const duration = step ? now - step.started_at : 0;
        await run(`UPDATE trace_steps SET status = ?, ended_at = ?, duration_ms = ?, output = ?, error = ? WHERE id = ?`,
            [status, now, duration, JSON.stringify(output || null), error || null, req.params.id]
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/trace/run/:id', async (req, res) => {
    const { status } = req.body;
    try {
        await run(`UPDATE trace_runs SET status = ?, ended_at = ? WHERE id = ?`,
            [status, Date.now(), req.params.id]
        );
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

// --- MCP PROXY ENDPOINTS (Streamable HTTP Transport 2025-03-26) ---

// POST proxy for MCP JSON-RPC requests
app.post('/api/mcp/proxy', async (req, res) => {
    const { targetUrl, sessionId, payload } = req.body;
    
    if (!targetUrl) {
        return res.status(400).json({ error: 'targetUrl required' });
    }

    console.log(`[MCP Proxy] POST to: ${targetUrl}, method: ${payload?.method}`);

    try {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'ngrok-skip-browser-warning': 'true'
        };
        
        if (sessionId) {
            headers['Mcp-Session-Id'] = sessionId;
        }

        const response = await fetch(targetUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        // Forward session ID header if present
        const mcpSessionId = response.headers.get('mcp-session-id');
        if (mcpSessionId) {
            res.setHeader('Mcp-Session-Id', mcpSessionId);
        }

        const contentType = response.headers.get('content-type') || '';
        
        if (!response.ok) {
            const errText = await response.text().catch(() => 'Unknown error');
            console.error(`[MCP Proxy] Error ${response.status}: ${errText}`);
            return res.status(response.status).send(errText);
        }

        if (contentType.includes('text/event-stream')) {
            // Stream SSE response
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders();

            response.body.on('data', (chunk) => res.write(chunk));
            response.body.on('end', () => res.end());
            response.body.on('error', (err) => {
                console.error('[MCP Proxy] Stream error:', err.message);
                res.end();
            });
            req.on('close', () => response.body.destroy());
        } else {
            // JSON response
            const text = await response.text();
            res.setHeader('Content-Type', 'application/json');
            
            // Include session ID in response body if available
            if (mcpSessionId) {
                try {
                    const json = JSON.parse(text);
                    json.sessionId = mcpSessionId;
                    res.send(JSON.stringify(json));
                } catch (e) {
                    res.send(text);
                }
            } else {
                res.send(text);
            }
        }

    } catch (e) {
        console.error('[MCP Proxy] Error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// 构建绕过防盗链的请求头
function buildImageHeaders(url) {
    const urlObj = new URL(url);
    const origin = urlObj.origin;
    
    // 小红书特殊处理
    const isXHS = url.includes('xhscdn.com') || url.includes('xiaohongshu');
    
    return {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': isXHS ? 'https://www.xiaohongshu.com/' : origin,
        'Origin': isXHS ? 'https://www.xiaohongshu.com' : origin,
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'image',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'cross-site',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
    };
}

// Image Proxy - 下载外部图片并返回，解决跨域和防盗链问题
app.get('/api/image-proxy', async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) {
            return res.status(400).json({ error: 'Missing url parameter' });
        }

        console.log('[Image Proxy] Fetching:', url);
        
        const headers = buildImageHeaders(url);
        const response = await fetch(url, { headers });

        if (!response.ok) {
            console.error('[Image Proxy] Failed:', response.status);
            return res.status(response.status).json({ error: `Failed to fetch image: ${response.status}` });
        }

        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const buffer = await response.buffer();

        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache 1 day
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(buffer);
        
    } catch (e) {
        console.error('[Image Proxy] Error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// Image Download - 下载外部图片并保存到服务器
app.post('/api/image-download', async (req, res) => {
    try {
        const { url, filename } = req.body;
        if (!url) {
            return res.status(400).json({ error: 'Missing url' });
        }

        console.log('[Image Download] Downloading:', url);
        
        const headers = buildImageHeaders(url);
        const response = await fetch(url, { headers });

        if (!response.ok) {
            console.error('[Image Download] Failed:', response.status, 'for:', url);
            return res.status(response.status).json({ error: `Failed to download: ${response.status}` });
        }

        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const buffer = await response.buffer();
        
        // 生成文件名
        const ext = contentType.includes('png') ? 'png' : 
                    contentType.includes('gif') ? 'gif' : 
                    contentType.includes('webp') ? 'webp' : 'jpg';
        const savedFilename = filename || `${uuidv4()}.${ext}`;
        const filePath = path.join(uploadsDir, savedFilename);
        
        fs.writeFileSync(filePath, buffer);
        
        const savedUrl = `/uploads/${savedFilename}`;
        console.log('[Image Download] Saved to:', savedUrl);
        
        res.json({ 
            success: true, 
            url: savedUrl,
            filename: savedFilename
        });
        
    } catch (e) {
        console.error('[Image Download] Error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// --- XHS CRAWLER PROXY ENDPOINTS ---
const CRAWLER_URL = 'http://localhost:8000';

// XHS Crawler health check
app.get('/api/xhs/health', async (req, res) => {
    try {
        const response = await fetch(`${CRAWLER_URL}/health`);
        const data = await response.json();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: 'Crawler service not available', detail: e.message });
    }
});

// Set XHS cookies
app.post('/api/xhs/set-cookies', async (req, res) => {
    try {
        const response = await fetch(`${CRAWLER_URL}/set-cookies`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// XHS search notes
app.post('/api/xhs/search', async (req, res) => {
    try {
        const response = await fetch(`${CRAWLER_URL}/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// XHS get note detail
app.post('/api/xhs/note/detail', async (req, res) => {
    try {
        const response = await fetch(`${CRAWLER_URL}/note/detail`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// XHS get note from URL
app.post('/api/xhs/note/from-url', async (req, res) => {
    try {
        const response = await fetch(`${CRAWLER_URL}/note/from-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// XHS get comments
app.post('/api/xhs/comments', async (req, res) => {
    try {
        const response = await fetch(`${CRAWLER_URL}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Catch-all route for SPA in production
if (process.env.NODE_ENV === 'production') {
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../dist/index.html'));
    });
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
});