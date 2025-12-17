import asyncio
import json
from typing import Any, Dict, List, Optional, Union

import httpx
from playwright.async_api import BrowserContext, Page
from tenacity import retry, stop_after_attempt, wait_fixed

from .field import SearchNoteType, SearchSortType
from .help import get_search_id
from .playwright_sign import sign_with_playwright
from .proxy_pool import ProxyPool
from .cache import SessionCache


class CookieExpiredError(Exception):
    """Cookie 失效异常"""
    pass

class XiaoHongShuClient:
    def __init__(
        self,
        timeout=60,
        headers: Dict[str, str] = None,
        playwright_page: Page = None,
        cookie_dict: Dict[str, str] = None,
        proxy_pool: ProxyPool = None,
        use_cache: bool = True,
    ):
        self.timeout = timeout
        self.headers = headers or {}
        self._host = "https://edith.xiaohongshu.com"
        self._domain = "https://www.xiaohongshu.com"
        self.IP_ERROR_CODE = 300012
        self.playwright_page = playwright_page
        self.cookie_dict = cookie_dict or {}
        self.proxy_pool = proxy_pool
        self.cache = SessionCache() if use_cache else None
        
        # 尝试从缓存加载登录态
        if use_cache and not self.cookie_dict:
            cached_cookies = self.cache.load()
            if cached_cookies:
                self.cookie_dict = cached_cookies
                print("[Client] Loaded cookies from cache")

    async def _pre_headers(self, url: str, params: Optional[Dict] = None, payload: Optional[Dict] = None) -> Dict:
        a1_value = self.cookie_dict.get("a1", "")
        if params is not None:
            data = params
            method = "GET"
        elif payload is not None:
            data = payload
            method = "POST"
        else:
            raise ValueError("params or payload is required")

        signs = await sign_with_playwright(
            page=self.playwright_page,
            uri=url,
            data=data,
            a1=a1_value,
            method=method,
        )
        headers = {
            "X-S": signs["x-s"],
            "X-T": signs["x-t"],
            "x-S-Common": signs["x-s-common"],
            "X-B3-Traceid": signs["x-b3-traceid"],
        }
        self.headers.update(headers)
        return self.headers

    @retry(stop=stop_after_attempt(3), wait=wait_fixed(1))
    async def request(self, method, url, **kwargs) -> Union[str, Any]:
        return_response = kwargs.pop("return_response", False)
        
        # 如果配置了代理池，使用代理
        client_kwargs = {}
        if self.proxy_pool:
            proxy_config = self.proxy_pool.get_proxy()
            if proxy_config:
                # httpx 使用不同的代理格式
                proxy_url = proxy_config.get("http://") or proxy_config.get("https://")
                if proxy_url:
                    client_kwargs["proxies"] = proxy_url
                    print(f"[Client] Using proxy: {proxy_url[:30]}...")
        
        async with httpx.AsyncClient(**client_kwargs) as client:
            try:
                response = await client.request(method, url, timeout=self.timeout, **kwargs)
            except Exception as e:
                # 如果使用代理失败，标记代理为失败
                if self.proxy_pool and proxy_config:
                    proxy_url = proxy_config.get("http://", "")
                    self.proxy_pool.mark_failed(proxy_url)
                raise e

        print(f"[Client] {method} {url} -> {response.status_code}")

        # Cookie 失效检测 (HTTP 461)
        if response.status_code == 461:
            print(f"[Client] HTTP 461 - Cookie expired or invalid")
            raise CookieExpiredError("COOKIE_EXPIRED: Cookie已失效，请重新设置")

        # 验证码检测 (HTTP 471)
        if response.status_code == 471:
            verify_type = response.headers.get("Verifytype", "")
            verify_uuid = response.headers.get("Verifyuuid", "")
            msg = f"Captcha required: Verifytype: {verify_type}, Verifyuuid: {verify_uuid}"
            raise Exception(msg)

        if return_response:
            return response.text

        # 检查其他 HTTP 状态码
        if response.status_code != 200:
            print(f"[Client] HTTP {response.status_code}: {response.text[:200]}")
            raise Exception(f"HTTP {response.status_code}: {response.text[:200]}")
        
        try:
            data: Dict = response.json()
        except Exception as e:
            print(f"[Client] Failed to parse JSON: {response.text[:500]}")
            raise Exception(f"Invalid JSON response: {e}")
            
        print(f"[Client] Response success={data.get('success')}, code={data.get('code')}, msg={data.get('msg', '')[:50]}")
        
        if data.get("success"):
            return data.get("data", data.get("success", {}))
        elif data.get("code") == self.IP_ERROR_CODE:
            raise Exception("IP blocked")
        else:
            err_msg = data.get("msg", None) or data.get("message", None) or f"{response.text[:200]}"
            raise Exception(err_msg)

    async def get(self, uri: str, params: Optional[Dict] = None) -> Dict:
        headers = await self._pre_headers(uri, params)
        if self.cookie_dict:
            cookie_str = "; ".join([f"{k}={v}" for k, v in self.cookie_dict.items()])
            headers["Cookie"] = cookie_str
        full_url = f"{self._host}{uri}"
        return await self.request(method="GET", url=full_url, headers=headers, params=params)

    async def post(self, uri: str, data: dict, **kwargs) -> Dict:
        headers = await self._pre_headers(uri, payload=data)
        headers["Content-Type"] = "application/json;charset=UTF-8"
        if self.cookie_dict:
            cookie_str = "; ".join([f"{k}={v}" for k, v in self.cookie_dict.items()])
            headers["Cookie"] = cookie_str
        json_str = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
        print(f"[Client] Request headers: Cookie present={bool(headers.get('Cookie'))}, X-S present={bool(headers.get('X-S'))}")
        return await self.request(method="POST", url=f"{self._host}{uri}", data=json_str, headers=headers, **kwargs)

    async def update_cookies(self, browser_context: BrowserContext):
        cookies = await browser_context.cookies()
        cookie_str = "; ".join([f"{c['name']}={c['value']}" for c in cookies])
        cookie_dict = {c['name']: c['value'] for c in cookies}
        self.headers["Cookie"] = cookie_str
        self.cookie_dict = cookie_dict
        
        # 保存到缓存
        if self.cache:
            user_id = cookie_dict.get("web_session", "").split("_")[0] if cookie_dict.get("web_session") else "default"
            self.cache.save(user_id, cookie_dict)

    async def get_note_by_keyword(
        self,
        keyword: str,
        search_id: str = None,
        page: int = 1,
        page_size: int = 20,
        sort: SearchSortType = SearchSortType.GENERAL,
        note_type: SearchNoteType = SearchNoteType.ALL,
    ) -> Dict:
        uri = "/api/sns/web/v1/search/notes"
        data = {
            "keyword": keyword,
            "page": page,
            "page_size": page_size,
            "search_id": search_id or get_search_id(),
            "sort": sort.value,
            "note_type": note_type.value,
        }
        return await self.post(uri, data)

    async def get_note_by_id(
        self,
        note_id: str,
        xsec_source: str = "",
        xsec_token: str = "",
    ) -> Dict:
        if xsec_source == "":
            xsec_source = "pc_search"
        data = {
            "source_note_id": note_id,
            "image_formats": ["jpg", "webp", "avif"],
            "extra": {"need_body_topic": 1},
            "xsec_source": xsec_source,
            "xsec_token": xsec_token,
        }
        uri = "/api/sns/web/v1/feed"
        print(f"[Client] Getting note by ID: {note_id}")
        try:
            res = await self.post(uri, data)
            print(f"[Client] Response keys: {list(res.keys()) if res else 'None'}")
            if res and res.get("items"):
                note_card = res["items"][0].get("note_card", {})
                print(f"[Client] Note card keys: {list(note_card.keys()) if note_card else 'None'}")
                return note_card
            elif res:
                print(f"[Client] Response has no items, keys: {list(res.keys())}")
                # 尝试其他可能的响应格式
                if "note_card" in res:
                    return res["note_card"]
                if "data" in res and res["data"]:
                    if isinstance(res["data"], list) and len(res["data"]) > 0:
                        return res["data"][0].get("note_card", {})
                    elif isinstance(res["data"], dict):
                        return res["data"].get("note_card", {})
            print(f"[Client] No note found for ID: {note_id}")
            return {}
        except Exception as e:
            print(f"[Client] Exception in get_note_by_id: {e}")
            import traceback
            traceback.print_exc()
            raise

    async def get_note_comments(
        self,
        note_id: str,
        xsec_token: str = "",
        cursor: str = "",
        num: int = 10,
        get_sub_comments: bool = True,
    ) -> Dict:
        """获取笔记评论，支持二级评论
        
        Args:
            note_id: 笔记ID
            xsec_token: 安全令牌
            cursor: 分页游标
            num: 获取评论数量（默认10条）
            get_sub_comments: 是否获取二级评论（默认True）
        """
        uri = "/api/sns/web/v2/comment/page"
        params = {
            "note_id": note_id,
            "cursor": cursor,
            "top_comment_id": "",
            "image_formats": "jpg,webp,avif",
            "xsec_token": xsec_token,
            "num": num,
        }
        result = await self.get(uri, params)
        
        # 如果需要获取二级评论
        if get_sub_comments and result.get("comments"):
            for comment in result.get("comments", []):
                comment_id = comment.get("id", "")
                sub_comment_count = comment.get("sub_comment_count", 0)
                
                # 如果有二级评论，获取它们
                if sub_comment_count > 0:
                    sub_comments = await self.get_sub_comments(
                        note_id=note_id,
                        comment_id=comment_id,
                        xsec_token=xsec_token,
                        num=min(sub_comment_count, 10)  # 默认最多10条二级评论
                    )
                    comment["sub_comments"] = sub_comments.get("comments", [])
                else:
                    comment["sub_comments"] = []
        
        return result
    
    async def get_sub_comments(
        self,
        note_id: str,
        comment_id: str,
        xsec_token: str = "",
        cursor: str = "",
        num: int = 10,
    ) -> Dict:
        """获取二级评论（回复）"""
        uri = "/api/sns/web/v2/comment/sub/page"
        params = {
            "note_id": note_id,
            "root_comment_id": comment_id,
            "cursor": cursor,
            "num": num,
            "image_formats": "jpg,webp,avif",
            "xsec_token": xsec_token,
        }
        return await self.get(uri, params)
    
    async def get_user_notes(
        self,
        user_id: str,
        cursor: str = "",
        num: int = 20,
    ) -> Dict:
        """获取用户主页的笔记列表
        
        Args:
            user_id: 用户ID
            cursor: 分页游标
            num: 每页数量
        """
        uri = "/api/sns/web/v1/user_posted"
        params = {
            "user_id": user_id,
            "cursor": cursor,
            "num": num,
            "image_formats": "jpg,webp,avif",
        }
        return await self.get(uri, params)
    
    async def get_user_info(
        self,
        user_id: str,
    ) -> Dict:
        """获取用户信息"""
        uri = "/api/sns/web/v1/user"
        params = {
            "user_id": user_id,
            "image_formats": "jpg,webp,avif",
        }
        return await self.get(uri, params)
