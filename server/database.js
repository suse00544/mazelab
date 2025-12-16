const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

const dbPath = path.join(dataDir, 'maze_lab.sqlite');
const db = new sqlite3.Database(dbPath);

// Initialize Tables
db.serialize(() => {
    // Articles - 标准化内容 Schema
    db.run(`CREATE TABLE IF NOT EXISTS articles (
        id TEXT PRIMARY KEY,
        
        -- 来源信息
        source TEXT DEFAULT 'manual',
        source_item_id TEXT,
        original_url TEXT,
        
        -- 基础内容
        title TEXT,
        subtitle TEXT,
        summary TEXT,
        content TEXT,
        content_plain TEXT,
        
        -- 作者信息 (JSON)
        author TEXT,
        
        -- 媒体资源 (JSON array)
        media TEXT,
        imageUrl TEXT,
        
        -- 分类标签
        category TEXT,
        tags TEXT,
        topics TEXT,
        
        -- 元数据
        tone TEXT,
        estimatedReadTime INTEGER,
        language TEXT DEFAULT 'zh',
        
        -- 统计数据 (JSON)
        metrics TEXT,
        
        -- 时间戳
        created_at INTEGER,
        publish_time INTEGER,
        
        -- 抓取上下文 (JSON)
        crawl_context TEXT,
        
        -- 状态管理
        status TEXT DEFAULT 'active',
        isPublic INTEGER DEFAULT 1,
        ownerId TEXT,
        deletedAt INTEGER
    )`);
    
    // Onboarding Questions - 冷启动问卷配置
    db.run(`CREATE TABLE IF NOT EXISTS onboarding_questions (
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
    db.run(`CREATE TABLE IF NOT EXISTS user_profiles (
        userId TEXT PRIMARY KEY,
        answers TEXT,
        demographics TEXT,
        interests TEXT,
        recent_topics TEXT,
        created_at INTEGER,
        updated_at INTEGER
    )`);
    
    // Trace Runs - 流程追踪
    db.run(`CREATE TABLE IF NOT EXISTS trace_runs (
        id TEXT PRIMARY KEY,
        experiment_id TEXT,
        user_id TEXT,
        type TEXT,
        status TEXT,
        started_at INTEGER,
        ended_at INTEGER
    )`);
    
    // Trace Steps - 步骤详情
    db.run(`CREATE TABLE IF NOT EXISTS trace_steps (
        id TEXT PRIMARY KEY,
        run_id TEXT,
        step_name TEXT,
        status TEXT,
        started_at INTEGER,
        ended_at INTEGER,
        duration_ms INTEGER,
        input TEXT,
        output TEXT,
        error TEXT
    )`);

    // Interactions
    db.run(`CREATE TABLE IF NOT EXISTS interactions (
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
        articleContext TEXT -- JSON string snapshot
    )`);

    // Sessions (Batches)
    db.run(`CREATE TABLE IF NOT EXISTS sessions (
        sessionId TEXT PRIMARY KEY,
        experimentId TEXT,
        strategy TEXT, -- JSON string
        articleIds TEXT, -- JSON string of IDs
        timestamp INTEGER,
        roundIndex INTEGER,
        debug TEXT -- JSON string
    )`);

    // Experiments
    db.run(`CREATE TABLE IF NOT EXISTS experiments (
        id TEXT PRIMARY KEY,
        userId TEXT,
        startTimestamp INTEGER,
        name TEXT,
        active INTEGER,
        customStrategyPrompt TEXT,
        customContentPrompt TEXT
    )`);

    // User Seeds config
    db.run(`CREATE TABLE IF NOT EXISTS user_seeds (
        userId TEXT PRIMARY KEY,
        articleIds TEXT -- JSON string
    )`);
    
    // Global Config
    db.run(`CREATE TABLE IF NOT EXISTS global_config (
        key TEXT PRIMARY KEY,
        value TEXT
    )`);
});

// Helper for Promises
const run = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve(this);
    });
});

const all = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
    });
});

const get = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
    });
});

module.exports = { db, run, all, get };