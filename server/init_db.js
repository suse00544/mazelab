/**
 * Database Initialization Script
 *
 * Usage: node server/init_db.js
 *
 * This script creates a fresh database with all tables.
 * WARNING: This will DELETE the existing database!
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

const dbPath = path.join(dataDir, 'maze_lab.sqlite');

// Check if database exists
if (fs.existsSync(dbPath)) {
    console.log('');
    console.log('⚠️  警告: 数据库文件已存在');
    console.log('   如果继续，将会删除现有数据库！');
    console.log('   数据库路径:', dbPath);
    console.log('');
    console.log('   如果要继续，请运行: node server/init_db.js --force');
    console.log('   如果只想添加缺失的列，数据库启动时会自动迁移');
    console.log('');

    if (!process.argv.includes('--force')) {
        process.exit(0);
    }

    console.log('🗑️  正在删除旧数据库...');
    fs.unlinkSync(dbPath);

    // Also remove WAL files if they exist
    const walPath = dbPath + '-wal';
    const shmPath = dbPath + '-shm';
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

    console.log('✅ 已删除旧数据库文件');
}

console.log('');
console.log('🔄 正在创建新数据库...');

const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create all tables
console.log('');
console.log('📋 创建表结构...');

// Articles - 标准化内容 Schema（兼容小红书爬虫数据）
db.exec(`CREATE TABLE articles (
    -- 核心字段（所有来源通用）
    id TEXT PRIMARY KEY,
    source TEXT DEFAULT 'manual',
    source_item_id TEXT,
    original_url TEXT,

    -- 内容字段（通用）
    title TEXT,
    content TEXT,
    content_plain TEXT,
    summary TEXT,

    -- 作者信息（通用 + 平台特定）
    author TEXT,
    user_id TEXT,
    user_nickname TEXT,
    user_avatar TEXT,

    -- 媒体资源（通用）
    media TEXT,
    imageUrl TEXT,
    cover TEXT,
    cover_url TEXT,
    images TEXT,
    video_url TEXT,

    -- 平台特定字段
    xsec_token TEXT,
    note_type TEXT,
    desc TEXT,
    type TEXT,

    -- 统计数据
    liked_count TEXT,
    collected_count TEXT,
    comment_count TEXT,
    share_count TEXT,

    -- 分类和标签（通用）
    category TEXT,
    tags TEXT,
    topics TEXT,
    tag_list TEXT,

    -- 其他元数据
    tone TEXT DEFAULT 'Casual',
    estimatedReadTime INTEGER,
    language TEXT DEFAULT 'zh',

    -- 时间字段
    time INTEGER,
    publish_time INTEGER,
    created_at INTEGER,
    updated_at INTEGER,

    -- 库管理字段
    library_type TEXT DEFAULT 'personal',
    owner_id TEXT,
    experiment_id TEXT,
    isPublic INTEGER DEFAULT 1,
    status TEXT DEFAULT 'active',
    deletedAt INTEGER
)`);
console.log('✅ articles 表创建成功');

// Onboarding Questions - 冷启动问卷配置
db.exec(`CREATE TABLE onboarding_questions (
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
console.log('✅ onboarding_questions 表创建成功');

// User Profiles - 用户画像
db.exec(`CREATE TABLE user_profiles (
    userId TEXT PRIMARY KEY,
    answers TEXT,
    demographics TEXT,
    interests TEXT,
    recent_topics TEXT,
    created_at INTEGER,
    updated_at INTEGER
)`);
console.log('✅ user_profiles 表创建成功');

// Trace Runs - 流程追踪
db.exec(`CREATE TABLE trace_runs (
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
console.log('✅ trace_runs 表创建成功');

// Trace Steps - 流程步骤
db.exec(`CREATE TABLE trace_steps (
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
console.log('✅ trace_steps 表创建成功');

// Interactions - 用户交互记录
db.exec(`CREATE TABLE interactions (
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
console.log('✅ interactions 表创建成功');

// Sessions - 推荐会话
db.exec(`CREATE TABLE sessions (
    sessionId TEXT PRIMARY KEY,
    experimentId TEXT,
    strategy TEXT,
    articleIds TEXT,
    timestamp INTEGER,
    roundIndex INTEGER,
    debug TEXT
)`);
console.log('✅ sessions 表创建成功');

// Experiments - 实验配置
db.exec(`CREATE TABLE experiments (
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
console.log('✅ experiments 表创建成功');

// User Seeds - 用户种子配置
db.exec(`CREATE TABLE user_seeds (
    userId TEXT PRIMARY KEY,
    articleIds TEXT
)`);
console.log('✅ user_seeds 表创建成功');

// Global Config - 全局配置
db.exec(`CREATE TABLE global_config (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at INTEGER
)`);
console.log('✅ global_config 表创建成功');

// Create indexes for better query performance
console.log('');
console.log('🔍 创建索引...');

db.exec(`CREATE INDEX IF NOT EXISTS idx_articles_experiment ON articles(experiment_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_interactions_user ON interactions(userId)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_interactions_article ON interactions(articleId)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_interactions_experiment ON interactions(experimentId)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_interactions_session ON interactions(sessionId)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_experiment ON sessions(experimentId)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_experiments_user ON experiments(userId)`);

console.log('✅ 索引创建完成');

// Verify table structure
console.log('');
console.log('📊 验证表结构...');

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log('   已创建的表:', tables.map(t => t.name).join(', '));

const articleColumns = db.prepare('PRAGMA table_info(articles)').all();
console.log('   articles 表列数:', articleColumns.length);

// Close database
db.close();

console.log('');
console.log('🎉 数据库初始化完成！');
console.log('   数据库路径:', dbPath);
console.log('');
