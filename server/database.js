const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

const dbPath = path.join(dataDir, 'maze_lab.sqlite');
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Promisified wrappers for compatibility with async/await code
const run = (sql, params = []) => {
    return Promise.resolve().then(() => {
        const stmt = db.prepare(sql);
        return stmt.run(...params);
    });
};

const all = (sql, params = []) => {
    return Promise.resolve().then(() => {
        const stmt = db.prepare(sql);
        return stmt.all(...params);
    });
};

const get = (sql, params = []) => {
    return Promise.resolve().then(() => {
        const stmt = db.prepare(sql);
        return stmt.get(...params);
    });
};

// Initialize Tables
db.exec(`CREATE TABLE IF NOT EXISTS articles (
    -- ==================== 核心字段（所有来源通用） ====================
    id TEXT PRIMARY KEY,
    source TEXT DEFAULT 'manual',     -- 内容来源：xhs, manual, weibo, douyin 等
    source_item_id TEXT,              -- 来源平台的内容ID
    original_url TEXT,                -- 原始链接

    -- ==================== 内容字段（通用） ====================
    title TEXT,                       -- 标题
    content TEXT,                     -- 完整内容（Markdown格式，包含图片）
    content_plain TEXT,               -- 纯文本内容（无格式）
    summary TEXT,                     -- 摘要

    -- ==================== 作者信息（通用 + 平台特定） ====================
    author TEXT,                      -- 作者信息（JSON对象：{id, name, avatar}）
    user_id TEXT,                     -- 【小红书】用户ID（扁平化字段，方便查询）
    user_nickname TEXT,               -- 【小红书】用户昵称
    user_avatar TEXT,                 -- 【小红书】用户头像URL

    -- ==================== 媒体资源（通用） ====================
    media TEXT,                       -- 媒体列表（JSON数组：[{type, url_local, url_source}]）
    imageUrl TEXT,                    -- 主图URL（兼容旧代码）
    cover TEXT,                       -- 封面图URL
    cover_url TEXT,                   -- 封面图URL（兼容字段）
    images TEXT,                      -- 【小红书】图片数组（JSON格式）
    video_url TEXT,                   -- 视频URL

    -- ==================== 平台特定字段 ====================
    xsec_token TEXT,                  -- 【小红书】安全令牌
    note_type TEXT,                   -- 【小红书】笔记类型
    desc TEXT,                        -- 【小红书】笔记描述（原始内容）
    type TEXT,                        -- 【小红书】笔记类型（normal/video）

    -- ==================== 统计数据 ====================
    liked_count TEXT,                 -- 点赞数（字符串格式，如 "1.2万"）
    collected_count TEXT,             -- 收藏数
    comment_count TEXT,               -- 评论数
    share_count TEXT,                 -- 分享数

    -- ==================== 分类和标签（通用） ====================
    category TEXT,                    -- 分类
    tags TEXT,                        -- 标签列表（JSON数组）
    topics TEXT,                      -- 话题列表（JSON数组）
    tag_list TEXT,                    -- 【小红书】标签列表（JSON数组）

    -- ==================== 其他元数据 ====================
    tone TEXT DEFAULT 'Casual',       -- 内容风格
    estimatedReadTime INTEGER,        -- 预估阅读时长（秒）
    language TEXT DEFAULT 'zh',       -- 语言

    -- ==================== 时间字段 ====================
    time INTEGER,                     -- 【小红书】发布时间（Unix时间戳，秒）
    publish_time INTEGER,             -- 通用发布时间（Unix时间戳，毫秒）
    created_at INTEGER,               -- 创建/入库时间（Unix时间戳，毫秒）
    updated_at INTEGER,               -- 更新时间（Unix时间戳，毫秒）

    -- ==================== 库管理字段 ====================
    library_type TEXT DEFAULT 'personal',  -- 库类型：personal, community
    owner_id TEXT,                    -- 所有者/贡献者ID
    experiment_id TEXT,               -- 实验ID（Personal库专用，Community库为NULL）
    isPublic INTEGER DEFAULT 1,       -- 是否公开
    status TEXT DEFAULT 'active',     -- 状态：active, archived, deleted
    deletedAt INTEGER                 -- 软删除时间戳
)`);

// 表结构验证和自动迁移
const columns = db.prepare(`PRAGMA table_info(articles)`).all();
if (columns && columns.length > 0) {
    const columnNames = columns.map(row => row.name);
    console.log('[DB] ✅ articles 表已创建，包含', columns.length, '个列');

    // 自动添加缺失的列（向后兼容）
    const missingColumns = [
        { name: 'language', type: 'TEXT', default: "'zh'" },
        { name: 'publish_time', type: 'INTEGER', default: 'NULL' },
        { name: 'status', type: 'TEXT', default: "'active'" },
        { name: 'experiment_id', type: 'TEXT', default: 'NULL' }
    ];

    for (const col of missingColumns) {
        if (!columnNames.includes(col.name)) {
            try {
                const defaultClause = col.default !== 'NULL' ? `DEFAULT ${col.default}` : '';
                db.exec(`ALTER TABLE articles ADD COLUMN ${col.name} ${col.type} ${defaultClause}`);
                console.log(`[DB] ✅ 已添加缺失的列: ${col.name}`);
            } catch (e) {
                // 列可能已存在，忽略错误
                console.log(`[DB] ℹ️  列 ${col.name} 已存在`);
            }
        }
    }

    // 重新获取列信息
    const updatedColumns = db.prepare(`PRAGMA table_info(articles)`).all();
    const updatedColumnNames = updatedColumns.map(row => row.name);
    console.log('[DB] 表列 (', updatedColumns.length, '个):', updatedColumnNames.join(', '));
}

// Onboarding Questions - 冷启动问卷配置
db.exec(`CREATE TABLE IF NOT EXISTS onboarding_questions (
    id TEXT PRIMARY KEY,
    question TEXT NOT NULL,
    type TEXT NOT NULL,
    options TEXT,
    min_val INTEGER,
    max_val INTEGER,
    required INTEGER DEFAULT 1,
    sort_order INTEGER,
    category TEXT,
    active INTEGER DEFAULT 1
)`);

// User Profiles - 用户画像
db.exec(`CREATE TABLE IF NOT EXISTS user_profiles (
    userId TEXT PRIMARY KEY,
    answers TEXT,
    demographics TEXT,
    interests TEXT,
    recent_topics TEXT,
    created_at INTEGER,
    updated_at INTEGER
)`);

// Trace Runs - 流程追踪
db.exec(`CREATE TABLE IF NOT EXISTS trace_runs (
    id TEXT PRIMARY KEY,
    name TEXT,
    input TEXT,
    output TEXT,
    metadata TEXT,
    parent_run_id TEXT,
    start_time INTEGER,
    end_time INTEGER,
    status TEXT,
    error TEXT,
    trace_id TEXT,
    user_id TEXT
)`);

// Trace Steps - 流程步骤
db.exec(`CREATE TABLE IF NOT EXISTS trace_steps (
    id TEXT PRIMARY KEY,
    name TEXT,
    input TEXT,
    output TEXT,
    start_time INTEGER,
    end_time INTEGER,
    status TEXT,
    step_type TEXT,
    metadata TEXT,
    parent_run_id TEXT,
    order_index INTEGER
)`);

// Interactions - 用户交互记录
db.exec(`CREATE TABLE IF NOT EXISTS interactions (
    id TEXT PRIMARY KEY,
    userId TEXT,
    articleId TEXT,
    experimentId TEXT,
    sessionId TEXT,
    clicked INTEGER,
    dwellTime REAL,
    scrollDepth REAL,
    liked INTEGER,
    favorited INTEGER,
    comment TEXT,
    timestamp INTEGER,
    articleContext TEXT
)`);

// Sessions - 推荐会话
db.exec(`CREATE TABLE IF NOT EXISTS sessions (
    sessionId TEXT PRIMARY KEY,
    experimentId TEXT,
    strategy TEXT,
    articleIds TEXT,
    timestamp INTEGER,
    roundIndex INTEGER,
    debug TEXT
)`);

// Experiments - 实验配置
db.exec(`CREATE TABLE IF NOT EXISTS experiments (
    id TEXT PRIMARY KEY,
    userId TEXT,
    startTimestamp INTEGER,
    name TEXT,
    active INTEGER,
    customStrategyPrompt TEXT,
    customContentPrompt TEXT,
    customKeywordColdStartPrompt TEXT,
    customKeywordInteractionPrompt TEXT,
    mode TEXT DEFAULT 'solo',
    userDescription TEXT,
    stage1_custom_prompt TEXT,
    stage2_custom_prompt TEXT,
    stage3_custom_prompt TEXT,
    stage4_custom_prompt TEXT,
    recommendation_config TEXT
)`);

// 添加新列（如果不存在）- 兼容旧数据库
try { db.exec('ALTER TABLE experiments ADD COLUMN stage1_custom_prompt TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE experiments ADD COLUMN stage2_custom_prompt TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE experiments ADD COLUMN stage3_custom_prompt TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE experiments ADD COLUMN stage4_custom_prompt TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE experiments ADD COLUMN recommendation_config TEXT'); } catch (e) {}

// User Seeds - 用户种子配置
db.exec(`CREATE TABLE IF NOT EXISTS user_seeds (
    userId TEXT PRIMARY KEY,
    articleIds TEXT
)`);

// Global Config - 全局配置
db.exec(`CREATE TABLE IF NOT EXISTS global_config (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at INTEGER
)`);

// Create indexes for better query performance
db.exec(`CREATE INDEX IF NOT EXISTS idx_articles_experiment ON articles(experiment_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_interactions_user ON interactions(userId)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_interactions_article ON interactions(articleId)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_interactions_experiment ON interactions(experimentId)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_interactions_session ON interactions(sessionId)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_experiment ON sessions(experimentId)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_experiments_user ON experiments(userId)`);

console.log('[DB] ✅ 所有表结构初始化完成 (better-sqlite3)');

module.exports = { db, run, all, get };
