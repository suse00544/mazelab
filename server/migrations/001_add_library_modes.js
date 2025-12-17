const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });

const { db } = require('../database');

console.log('[Migration] 开始执行数据库迁移：添加 Solo/Community 模式支持...');

try {
    // 1. articles 表添加字段
    console.log('[Migration] 1. 为 articles 表添加 library_type 和 owner_id 字段...');

    // 检查字段是否已存在
    const columns = db.prepare(`PRAGMA table_info(articles)`).all();
    const hasLibraryType = columns.some(col => col.name === 'library_type');
    const hasOwnerId = columns.some(col => col.name === 'owner_id');

    if (!hasLibraryType) {
        db.exec(`ALTER TABLE articles ADD COLUMN library_type TEXT DEFAULT 'personal'`);
        console.log('[Migration] ✅ 添加 library_type 字段');
    } else {
        console.log('[Migration] ⏭️  library_type 字段已存在');
    }

    if (!hasOwnerId) {
        db.exec(`ALTER TABLE articles ADD COLUMN owner_id TEXT`);
        console.log('[Migration] ✅ 添加 owner_id 字段');
    } else {
        console.log('[Migration] ⏭️  owner_id 字段已存在');
    }

    // 2. experiments 表添加字段
    console.log('[Migration] 2. 为 experiments 表添加 mode 字段...');

    const expColumns = db.prepare(`PRAGMA table_info(experiments)`).all();
    const hasMode = expColumns.some(col => col.name === 'mode');

    if (!hasMode) {
        db.exec(`ALTER TABLE experiments ADD COLUMN mode TEXT DEFAULT 'solo'`);
        console.log('[Migration] ✅ 添加 mode 字段');
    } else {
        console.log('[Migration] ⏭️  mode 字段已存在');
    }

    // 3. 数据迁移 - 将现有文章标记为 personal，owner_id 设为第一个用户（或默认用户）
    console.log('[Migration] 3. 迁移现有数据...');

    const articlesCount = db.prepare(`SELECT COUNT(*) as count FROM articles`).get();
    console.log(`[Migration] 发现 ${articlesCount.count} 条现有文章`);

    if (articlesCount.count > 0) {
        // 将所有现有文章设为 personal 类型，owner_id 设为 'default'（可以后续由用户认领）
        db.prepare(`UPDATE articles SET library_type = 'personal', owner_id = 'default' WHERE library_type IS NULL`).run();
        console.log('[Migration] ✅ 现有文章已标记为 personal 类型，owner_id 设为 default');
    }

    const experimentsCount = db.prepare(`SELECT COUNT(*) as count FROM experiments`).get();
    console.log(`[Migration] 发现 ${experimentsCount.count} 个现有实验`);

    if (experimentsCount.count > 0) {
        // 将所有现有实验设为 solo 模式
        db.prepare(`UPDATE experiments SET mode = 'solo' WHERE mode IS NULL`).run();
        console.log('[Migration] ✅ 现有实验已设为 solo 模式');
    }

    console.log('[Migration] ✅ 数据库迁移完成！');
    console.log('[Migration] 新增字段：');
    console.log('  - articles.library_type: "personal" | "community"');
    console.log('  - articles.owner_id: 用户ID（Solo模式）或NULL（Community模式）');
    console.log('  - experiments.mode: "solo" | "community"');

} catch (error) {
    console.error('[Migration] ❌ 迁移失败:', error.message);
    process.exit(1);
}
