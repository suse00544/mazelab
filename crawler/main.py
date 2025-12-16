import asyncio
import json
import os
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from playwright.async_api import async_playwright, Browser, BrowserContext, Page

from xhs.client import XiaoHongShuClient
from xhs.field import SearchSortType, SearchNoteType
from xhs.help import parse_note_info_from_note_url

browser: Optional[Browser] = None
browser_context: Optional[BrowserContext] = None
page: Optional[Page] = None
xhs_client: Optional[XiaoHongShuClient] = None

class SearchRequest(BaseModel):
    keyword: str
    page: int = 1
    page_size: int = 20
    sort: str = "general"

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

class CookieRequest(BaseModel):
    cookies: str

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
    
    # Extract cookies from browser context after page load
    cookies = await browser_context.cookies()
    cookie_dict = {c["name"]: c["value"] for c in cookies}
    cookie_str = "; ".join([f"{c['name']}={c['value']}" for c in cookies])
    
    print(f"[Crawler] Extracted {len(cookies)} cookies, a1={cookie_dict.get('a1', 'N/A')[:20] if cookie_dict.get('a1') else 'N/A'}...")
    
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
        
        print(f"[Crawler] Cookies set: {len(cookies)} items, a1={cookie_dict.get('a1', 'N/A')[:20]}...")
        
        return {"success": True, "cookies_count": len(cookies)}
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
        
        print(f"[Crawler] Searching: keyword={req.keyword}, page={req.page}, sort={req.sort}")
        print(f"[Crawler] Cookie a1: {xhs_client.cookie_dict.get('a1', 'N/A')[:20] if xhs_client.cookie_dict.get('a1') else 'N/A'}...")
        
        result = await xhs_client.get_note_by_keyword(
            keyword=req.keyword,
            page=req.page,
            page_size=req.page_size,
            sort=sort_type,
        )
        
        print(f"[Crawler] Search result keys: {result.keys() if isinstance(result, dict) else type(result)}")
        
        items = result.get("items", [])
        print(f"[Crawler] Found {len(items)} items")
        
        notes = []
        for item in items:
            note = item.get("note_card", {})
            if note:
                notes.append({
                    "id": item.get("id", ""),
                    "xsec_token": item.get("xsec_token", ""),
                    "title": note.get("display_title", ""),
                    "desc": note.get("desc", ""),
                    "type": note.get("type", ""),
                    "user": {
                        "user_id": note.get("user", {}).get("user_id", ""),
                        "nickname": note.get("user", {}).get("nickname", ""),
                        "avatar": note.get("user", {}).get("avatar", ""),
                    },
                    "cover": note.get("cover", {}).get("url_default", ""),
                    "liked_count": note.get("interact_info", {}).get("liked_count", "0"),
                })
        
        return {
            "success": True,
            "has_more": result.get("has_more", False),
            "notes": notes
        }
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
        )
        
        comments = []
        for c in result.get("comments", []):
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
            })
        
        return {
            "success": True,
            "has_more": result.get("has_more", False),
            "cursor": result.get("cursor", ""),
            "comments": comments
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
