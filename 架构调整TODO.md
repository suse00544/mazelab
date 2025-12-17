# 架构调整 TODO 清单

## ✅ 已完成

1. **数据库迁移**
   - ✅ articles 表添加 `library_type` 和 `owner_id` 字段
   - ✅ experiments 表添加 `mode` 字段
   - ✅ 迁移现有数据（66条文章，12个实验）

2. **类型定义**
   - ✅ 添加 `LibraryType` 和 `ExperimentMode` 类型
   - ✅ 更新 `Article` 接口
   - ✅ 更新 `Experiment` 接口

## 🔄 进行中

### 后端 API 更新

#### 1. 文章相关 API (server/index.js)
- [ ] `GET /api/articles` - 添加模式过滤
  - 支持 `?mode=solo&userId=xxx` 获取个人库
  - 支持 `?mode=community` 获取公共库

- [ ] `POST /api/articles` - 保存时添加 library_type 和 owner_id
  - Solo 模式：`library_type='personal'`, `owner_id=userId`
  - Community 模式：`library_type='community'`, `owner_id=NULL`

#### 2. 实验相关 API (server/index.js)
- [ ] `POST /api/experiments` - 创建实验时接收 `mode` 参数
- [ ] `GET /api/experiments` - 返回包含 `mode` 字段

#### 3. 推荐相关逻辑
- [ ] 根据实验模式从相应的库检索内容
- [ ] 保存检索内容时自动设置正确的 library_type 和 owner_id

### 前端 UI 更新

#### 1. 实验创建流程 (components/StartConfirmationModal.tsx 或相关组件)
- [ ] 添加模式选择 UI（Solo / Community）
- [ ] 添加模式说明文案：
  - Solo：个人内容库，支持手动添加，模拟个人兴趣
  - Community：公共内容库，自动填充，模拟社区共享

#### 2. 内容管理 (pages/Admin.tsx)
- [ ] 根据当前用户的活跃实验模式显示相应的库
- [ ] Solo 模式：
  - 标题改为"我的内容库"
  - 支持手动添加按钮
  - 只显示 `library_type='personal' AND owner_id=userId` 的内容

- [ ] Community 模式：
  - 标题改为"公共内容库"
  - 隐藏或禁用手动添加按钮
  - 只显示 `library_type='community'` 的内容
  - 添加提示：公共库由社区用户共同构建

#### 3. Feed 页面 (pages/Feed.tsx)
- [ ] 传递当前实验模式给推荐 API
- [ ] 保存新检索内容时传递 library_type 和 owner_id

#### 4. 数据库服务 (services/db.ts)
- [ ] 更新 `getPublicArticles` 支持模式过滤
- [ ] 更新 `saveArticle` 支持 library_type 和 owner_id
- [ ] 添加 `getPersonalArticles(userId)` 方法
- [ ] 添加 `getCommunityArticles()` 方法

### 测试和验证

- [ ] 测试 Solo 模式创建和运行
- [ ] 测试 Community 模式创建和运行
- [ ] 测试内容自动分类到正确的库
- [ ] 测试权限控制（Community 不能手动添加）
- [ ] 测试数据隔离（Solo 用户看不到其他用户的个人库）

## 📋 实施优先级

### 第一阶段（核心功能）
1. 后端 API 更新（文章查询和保存）
2. 实验创建流程（添加模式选择）
3. 内容管理基本展示（根据模式显示不同的库）

### 第二阶段（完善体验）
1. 添加详细的模式说明和引导
2. 优化 UI 交互（禁用/隐藏手动添加按钮）
3. 添加统计信息（个人库/公共库内容数量）

### 第三阶段（测试和优化）
1. 完整的功能测试
2. 性能优化（大量数据情况）
3. 用户体验优化

## 📝 注意事项

1. **向后兼容**：现有数据已迁移为 Solo 模式，不影响现有用户
2. **默认值**：新实验默认为 Solo 模式，保持当前行为
3. **数据隔离**：Solo 用户的个人库互不影响
4. **公共库增长**：Community 模式下，所有用户共同构建公共库
