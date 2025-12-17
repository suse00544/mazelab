# 小红书爬虫功能说明

## 新增功能

### 1. 指定帖子ID批量抓取
- **API**: `POST /notes/by-ids`
- **功能**: 根据笔记ID列表批量获取笔记详情
- **使用场景**: 已知笔记ID，批量获取内容

```python
# 请求示例
{
    "note_ids": ["note_id_1", "note_id_2", "note_id_3"]
}
```

### 2. 评论和二级评论（可配置）
- **API**: `POST /comments`
- **功能**: 获取笔记评论，支持获取二级评论（回复）
- **参数**:
  - `num`: 获取评论数量（默认10条）
  - `get_sub_comments`: 是否获取二级评论（默认True）

```python
# 请求示例
{
    "note_id": "note_id",
    "xsec_token": "token",
    "cursor": "",
    "num": 10,  # 获取10条评论
    "get_sub_comments": true  # 获取二级评论
}
```

### 3. 指定作者主页抓取
- **API**: `POST /user/notes` - 获取用户笔记列表
- **API**: `POST /user/info` - 获取用户信息
- **功能**: 抓取指定用户的所有笔记

```python
# 获取用户笔记
{
    "user_id": "user_id",
    "cursor": "",
    "num": 20
}

# 获取用户信息
{
    "user_id": "user_id"
}
```

### 4. 生成评论词云图
- **API**: `POST /wordcloud`
- **功能**: 根据评论文本生成词云图
- **返回**: Base64编码的PNG图片

```python
# 请求示例
{
    "comments": ["评论1", "评论2", "评论3", ...]
}
```

## 登录态缓存（Session Cache）

### 什么是登录态缓存？

登录态缓存是将登录后的 Cookie 信息（特别是 `a1` 字段）保存到本地文件，避免每次爬取都需要重新登录。

### 工作原理

1. **首次登录**: 用户通过 Cookie 登录后，系统自动保存 Cookie 到 `cache/xhs_session.json`
2. **后续使用**: 爬虫启动时自动从缓存加载 Cookie，无需重新登录
3. **过期管理**: Cookie 有过期时间（默认24小时），过期后需要重新登录

### 优势

- ✅ **提高效率**: 不需要每次都登录
- ✅ **降低风险**: 减少登录频率，降低被封风险
- ✅ **多账号支持**: 可以为不同账号保存不同的登录态
- ✅ **自动管理**: 系统自动处理缓存和过期

### 缓存文件位置

```
crawler/cache/xhs_session.json
```

### 使用方式

缓存功能默认开启，无需额外配置。如果需要清除缓存：

```python
from xhs.cache import SessionCache
cache = SessionCache()
cache.clear()  # 清除缓存
```

## IP代理池（Proxy Pool）

### 什么是IP代理池？

IP代理池是一组可用的代理服务器列表，爬虫可以轮换使用这些代理来发送请求，避免单一IP被平台封禁。

### 为什么需要代理池？

1. **防止IP被封**: 频繁请求同一IP容易被平台检测并封禁
2. **提高成功率**: 使用多个IP轮换，降低单IP请求频率
3. **模拟真实用户**: 不同IP看起来像不同用户
4. **突破地域限制**: 可以使用不同地区的IP

### 代理类型

1. **HTTP/HTTPS代理**: 最常见的代理类型
   ```
   http://username:password@proxy.example.com:8080
   ```

2. **SOCKS5代理**: 更安全，支持TCP和UDP
   ```
   socks5://username:password@proxy.example.com:1080
   ```

3. **住宅代理**: 真实用户IP，更难被检测（推荐）
4. **数据中心代理**: 速度快但容易被识别

### 工作原理

1. **代理轮询**: 每次请求自动切换到下一个代理
2. **失败处理**: 如果代理失败，自动标记并跳过
3. **自动恢复**: 所有代理失败后，重置失败列表

### 使用方式

```python
from xhs.proxy_pool import ProxyPool

# 创建代理池
proxies = [
    "http://user:pass@proxy1.com:8080",
    "http://user:pass@proxy2.com:8080",
    "socks5://user:pass@proxy3.com:1080",
]
proxy_pool = ProxyPool(proxies)

# 在客户端中使用
client = XiaoHongShuClient(
    playwright_page=page,
    cookie_dict=cookies,
    proxy_pool=proxy_pool  # 传入代理池
)
```

### 代理获取建议

1. **免费代理**: 
   - 可用性低，速度慢
   - 适合测试和小规模爬取

2. **付费代理服务**:
   - 推荐：Luminati、Smartproxy、Oxylabs
   - 稳定性高，速度快
   - 适合大规模爬取

3. **自建代理**:
   - 使用云服务器搭建
   - 成本可控，但需要维护

### 注意事项

⚠️ **重要提示**:
- 代理池不是必须的，小规模爬取可以不使用
- 使用代理会增加请求延迟
- 确保代理服务稳定可靠
- 遵守平台使用规则，不要过度爬取

## 参考项目

本实现参考了 [MediaCrawler](https://github.com/suse00544/MediaCrawler) 项目的设计思路和API结构。

## 安装依赖

新增的依赖包：
```bash
pip install wordcloud jieba pillow
```

## API 端点汇总

| 端点 | 方法 | 功能 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/set-cookies` | POST | 设置Cookie |
| `/search` | POST | 关键词搜索 |
| `/note/detail` | POST | 获取笔记详情 |
| `/note/from-url` | POST | 从URL获取笔记 |
| `/notes/by-ids` | POST | 批量获取笔记（新） |
| `/comments` | POST | 获取评论（支持二级评论） |
| `/user/notes` | POST | 获取用户笔记列表（新） |
| `/user/info` | POST | 获取用户信息（新） |
| `/wordcloud` | POST | 生成词云图（新） |

