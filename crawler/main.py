import asyncio
import json
import os
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from playwright.async_api import async_playwright, Browser, BrowserContext, Page

from xhs.client import XiaoHongShuClient, CookieExpiredError
from xhs.field import SearchSortType, SearchNoteType
from xhs.help import parse_note_info_from_note_url, parse_user_info_from_user_url, parse_urls_batch
from xhs.cache import SessionCache

# Cookie 缓存实例
cookie_cache = SessionCache()

browser: Optional[Browser] = None
browser_context: Optional[BrowserContext] = None
page: Optional[Page] = None
xhs_client: Optional[XiaoHongShuClient] = None

class SearchRequest(BaseModel):
    keyword: str
    page: int = 1
    page_size: int = 20
    sort: str = "general"
    note_type: str = "all"  # all, video, image

class NoteDetailRequest(BaseModel):
    note_id: str
    xsec_token: str = ""
    xsec_source: str = ""

class NoteUrlRequest(BaseModel):
    url: str

class CommentsRequest(BaseModel):
    note_id: str
    xsec_token: str = ""
    cursor: str = ""
    num: int = 10  # 获取评论数量
    get_sub_comments: bool = True  # 是否获取二级评论

class NoteIdsRequest(BaseModel):
    note_ids: list[str]  # 笔记ID列表

class UserNotesRequest(BaseModel):
    user_id: str
    cursor: str = ""
    num: int = 20

class UserInfoRequest(BaseModel):
    user_id: str

class WordCloudRequest(BaseModel):
    comments: list[str]  # 评论文本列表

class CookieRequest(BaseModel):
    cookies: str

class NoteUrlsRequest(BaseModel):
    urls: str  # 多个 URL，用换行或逗号分隔

class UserUrlRequest(BaseModel):
    url: str  # 用户主页 URL 或用户 ID
    num: int = 20  # 获取笔记数量

async def init_browser():
    global browser, browser_context, page
    playwright = await async_playwright().start()
    browser = await playwright.chromium.launch(headless=True)
    browser_context = await browser.new_context(
        viewport={"width": 1920, "height": 1080},
        user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    page = await browser_context.new_page()
    await page.goto("https://www.xiaohongshu.com/explore", wait_until="networkidle", timeout=60000)
    print("[Crawler] Browser initialized and page loaded")
    return page

async def close_browser():
    global browser, browser_context, page
    if browser:
        await browser.close()
        browser = None
        browser_context = None
        page = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global page, xhs_client, browser_context
    page = await init_browser()

    # 优先从缓存加载 Cookie
    cached_cookies = cookie_cache.load()

    if cached_cookies:
        # 使用缓存的 Cookie
        cookie_dict = cached_cookies
        cookie_str = "; ".join([f"{k}={v}" for k, v in cookie_dict.items()])
        print(f"[Crawler] Loaded {len(cookie_dict)} cookies from cache, a1={cookie_dict.get('a1', 'N/A')[:20] if cookie_dict.get('a1') else 'N/A'}...")

        # 将缓存的 Cookie 添加到浏览器上下文
        browser_cookies = [
            {"name": k, "value": v, "domain": ".xiaohongshu.com", "path": "/"}
            for k, v in cookie_dict.items()
        ]
        await browser_context.add_cookies(browser_cookies)
    else:
        # 从浏览器上下文提取 Cookie
        cookies = await browser_context.cookies()
        cookie_dict = {c["name"]: c["value"] for c in cookies}
        cookie_str = "; ".join([f"{c['name']}={c['value']}" for c in cookies])
        print(f"[Crawler] Extracted {len(cookies)} cookies from browser, a1={cookie_dict.get('a1', 'N/A')[:20] if cookie_dict.get('a1') else 'N/A'}...")

    xhs_client = XiaoHongShuClient(
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Origin": "https://www.xiaohongshu.com",
            "Referer": "https://www.xiaohongshu.com/",
            "Cookie": cookie_str,
        },
        playwright_page=page,
        cookie_dict=cookie_dict,
    )
    print("[Crawler] XHS Client initialized")
    yield
    await close_browser()

app = FastAPI(title="XHS Crawler API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok", "browser_ready": browser is not None}

@app.get("/cookie-status")
async def cookie_status():
    """获取当前 Cookie 状态"""
    global xhs_client
    has_cookie = bool(xhs_client and xhs_client.cookie_dict)
    has_cache = cookie_cache.load() is not None

    cookie_info = {}
    if xhs_client and xhs_client.cookie_dict:
        cookie_info = {
            "count": len(xhs_client.cookie_dict),
            "has_a1": "a1" in xhs_client.cookie_dict,
            "has_web_session": "web_session" in xhs_client.cookie_dict,
        }

    return {
        "has_cookie": has_cookie,
        "has_cache": has_cache,
        "cookie_info": cookie_info
    }

@app.post("/clear-cookies")
async def clear_cookies():
    """清除缓存的 Cookie"""
    cookie_cache.clear()
    return {"success": True, "message": "Cookie cache cleared"}

@app.post("/set-cookies")
async def set_cookies(req: CookieRequest):
    global browser_context, xhs_client, page
    if not browser_context:
        raise HTTPException(status_code=500, detail="Browser not initialized")

    try:
        cookies = []
        for item in req.cookies.split(";"):
            item = item.strip()
            if "=" in item:
                name, value = item.split("=", 1)
                cookies.append({
                    "name": name.strip(),
                    "value": value.strip(),
                    "domain": ".xiaohongshu.com",
                    "path": "/"
                })

        await browser_context.add_cookies(cookies)
        cookie_dict = {c["name"]: c["value"] for c in cookies}

        if xhs_client:
            xhs_client.cookie_dict = cookie_dict
            xhs_client.headers["Cookie"] = req.cookies

        # 保存到缓存（有效期7天）
        user_id = cookie_dict.get("web_session", "").split("_")[0] if cookie_dict.get("web_session") else "default"
        cookie_cache.save(user_id, cookie_dict, expires_in=7 * 24 * 3600)

        print(f"[Crawler] Cookies set and cached: {len(cookies)} items, a1={cookie_dict.get('a1', 'N/A')[:20]}...")

        return {"success": True, "cookies_count": len(cookies), "cached": True}
    except Exception as e:
        print(f"[Crawler] Error setting cookies: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/search")
async def search_notes(req: SearchRequest):
    global xhs_client
    if not xhs_client:
        raise HTTPException(status_code=500, detail="Client not initialized")
    
    try:
        sort_map = {
            "general": SearchSortType.GENERAL,
            "popular": SearchSortType.MOST_POPULAR,
            "latest": SearchSortType.LATEST,
        }
        sort_type = sort_map.get(req.sort, SearchSortType.GENERAL)

        note_type_map = {
            "all": SearchNoteType.ALL,
            "video": SearchNoteType.VIDEO,
            "image": SearchNoteType.IMAGE,
        }
        note_type = note_type_map.get(req.note_type, SearchNoteType.ALL)

        print(f"[Crawler] Searching: keyword={req.keyword}, page={req.page}, sort={req.sort}, note_type={req.note_type}")
        print(f"[Crawler] Cookie a1: {xhs_client.cookie_dict.get('a1', 'N/A')[:20] if xhs_client.cookie_dict.get('a1') else 'N/A'}...")

        result = await xhs_client.get_note_by_keyword(
            keyword=req.keyword,
            page=req.page,
            page_size=req.page_size,
            sort=sort_type,
            note_type=note_type,
        )
        
        print(f"[Crawler] Search result keys: {result.keys() if isinstance(result, dict) else type(result)}")
        print(f"[Crawler] Search result type: {type(result)}")
        
        # 处理不同的响应格式
        items = []
        if isinstance(result, dict):
            items = result.get("items", []) or result.get("data", {}).get("items", [])
        elif isinstance(result, list):
            items = result
        
        print(f"[Crawler] Found {len(items)} items")
        
        notes = []
        for item in items:
            # 处理不同的数据结构
            note = item.get("note_card", {}) or item
            if note:
                note_type = note.get("type", "")

                # 获取用户信息
                user_info = note.get("user", {}) or {}
                if not user_info and item.get("user"):
                    user_info = item.get("user", {})

                # 获取封面图
                cover_info = note.get("cover", {}) or {}
                cover_url = cover_info.get("url_default", "") or cover_info.get("url", "") or note.get("cover", "")

                notes.append({
                    "id": item.get("id", "") or note.get("note_id", ""),
                    "xsec_token": item.get("xsec_token", ""),
                    "title": note.get("display_title", "") or note.get("title", ""),
                    "desc": note.get("desc", ""),
                    "type": note_type,
                    "user": {
                        "user_id": user_info.get("user_id", ""),
                        "nickname": user_info.get("nickname", ""),
                        "avatar": user_info.get("avatar", "") or user_info.get("image", ""),
                    },
                    "cover": cover_url,
                    "liked_count": (note.get("interact_info", {}) or {}).get("liked_count", "0"),
                })
        
        response_data = {
            "success": True,
            "has_more": result.get("has_more", False) if isinstance(result, dict) else False,
            "notes": notes
        }
        print(f"[Crawler] Returning {len(notes)} notes")
        return response_data
    except Exception as e:
        print(f"[Crawler] Search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/note/detail")
async def get_note_detail(req: NoteDetailRequest):
    global xhs_client
    if not xhs_client:
        raise HTTPException(status_code=500, detail="Client not initialized")
    
    try:
        result = await xhs_client.get_note_by_id(
            note_id=req.note_id,
            xsec_source=req.xsec_source,
            xsec_token=req.xsec_token,
        )
        
        if not result:
            return {"success": False, "error": "Note not found"}

        # 调试：打印 desc 字段
        desc_value = result.get("desc", "")
        print(f"[Crawler] Note detail - title: {result.get('title', '')[:50]}")
        print(f"[Crawler] Note detail - desc: '{desc_value}' (length: {len(desc_value)})")
        print(f"[Crawler] Note detail - result keys: {list(result.keys())}")

        images = []
        image_list = result.get("image_list", [])
        for img in image_list:
            url = img.get("url_default", "") or img.get("url", "")
            if url:
                images.append(url)
        
        video_url = ""
        video = result.get("video", {})
        if video:
            media = video.get("media", {})
            stream = media.get("stream", {})
            h264 = stream.get("h264", [])
            if h264:
                video_url = h264[0].get("master_url", "")
        
        return {
            "success": True,
            "note": {
                "id": result.get("note_id", req.note_id),
                "title": result.get("title", result.get("display_title", "")),
                "desc": result.get("desc", ""),
                "type": result.get("type", ""),
                "user": {
                    "user_id": result.get("user", {}).get("user_id", ""),
                    "nickname": result.get("user", {}).get("nickname", ""),
                    "avatar": result.get("user", {}).get("avatar", ""),
                },
                "images": images,
                "video_url": video_url,
                "liked_count": result.get("interact_info", {}).get("liked_count", "0"),
                "collected_count": result.get("interact_info", {}).get("collected_count", "0"),
                "comment_count": result.get("interact_info", {}).get("comment_count", "0"),
                "share_count": result.get("interact_info", {}).get("share_count", "0"),
                "time": result.get("time", 0),
                "tag_list": [t.get("name", "") for t in result.get("tag_list", [])],
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/note/from-url")
async def get_note_from_url(req: NoteUrlRequest):
    try:
        info = parse_note_info_from_note_url(req.url)
        detail_req = NoteDetailRequest(
            note_id=info["note_id"],
            xsec_token=info["xsec_token"],
            xsec_source=info["xsec_source"],
        )
        return await get_note_detail(detail_req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/comments")
async def get_comments(req: CommentsRequest):
    global xhs_client
    if not xhs_client:
        raise HTTPException(status_code=500, detail="Client not initialized")

    try:
        result = await xhs_client.get_note_comments(
            note_id=req.note_id,
            xsec_token=req.xsec_token,
            cursor=req.cursor,
            num=req.num,
            get_sub_comments=req.get_sub_comments,
        )

        comments = []
        for c in result.get("comments", []):
            # 处理二级评论
            sub_comments = []
            if req.get_sub_comments and c.get("sub_comments"):
                for sub_c in c.get("sub_comments", []):
                    sub_comments.append({
                        "id": sub_c.get("id", ""),
                        "content": sub_c.get("content", ""),
                        "user": {
                            "user_id": sub_c.get("user_info", {}).get("user_id", ""),
                            "nickname": sub_c.get("user_info", {}).get("nickname", ""),
                            "avatar": sub_c.get("user_info", {}).get("image", ""),
                        },
                        "like_count": sub_c.get("like_count", 0),
                        "create_time": sub_c.get("create_time", 0),
                        "reply_to_user": sub_c.get("reply_to_user", {}).get("nickname", "") if sub_c.get("reply_to_user") else "",
                    })

            comments.append({
                "id": c.get("id", ""),
                "content": c.get("content", ""),
                "user": {
                    "user_id": c.get("user_info", {}).get("user_id", ""),
                    "nickname": c.get("user_info", {}).get("nickname", ""),
                    "avatar": c.get("user_info", {}).get("image", ""),
                },
                "like_count": c.get("like_count", 0),
                "create_time": c.get("create_time", 0),
                "sub_comment_count": c.get("sub_comment_count", 0),
                "sub_comments": sub_comments,
            })

        return {
            "success": True,
            "has_more": result.get("has_more", False),
            "cursor": result.get("cursor", ""),
            "comments": comments
        }
    except CookieExpiredError as e:
        # Cookie 失效，返回 401 状态码
        raise HTTPException(status_code=401, detail={"error": "COOKIE_EXPIRED", "message": "Cookie已失效，请重新设置"})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/notes/by-ids")
async def get_notes_by_ids(req: NoteIdsRequest):
    """批量获取指定ID的笔记详情"""
    global xhs_client
    if not xhs_client:
        raise HTTPException(status_code=500, detail="Client not initialized")
    
    notes = []
    for note_id in req.note_ids:
        try:
            result = await xhs_client.get_note_by_id(note_id=note_id)
            if result:
                images = []
                image_list = result.get("image_list", [])
                for img in image_list:
                    url = img.get("url_default", "") or img.get("url", "")
                    if url:
                        images.append(url)
                
                notes.append({
                    "id": result.get("note_id", note_id),
                    "xsec_token": "",  # 批量获取时没有token，需要从搜索获取
                    "title": result.get("title", result.get("display_title", "")),
                    "desc": result.get("desc", ""),
                    "type": result.get("type", ""),
                    "user": {
                        "user_id": result.get("user", {}).get("user_id", ""),
                        "nickname": result.get("user", {}).get("nickname", ""),
                        "avatar": result.get("user", {}).get("avatar", ""),
                    },
                    "cover": images[0] if images else "",
                    "images": images,
                    "liked_count": result.get("interact_info", {}).get("liked_count", "0"),
                    "collected_count": result.get("interact_info", {}).get("collected_count", "0"),
                    "comment_count": result.get("interact_info", {}).get("comment_count", "0"),
                    "time": result.get("time", 0),
                    "tag_list": [t.get("name", "") for t in result.get("tag_list", [])],
                })
        except Exception as e:
            import traceback
            error_msg = str(e)
            print(f"[Crawler] Error fetching note {note_id}: {error_msg}")
            print(f"[Crawler] Traceback: {traceback.format_exc()}")
            # 如果获取失败，返回错误信息而不是静默跳过
            notes.append({
                "id": note_id,
                "error": error_msg,
                "title": "",
                "desc": "",
                "type": "",
                "user": {"user_id": "", "nickname": "", "avatar": ""},
                "cover": "",
                "images": [],
                "liked_count": "0",
                "collected_count": "0",
                "comment_count": "0",
                "time": 0,
                "tag_list": [],
            })
            continue
    
    return {
        "success": True,
        "notes": notes,
        "total": len(req.note_ids),
        "fetched": len(notes)
    }

@app.post("/notes/from-urls")
async def get_notes_from_urls(req: NoteUrlsRequest):
    """从 URL 批量获取笔记详情

    支持的 URL 格式：
    - https://www.xiaohongshu.com/explore/674c5e32000000001e019dd1
    - https://www.xiaohongshu.com/discovery/item/674c5e32000000001e019dd1
    - 纯笔记 ID：674c5e32000000001e019dd1

    多个 URL 用换行或逗号分隔
    """
    global xhs_client
    if not xhs_client:
        raise HTTPException(status_code=500, detail="Client not initialized")

    try:
        # 解析 URL 获取笔记信息
        parsed = parse_urls_batch(req.urls)
        note_infos = parsed.get("note_ids", [])

        if not note_infos:
            return {"success": False, "error": "未解析到有效的笔记 URL", "notes": []}

        print(f"[Crawler] Fetching {len(note_infos)} notes from URLs")

        notes = []
        errors = []

        for info in note_infos:
            note_id = info.get("note_id", "")
            xsec_token = info.get("xsec_token", "")
            xsec_source = info.get("xsec_source", "")

            try:
                result = await xhs_client.get_note_by_id(
                    note_id=note_id,
                    xsec_token=xsec_token,
                    xsec_source=xsec_source,
                )

                if result:
                    images = []
                    image_list = result.get("image_list", [])
                    for img in image_list:
                        url = img.get("url_default", "") or img.get("url", "")
                        if url:
                            images.append(url)

                    video_url = ""
                    video = result.get("video", {})
                    if video:
                        media = video.get("media", {})
                        stream = media.get("stream", {})
                        h264 = stream.get("h264", [])
                        if h264:
                            video_url = h264[0].get("master_url", "")

                    notes.append({
                        "id": result.get("note_id", note_id),
                        "xsec_token": xsec_token,
                        "title": result.get("title", result.get("display_title", "")),
                        "desc": result.get("desc", ""),
                        "type": result.get("type", ""),
                        "user": {
                            "user_id": result.get("user", {}).get("user_id", ""),
                            "nickname": result.get("user", {}).get("nickname", ""),
                            "avatar": result.get("user", {}).get("avatar", ""),
                        },
                        "cover": images[0] if images else "",
                        "images": images,
                        "video_url": video_url,
                        "liked_count": result.get("interact_info", {}).get("liked_count", "0"),
                        "collected_count": result.get("interact_info", {}).get("collected_count", "0"),
                        "comment_count": result.get("interact_info", {}).get("comment_count", "0"),
                        "share_count": result.get("interact_info", {}).get("share_count", "0"),
                        "time": result.get("time", 0),
                        "tag_list": [t.get("name", "") for t in result.get("tag_list", [])],
                    })
                else:
                    errors.append({"note_id": note_id, "error": "Note not found"})

            except Exception as e:
                print(f"[Crawler] Error fetching note {note_id}: {e}")
                errors.append({"note_id": note_id, "error": str(e)})

        return {
            "success": True,
            "notes": notes,
            "errors": errors,
            "total": len(note_infos),
            "fetched": len(notes),
            "failed": len(errors)
        }

    except Exception as e:
        print(f"[Crawler] Error in get_notes_from_urls: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/user/from-url")
async def get_user_from_url(req: UserUrlRequest):
    """从 URL 获取用户信息和笔记

    支持的 URL 格式：
    - https://www.xiaohongshu.com/user/profile/5a87c9134eacab2a4db1a0fb
    - 纯用户 ID：5a87c9134eacab2a4db1a0fb
    """
    global xhs_client
    if not xhs_client:
        raise HTTPException(status_code=500, detail="Client not initialized")

    try:
        # 解析 URL 获取用户 ID
        user_info = parse_user_info_from_user_url(req.url)
        user_id = user_info.get("user_id", "")

        if not user_id:
            return {"success": False, "error": "无效的用户 URL"}

        print(f"[Crawler] Fetching user info and notes for: {user_id}")

        # 获取用户信息
        user_data = None
        try:
            user_result = await xhs_client.get_user_info(user_id=user_id)
            if user_result:
                user_data = {
                    "user_id": user_result.get("user_id", user_id),
                    "nickname": user_result.get("nickname", ""),
                    "desc": user_result.get("desc", ""),
                    "avatar": user_result.get("avatar", "") or user_result.get("image", ""),
                    "followers": user_result.get("followers", 0) or user_result.get("fans", 0),
                    "followed": user_result.get("followed", 0) or user_result.get("follows", 0),
                    "notes_count": user_result.get("notes_count", 0) or user_result.get("notes", 0),
                    "liked_count": user_result.get("liked_count", 0) or user_result.get("likes", 0),
                }
        except Exception as e:
            print(f"[Crawler] Error fetching user info: {e}")

        # 获取用户笔记
        notes = []
        try:
            notes_result = await xhs_client.get_user_notes(
                user_id=user_id,
                cursor="",
                num=req.num,
            )

            if notes_result:
                items = notes_result.get("notes", []) or notes_result.get("data", {}).get("notes", [])

                for item in items:
                    note = item.get("note_card", {}) or item
                    if note:
                        user_info_note = note.get("user", {}) or {}
                        if not user_info_note and item.get("user"):
                            user_info_note = item.get("user", {})

                        cover_info = note.get("cover", {}) or {}
                        cover_url = cover_info.get("url_default", "") if isinstance(cover_info, dict) else cover_info

                        notes.append({
                            "id": item.get("id", "") or note.get("note_id", ""),
                            "xsec_token": item.get("xsec_token", ""),
                            "title": note.get("display_title", "") or note.get("title", ""),
                            "desc": note.get("desc", ""),
                            "type": note.get("type", ""),
                            "user": {
                                "user_id": user_info_note.get("user_id", user_id),
                                "nickname": user_info_note.get("nickname", ""),
                                "avatar": user_info_note.get("avatar", "") or user_info_note.get("image", ""),
                            },
                            "cover": cover_url,
                            "liked_count": (note.get("interact_info", {}) or {}).get("liked_count", "0"),
                        })
        except Exception as e:
            print(f"[Crawler] Error fetching user notes: {e}")

        return {
            "success": True,
            "user": user_data,
            "notes": notes,
            "has_more": notes_result.get("has_more", False) if notes_result else False,
            "cursor": notes_result.get("cursor", "") if notes_result else "",
        }

    except Exception as e:
        print(f"[Crawler] Error in get_user_from_url: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/user/notes")
async def get_user_notes(req: UserNotesRequest):
    """获取用户主页的笔记列表"""
    global xhs_client
    if not xhs_client:
        raise HTTPException(status_code=500, detail="Client not initialized")
    
    try:
        result = await xhs_client.get_user_notes(
            user_id=req.user_id,
            cursor=req.cursor,
            num=req.num,
        )
        
        # 检查API返回的错误
        if not result:
            raise HTTPException(status_code=500, detail="Empty response from API")
        
        # 检查是否有错误码
        if result.get("success") == False:
            error_msg = result.get("msg") or result.get("message") or "Unknown error"
            raise HTTPException(status_code=500, detail=error_msg)
        
        notes = []
        # 处理不同的响应格式
        items = result.get("notes", []) or result.get("data", {}).get("notes", [])
        
        for item in items:
            # 处理不同的数据结构
            note = item.get("note_card", {}) or item
            if note:
                # 获取用户信息
                user_info = note.get("user", {}) or {}
                if not user_info and item.get("user"):
                    user_info = item.get("user", {})
                
                notes.append({
                    "id": item.get("id", "") or note.get("note_id", ""),
                    "xsec_token": item.get("xsec_token", ""),
                    "title": note.get("display_title", "") or note.get("title", ""),
                    "desc": note.get("desc", ""),
                    "type": note.get("type", ""),
                    "user": {
                        "user_id": user_info.get("user_id", ""),
                        "nickname": user_info.get("nickname", ""),
                        "avatar": user_info.get("avatar", "") or user_info.get("image", ""),
                    },
                    "cover": (note.get("cover", {}) or {}).get("url_default", "") or note.get("cover", ""),
                    "liked_count": (note.get("interact_info", {}) or {}).get("liked_count", "0"),
                })
        
        return {
            "success": True,
            "has_more": result.get("has_more", False),
            "cursor": result.get("cursor", ""),
            "notes": notes
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Crawler] Error in get_user_notes: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/user/info")
async def get_user_info(req: UserInfoRequest):
    """获取用户信息"""
    global xhs_client
    if not xhs_client:
        raise HTTPException(status_code=500, detail="Client not initialized")
    
    try:
        result = await xhs_client.get_user_info(user_id=req.user_id)
        
        # 检查API返回的错误
        if not result:
            raise HTTPException(status_code=500, detail="Empty response from API")
        
        # 检查是否有错误码
        if result.get("success") == False:
            error_msg = result.get("msg") or result.get("message") or "Unknown error"
            raise HTTPException(status_code=500, detail=error_msg)
        
        # 处理不同的响应格式
        user_data = result.get("user", {}) or result.get("data", {}) or result
        
        return {
            "success": True,
            "user": {
                "user_id": user_data.get("user_id", ""),
                "nickname": user_data.get("nickname", ""),
                "desc": user_data.get("desc", "") or user_data.get("desc", ""),
                "avatar": user_data.get("avatar", "") or user_data.get("image", ""),
                "followers": user_data.get("followers", 0) or user_data.get("fans", 0),
                "followed": user_data.get("followed", 0) or user_data.get("follows", 0),
                "notes_count": user_data.get("notes_count", 0) or user_data.get("notes", 0),
                "liked_count": user_data.get("liked_count", 0) or user_data.get("likes", 0),
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Crawler] Error in get_user_info: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/wordcloud")
async def generate_wordcloud(req: WordCloudRequest):
    """生成评论词云图"""
    try:
        from wordcloud import WordCloud
        import jieba
        import io
        import base64
        
        # 合并所有评论文本
        text = " ".join(req.comments)
        
        # 使用jieba分词
        words = jieba.cut(text)
        word_text = " ".join(words)
        
        # 生成词云
        wordcloud = WordCloud(
            width=800,
            height=400,
            background_color='white',
            font_path=None,  # 如果需要中文，需要指定字体路径
            max_words=100,
            relative_scaling=0.5,
        ).generate(word_text)
        
        # 转换为base64图片
        img_buffer = io.BytesIO()
        wordcloud.to_image().save(img_buffer, format='PNG')
        img_base64 = base64.b64encode(img_buffer.getvalue()).decode()
        
        return {
            "success": True,
            "image": f"data:image/png;base64,{img_base64}"
        }
    except ImportError:
        raise HTTPException(
            status_code=500, 
            detail="WordCloud library not installed. Please install: pip install wordcloud jieba"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
