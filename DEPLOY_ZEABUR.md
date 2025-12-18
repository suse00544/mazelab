# Zeabur 部署指南

## 一键部署步骤

### 1. 访问 Zeabur
- 打开 [zeabur.com](https://zeabur.com)
- 使用 GitHub 账号登录

### 2. 创建新项目
1. 点击「New Project」
2. 选择「Deploy from GitHub」
3. 授权 Zeabur 访问你的 GitHub 账号
4. 选择仓库：`suse00544/mazelab`

### 3. 配置服务
Zeabur 会自动识别项目，你会看到一个服务被创建。

**配置环境变量**：
- 点击服务 → Settings → Environment Variables
- 添加以下变量：
  ```
  GEMINI_API_KEY=your_gemini_api_key_here
  NODE_ENV=production
  ```

> ⚠️ **安全提示**：请使用你自己的 Gemini API Key，不要将真实的 API Key 提交到代码仓库中。

### 4. 部署
- Zeabur 会自动开始构建和部署
- 等待几分钟，部署完成后会获得一个 URL

### 5. 访问应用
- 点击「Domains」→「Generate Domain」
- 会得到一个类似 `xxx.zeabur.app` 的域名
- 访问这个域名即可使用

## 项目配置说明

本项目已配置好以下文件：

### `zbpack.json`
```json
{
  "build_command": "npm run build",
  "start_command": "cd server && NODE_ENV=production node index.js",
  "install_command": "npm install && cd server && npm install"
}
```

### `package.json`
添加了 `start` 脚本：
```json
"start": "cd server && NODE_ENV=production node index.js"
```

## 部署后检查

1. **前端访问**：打开 Zeabur 分配的域名
2. **后端 API**：访问 `https://你的域名.zeabur.app/api/health`
3. **数据库**：SQLite 数据会持久化在 Zeabur 的存储卷中

## 环境变量说明

| 变量名 | 必需 | 说明 |
|--------|------|------|
| `GEMINI_API_KEY` | ✅ | Google Gemini API Key，用于AI推荐 |
| `NODE_ENV` | ✅ | 设置为 `production` |
| `JINA_API_KEY` | ❌ | Jina AI Key（可选） |

## 注意事项

1. **Python 爬虫服务**：当前配置只部署了 Node.js 后端，如需爬虫功能，需要单独部署 `crawler/` 目录
2. **域名绑定**：可以在 Zeabur 控制台绑定自定义域名
3. **数据持久化**：SQLite 数据会自动持久化，无需担心数据丢失
4. **免费额度**：Zeabur 免费层每月有一定额度，超出后需付费

## 如果部署失败

1. 查看 Zeabur 控制台的构建日志
2. 确认 `GEMINI_API_KEY` 已正确配置
3. 检查 GitHub 仓库是否是最新代码

## 更新部署

每次推送到 GitHub 主分支，Zeabur 会自动重新部署。
