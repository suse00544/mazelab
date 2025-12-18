const path = require('path');

// 加载环境变量
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const express = require('express');
const cors = require('cors');
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

// 1. ARTICLES - 完全按照小红书爬虫字段
app.get('/api/articles', async (req, res) => {
    try {
        const { library_type, owner_id, contributor, experiment_id } = req.query;

        console.log('[Server] GET /api/articles query params:', { library_type, owner_id, experiment_id });

        // 构建WHERE子句
        let whereClause = '';
        let params = [];

        if (library_type) {
            whereClause = 'WHERE library_type = ?';
            params.push(library_type);

            // 如果是个人库，需要指定owner_id和experiment_id（强制要求）
            if (library_type === 'personal' && owner_id) {
                whereClause += ' AND owner_id = ?';
                params.push(owner_id);

                // Personal库必须指定experiment_id，否则返回空
                if (experiment_id && experiment_id !== 'undefined' && experiment_id !== 'null') {
                    whereClause += ' AND experiment_id = ?';
                    params.push(experiment_id);
                } else {
                    // 如果没有指定experiment_id，添加一个永远为false的条件，返回空结果
                    console.log('[Server] No valid experiment_id provided, returning empty result');
                    whereClause += ' AND 1 = 0';
                }
            }

            // 如果是社区库，可以按贡献者过滤
            if (library_type === 'community' && contributor) {
                whereClause += ' AND owner_id = ?';
                params.push(contributor);
            }
        } else if (owner_id) {
            // 只指定owner_id，查询该用户的所有内容
            whereClause = 'WHERE owner_id = ?';
            params.push(owner_id);
        }

        const sql = `SELECT * FROM articles ${whereClause} ORDER BY created_at DESC`;
        console.log('[Server] SQL:', sql, 'Params:', params);
        const rows = await all(sql, params);
        console.log('[Server] Found', rows.length, 'articles');

        const articles = rows.map(r => {
            // 解析 JSON 字段
            const images = r.images ? JSON.parse(r.images) : [];
            const tag_list = r.tag_list ? JSON.parse(r.tag_list) : [];
            const tags = r.tags ? JSON.parse(r.tags) : [];

            // 构建 media 数组（前端 ContentDetailCard 需要）
            let media = r.media ? JSON.parse(r.media) : [];
            if (media.length === 0 && images.length > 0) {
                media = images.map((url, index) => ({
                    type: 'image',
                    url_local: url,
                    order: index
                }));
            }

            // 构建 metrics 对象（前端 ContentDetailCard 需要）
            const metrics = {
                likes: parseInt(r.liked_count) || 0,
                favorites: parseInt(r.collected_count) || 0,
                comments: parseInt(r.comment_count) || 0,
                shares: parseInt(r.share_count) || 0
            };

            // 字段映射：新字段 -> 旧字段（兼容前端）
            return {
                ...r,
                images,
                tag_list,
                tags: tags.length > 0 ? tags : tag_list,
                media,
                metrics,
                // 封面图映射
                imageUrl: r.imageUrl || r.cover || (images.length > 0 ? images[0] : null),
                cover_url: r.cover_url || r.cover,
                // 内容映射
                content: r.content || r.desc || '',
                summary: r.summary || (r.desc ? r.desc.substring(0, 100) : ''),
                // 作者映射
                author: r.author ? (typeof r.author === 'string' ? JSON.parse(r.author) : r.author) : {
                    id: r.user_id || r.ownerId || '',
                    name: r.user_nickname || '',
                    avatar: r.user_avatar || ''
                },
                // 时间映射
                publish_time: r.time ? r.time : r.created_at
            };
        });
        res.json(articles);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/articles', async (req, res) => {
    const a = req.body;
    try {
        console.log('[Server] 接收到的文章数据 keys:', Object.keys(a || {}));

        // 构建参数数组，支持完整的多源内容字段
        const params = [
            // 核心字段
            a.id || `article-${Date.now()}`,
            a.source || 'manual',
            a.source_item_id || '',
            a.original_url || '',

            // 内容字段（通用）
            a.title || '',
            a.content || '',
            a.content_plain || '',
            a.summary || '',

            // 作者信息（通用 + 平台特定）
            JSON.stringify(a.author || {}),
            a.user_id || '',
            a.user_nickname || '',
            a.user_avatar || '',

            // 媒体资源
            JSON.stringify(Array.isArray(a.media) ? a.media : []),
            a.imageUrl || '',
            typeof a.cover === 'string' ? a.cover : '',
            typeof a.cover_url === 'string' ? a.cover_url : '',
            JSON.stringify(Array.isArray(a.images) ? a.images : []),
            a.video_url || '',

            // 平台特定字段
            a.xsec_token || '',
            a.note_type || '',
            a.desc || '',
            a.type || 'normal',

            // 统计数据
            a.liked_count || '0',
            a.collected_count || '0',
            a.comment_count || '0',
            a.share_count || '0',

            // 分类和标签
            a.category || '',
            JSON.stringify(Array.isArray(a.tags) ? a.tags : []),
            JSON.stringify(Array.isArray(a.topics) ? a.topics : []),
            JSON.stringify(Array.isArray(a.tag_list) ? a.tag_list : []),

            // 其他元数据
            a.tone || 'Casual',
            a.estimatedReadTime || 60,
            a.language || 'zh',

            // 时间字段
            a.time || 0,
            a.publish_time || a.created_at || Date.now(),
            a.created_at || Date.now(),
            Date.now(), // updated_at

            // 库管理字段
            a.library_type || 'personal',
            a.owner_id || null,
            a.experiment_id || null,
            a.isPublic ? 1 : 0,
            a.status || 'active',
            a.deletedAt || null
        ];

        console.log('[Server] 参数数组长度:', params.length);

        // 完整的 INSERT 语句，支持所有字段
        await run(`INSERT OR REPLACE INTO articles
            (id, source, source_item_id, original_url,
             title, content, content_plain, summary,
             author, user_id, user_nickname, user_avatar,
             media, imageUrl, cover, cover_url, images, video_url,
             xsec_token, note_type, desc, type,
             liked_count, collected_count, comment_count, share_count,
             category, tags, topics, tag_list,
             tone, estimatedReadTime, language,
             time, publish_time, created_at, updated_at,
             library_type, owner_id, experiment_id, isPublic, status, deletedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            params
        );
        console.log('[Server] ✅ 文章保存成功:', a.id);
        res.json({ success: true });
    } catch (e) {
        console.error('[Server] ❌ Save article error:', e.message);
        console.error('[Server] Error stack:', e.stack);
        console.error('[Server] Article data keys:', Object.keys(a || {}));
        console.error('[Server] Article data (first 500 chars):', JSON.stringify(a || {}).substring(0, 500));
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

app.post('/api/articles/clear-personal', async (req, res) => {
    try {
        const { userId, experimentId } = req.body;
        if (!userId || !experimentId) {
            return res.status(400).json({ error: 'userId and experimentId are required' });
        }
        await run(
            'DELETE FROM articles WHERE library_type = ? AND owner_id = ? AND experiment_id = ?',
            ['personal', userId, experimentId]
        );
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
        res.json(rows.map(r => ({
            ...r,
            active: !!r.active,
            recommendation_config: r.recommendation_config ? JSON.parse(r.recommendation_config) : null
        })));
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
        await run(`INSERT OR REPLACE INTO experiments (
            id, userId, startTimestamp, name, active,
            customStrategyPrompt, customContentPrompt,
            customKeywordColdStartPrompt, customKeywordInteractionPrompt,
            mode, userDescription,
            stage1_custom_prompt, stage2_custom_prompt, stage3_custom_prompt, stage4_custom_prompt,
            recommendation_config
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                e.id, e.userId, e.startTimestamp, e.name, e.active ? 1 : 0,
                e.customStrategyPrompt, e.customContentPrompt,
                e.customKeywordColdStartPrompt || null, e.customKeywordInteractionPrompt || null,
                e.mode || 'solo', e.userDescription || null,
                e.stage1_custom_prompt || null, e.stage2_custom_prompt || null,
                e.stage3_custom_prompt || null, e.stage4_custom_prompt || null,
                e.recommendation_config ? JSON.stringify(e.recommendation_config) : null
            ]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 删除实验（同时删除关联的个人库文章、会话、交互记录）
app.delete('/api/experiments/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // 删除该实验的个人库文章
        await run('DELETE FROM articles WHERE experiment_id = ?', [id]);
        // 删除该实验的会话记录
        await run('DELETE FROM sessions WHERE experimentId = ?', [id]);
        // 删除该实验的交互记录
        await run('DELETE FROM interactions WHERE experimentId = ?', [id]);
        // 删除实验本身
        await run('DELETE FROM experiments WHERE id = ?', [id]);

        console.log('[Server] Deleted experiment and related data:', id);
        res.json({ success: true });
    } catch (err) {
        console.error('[Server] Delete experiment error:', err.message);
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

                // 解析 JSON 字段（与 /api/articles 保持一致）
                const images = a.images ? JSON.parse(a.images) : [];
                const tag_list = a.tag_list ? JSON.parse(a.tag_list) : [];
                const tags = a.tags ? JSON.parse(a.tags) : [];

                // 构建 media 数组
                let media = a.media ? JSON.parse(a.media) : [];
                if (media.length === 0 && images.length > 0) {
                    media = images.map((url, index) => ({
                        type: 'image',
                        url_local: url,
                        order: index
                    }));
                }

                // 构建 metrics 对象
                const metrics = {
                    likes: parseInt(a.liked_count) || 0,
                    favorites: parseInt(a.collected_count) || 0,
                    comments: parseInt(a.comment_count) || 0,
                    shares: parseInt(a.share_count) || 0
                };

                return {
                    ...a,
                    images,
                    tag_list,
                    tags: tags.length > 0 ? tags : tag_list,
                    media,
                    metrics,
                    imageUrl: a.imageUrl || a.cover || (images.length > 0 ? images[0] : null),
                    cover_url: a.cover_url || a.cover,
                    content: a.content || a.desc || '',
                    summary: a.summary || (a.desc ? a.desc.substring(0, 100) : ''),
                    author: a.author ? (typeof a.author === 'string' ? JSON.parse(a.author) : a.author) : {
                        id: a.user_id || a.ownerId || '',
                        name: a.user_nickname || '',
                        avatar: a.user_avatar || ''
                    },
                    publish_time: a.time ? a.time : a.created_at,
                    isPublic: !!a.isPublic
                };
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

app.get('/api/admin/onboarding/questions', async (req, res) => {
    try {
        const rows = await all('SELECT * FROM onboarding_questions ORDER BY sort_order ASC');
        res.json(rows.map(r => ({
            id: r.id,
            question: r.question,
            type: r.type,
            options: r.options ? JSON.parse(r.options) : [],
            required: !!r.required,
            order: r.sort_order,
            category: r.category,
            active: !!r.active
        })));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/admin/onboarding/questions', async (req, res) => {
    const q = req.body;
    try {
        await run(`INSERT OR REPLACE INTO onboarding_questions 
            (id, question, type, options, min_val, max_val, required, sort_order, category, active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [q.id, q.question, q.type, JSON.stringify(q.options || []), q.min || null, q.max || null, 
             q.required ? 1 : 0, q.order, q.category, q.active !== false ? 1 : 0]
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/admin/onboarding/questions/:id', async (req, res) => {
    const q = req.body;
    try {
        await run(`UPDATE onboarding_questions SET 
            question = ?, type = ?, options = ?, min_val = ?, max_val = ?, required = ?, sort_order = ?, category = ?, active = ?
            WHERE id = ?`,
            [q.question, q.type, JSON.stringify(q.options || []), q.min || null, q.max || null, 
             q.required ? 1 : 0, q.order, q.category, q.active !== false ? 1 : 0, req.params.id]
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/admin/onboarding/questions/:id', async (req, res) => {
    try {
        await run('DELETE FROM onboarding_questions WHERE id = ?', [req.params.id]);
        res.json({ success: true });
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
             q.required ? 1 : 0, q.order, q.category, q.active !== false ? 1 : 0]
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/onboarding/questions/:id', async (req, res) => {
    const q = req.body;
    try {
        await run(`UPDATE onboarding_questions SET 
            question = ?, type = ?, options = ?, required = ?, sort_order = ?, category = ?, active = ?
            WHERE id = ?`,
            [q.question, q.type, JSON.stringify(q.options || []), q.required ? 1 : 0, 
             q.order, q.category, q.active !== false ? 1 : 0, req.params.id]
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/onboarding/questions/:id', async (req, res) => {
    try {
        await run('DELETE FROM onboarding_questions WHERE id = ?', [req.params.id]);
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

// --- GEMINI AI ENDPOINTS ---
app.post('/api/ai/generate-keywords', async (req, res) => {
    const { profile, model, apiKey: clientApiKey } = req.body;
    // 优先使用客户端传递的 API key，否则使用环境变量
    const apiKey = clientApiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
    }
    
    const prompt = `你是一个内容推荐系统的关键词生成器。根据用户画像，生成10个小红书搜索关键词。

用户画像：
- 性别: ${profile.demographics?.gender || '未知'}
- 年龄段: ${profile.demographics?.age_range || '未知'}
- 兴趣领域: ${(profile.interests || []).join(', ') || '未指定'}
- 最近感兴趣的话题: ${(profile.recent_topics || []).join(', ') || '未指定'}
- 问卷回答: ${JSON.stringify(profile.answers || {})}

要求：
1. 生成10个搜索关键词
2. 关键词要具体、可搜索，能找到高质量内容
3. 覆盖用户的主要兴趣领域
4. 包含一些探索性关键词（用户可能感兴趣但未明确表达的）
5. 关键词长度适中（2-6个字）

请按以下JSON格式返回：
{
  "keywords": ["关键词1", "关键词2", ...],
  "reasoning": "简要说明生成这些关键词的理由"
}`;

    try {
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: model || 'gemini-2.0-flash',
            contents: prompt
        });

        const text = response.text || '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return res.status(500).json({ error: '无法解析关键词响应' });
        }

        const result = JSON.parse(jsonMatch[0]);
        res.json(result);
    } catch (e) {
        console.error('[AI] Keyword generation error:', e.message);
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

// XHS Cookie status check
app.get('/api/xhs/cookie-status', async (req, res) => {
    try {
        const response = await fetch(`${CRAWLER_URL}/cookie-status`);
        const data = await response.json();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// XHS Clear cookies cache
app.post('/api/xhs/clear-cookies', async (req, res) => {
    try {
        const response = await fetch(`${CRAWLER_URL}/clear-cookies`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
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
        
        // 检查响应状态
        if (!response.ok) {
            const errorText = await response.text();
            try {
                const errorJson = JSON.parse(errorText);
                return res.status(response.status).json({ error: errorJson.detail || errorJson.message || 'Request failed' });
            } catch {
                return res.status(response.status).json({ error: errorText || 'Request failed' });
            }
        }
        
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            console.log('[Server] XHS Search response:', JSON.stringify(data, null, 2).substring(0, 500));
            res.json(data);
        } else {
            const text = await response.text();
            console.error('[Server] XHS Search non-JSON response:', text.substring(0, 200));
            res.status(500).json({ error: 'Invalid response format from crawler service' });
        }
    } catch (e) {
        console.error('[Server] XHS Search error:', e);
        res.status(500).json({ error: e.message || 'Failed to search notes' });
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

// XHS get comments (支持二级评论)
app.post('/api/xhs/comments', async (req, res) => {
    try {
        const response = await fetch(`${CRAWLER_URL}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });

        // 处理 Cookie 失效错误 (401)
        if (response.status === 401) {
            const data = await response.json();
            return res.status(401).json({
                error: 'COOKIE_EXPIRED',
                message: data.detail?.message || 'Cookie已失效，请重新设置'
            });
        }

        if (!response.ok) {
            const errorText = await response.text();
            return res.status(response.status).json({ error: errorText || 'Request failed' });
        }

        const data = await response.json();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// XHS get notes by IDs (批量获取)
app.post('/api/xhs/notes/by-ids', async (req, res) => {
    try {
        const response = await fetch(`${CRAWLER_URL}/notes/by-ids`, {
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

// XHS get notes from URLs (从URL批量获取)
app.post('/api/xhs/notes/from-urls', async (req, res) => {
    try {
        const response = await fetch(`${CRAWLER_URL}/notes/from-urls`, {
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

// XHS get user from URL (从URL获取用户信息和笔记)
app.post('/api/xhs/user/from-url', async (req, res) => {
    try {
        const response = await fetch(`${CRAWLER_URL}/user/from-url`, {
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

// XHS get user notes (作者主页)
app.post('/api/xhs/user/notes', async (req, res) => {
    try {
        const response = await fetch(`${CRAWLER_URL}/user/notes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });
        
        // 检查响应状态
        if (!response.ok) {
            const errorText = await response.text();
            try {
                const errorJson = JSON.parse(errorText);
                return res.status(response.status).json({ error: errorJson.detail || errorJson.message || 'Request failed' });
            } catch {
                return res.status(response.status).json({ error: errorText || 'Request failed' });
            }
        }
        
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            res.json(data);
        } else {
            const text = await response.text();
            console.error('[XHS] Non-JSON response:', text.substring(0, 200));
            res.status(500).json({ error: 'Invalid response format from crawler service' });
        }
    } catch (e) {
        console.error('[XHS] Error fetching user notes:', e);
        res.status(500).json({ error: e.message || 'Failed to fetch user notes' });
    }
});

// XHS get user info
app.post('/api/xhs/user/info', async (req, res) => {
    try {
        const response = await fetch(`${CRAWLER_URL}/user/info`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });
        
        // 检查响应状态
        if (!response.ok) {
            const errorText = await response.text();
            try {
                const errorJson = JSON.parse(errorText);
                return res.status(response.status).json({ error: errorJson.detail || errorJson.message || 'Request failed' });
            } catch {
                return res.status(response.status).json({ error: errorText || 'Request failed' });
            }
        }
        
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            res.json(data);
        } else {
            const text = await response.text();
            console.error('[XHS] Non-JSON response:', text.substring(0, 200));
            res.status(500).json({ error: 'Invalid response format from crawler service' });
        }
    } catch (e) {
        console.error('[XHS] Error fetching user info:', e);
        res.status(500).json({ error: e.message || 'Failed to fetch user info' });
    }
});

// XHS generate wordcloud
app.post('/api/xhs/wordcloud', async (req, res) => {
    try {
        const response = await fetch(`${CRAWLER_URL}/wordcloud`, {
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

// Catch-all route for SPA in production (Express 5.x syntax)
if (process.env.NODE_ENV === 'production') {
    app.get('/{*path}', (req, res) => {
        res.sendFile(path.join(__dirname, '../dist/index.html'));
    });
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
});