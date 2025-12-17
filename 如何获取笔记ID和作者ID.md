# 如何获取小红书笔记ID和作者ID

## 📝 笔记ID（Note ID）

### 方法一：从笔记URL中提取

小红书笔记URL格式：
```
https://www.xiaohongshu.com/discovery/item/{note_id}
https://www.xiaohongshu.com/explore/{note_id}
https://xhslink.com/xxxxx  (短链接，需要先访问获取真实URL)
```

**示例：**
- URL: `https://www.xiaohongshu.com/discovery/item/5aea073e7ee0a950c3a995e7`
- 笔记ID: `5aea073e7ee0a950c3a995e7`

### 方法二：从笔记详情中获取

在搜索结果或笔记详情中，笔记ID通常包含在以下字段中：
- `note_id`
- `id`
- `item_id`

### 方法三：使用项目中的解析函数

项目已经提供了URL解析功能：

```python
from xhs.help import parse_note_info_from_note_url

url = "https://www.xiaohongshu.com/discovery/item/5aea073e7ee0a950c3a995e7"
info = parse_note_info_from_note_url(url)
note_id = info["note_id"]  # 获取笔记ID
```

### 在前端使用

1. **通过搜索获取**：
   - 在"关键词搜索"模式下搜索笔记
   - 点击笔记查看详情
   - 笔记ID会自动保存在笔记对象中

2. **通过URL导入**：
   - 使用"从URL获取笔记"功能
   - 系统会自动解析URL中的笔记ID

3. **手动输入**：
   - 切换到"按笔记ID"模式
   - 直接输入笔记ID（多个ID用换行或逗号分隔）

---

## 👤 作者ID（User ID）

### 方法一：从作者主页URL中提取

小红书作者主页URL格式：
```
https://www.xiaohongshu.com/user/profile/{user_id}
https://www.xiaohongshu.com/user/profile/{user_id}?xhsshare=CopyLink
```

**示例：**
- URL: `https://www.xiaohongshu.com/user/profile/5aea042011be10212efde564`
- 作者ID: `5aea042011be10212efde564`

### 方法二：从笔记详情中获取

在笔记详情中，作者ID通常包含在以下字段中：
- `user.user_id`
- `author_id`
- `user_id`

**示例：**
```json
{
  "user": {
    "user_id": "5aea042011be10212efde564",
    "nickname": "用户名",
    "avatar": "头像URL"
  }
}
```

### 方法三：从搜索结果中获取

在搜索结果的笔记列表中，每个笔记都包含作者信息：
```json
{
  "id": "笔记ID",
  "user": {
    "user_id": "作者ID",
    "nickname": "作者昵称"
  }
}
```

### 在前端使用

1. **从笔记详情中获取**：
   - 点击任意笔记查看详情
   - 在笔记详情中可以看到作者信息
   - 作者ID显示在 `user.user_id` 字段中

2. **手动输入**：
   - 切换到"按作者主页"模式
   - 输入作者ID（从笔记详情中复制）
   - 点击"获取笔记"按钮

---

## 🔍 实际操作步骤

### 获取笔记ID

1. **打开小红书APP或网页版**
2. **找到目标笔记并点击进入详情页**
3. **点击右上角"分享"按钮**
4. **选择"复制链接"**
5. **粘贴链接，找到 `item/` 或 `explore/` 后面的字符串**

示例：
```
原始链接: https://www.xiaohongshu.com/discovery/item/5aea073e7ee0a950c3a995e7?source=question
笔记ID: 5aea073e7ee0a950c3a995e7
```

### 获取作者ID

1. **打开小红书APP或网页版**
2. **进入目标作者的主页**
3. **点击右上角"分享"按钮**
4. **选择"复制链接"**
5. **粘贴链接，找到 `profile/` 后面的字符串**

示例：
```
原始链接: https://www.xiaohongshu.com/user/profile/5aea042011be10212efde564?xhsshare=CopyLink
作者ID: 5aea042011be10212efde564
```

### 从笔记详情中获取作者ID

1. **在项目中搜索或打开一个笔记**
2. **查看笔记详情**
3. **找到作者信息部分**
4. **复制 `user_id` 字段的值**

---

## 💡 使用技巧

### 批量获取笔记ID

1. 在搜索结果中，每个笔记卡片都包含笔记ID
2. 可以一次性获取多个笔记ID
3. 在"按笔记ID"模式下，可以批量输入多个ID

### 快速获取作者的所有笔记

1. 从任意一个笔记中获取作者ID
2. 切换到"按作者主页"模式
3. 输入作者ID
4. 系统会自动获取该作者的所有笔记

### URL格式说明

- **笔记URL**: 
  - `https://www.xiaohongshu.com/discovery/item/{note_id}`
  - `https://www.xiaohongshu.com/explore/{note_id}`
  - 短链接需要先访问获取真实URL

- **作者主页URL**:
  - `https://www.xiaohongshu.com/user/profile/{user_id}`

- **URL参数**:
  - `xsec_token`: 用于获取评论等需要权限的内容
  - `xsec_source`: 来源标识
  - 这些参数可以从URL中提取，也可以从搜索结果中获取

---

## ⚠️ 注意事项

1. **笔记ID格式**：
   - 通常是24位十六进制字符串
   - 例如：`5aea073e7ee0a950c3a995e7`

2. **作者ID格式**：
   - 通常是24位十六进制字符串
   - 例如：`5aea042011be10212efde564`

3. **短链接处理**：
   - 小红书短链接（`xhslink.com`）需要先访问获取真实URL
   - 项目中的"从URL获取笔记"功能会自动处理短链接

4. **ID有效性**：
   - 笔记ID和作者ID可能会变化
   - 如果ID无效，API会返回错误信息

---

## 🔧 项目中的实现

### 解析笔记URL

```python
# crawler/xhs/help.py
def parse_note_info_from_note_url(url: str):
    note_id = url.split("/")[-1].split("?")[0]
    params = extract_url_params_to_dict(url)
    xsec_token = params.get("xsec_token", "")
    xsec_source = params.get("xsec_source", "")
    return {"note_id": note_id, "xsec_token": xsec_token, "xsec_source": xsec_source}
```

### 使用笔记ID获取详情

```python
# 在 crawler/main.py 中
@app.post("/notes/by-ids")
async def get_notes_by_ids(req: NoteIdsRequest):
    # 批量获取笔记详情
    for note_id in req.note_ids:
        result = await xhs_client.get_note_by_id(note_id=note_id)
```

### 使用作者ID获取笔记列表

```python
# 在 crawler/main.py 中
@app.post("/user/notes")
async def get_user_notes(req: UserNotesRequest):
    # 获取作者的所有笔记
    result = await xhs_client.get_user_notes(
        user_id=req.user_id,
        cursor=req.cursor,
        num=req.num,
    )
```

---

## 📚 参考

- MediaCrawler 项目: https://github.com/suse00544/MediaCrawler
- 小红书官方文档（如有）

