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
    // Articles
    db.run(`CREATE TABLE IF NOT EXISTS articles (
        id TEXT PRIMARY KEY,
        title TEXT,
        content TEXT,
        summary TEXT,
        category TEXT,
        tags TEXT, -- JSON string
        tone TEXT,
        estimatedReadTime INTEGER,
        created_at INTEGER,
        isPublic INTEGER, -- 0 or 1
        ownerId TEXT,
        imageUrl TEXT,
        deletedAt INTEGER
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