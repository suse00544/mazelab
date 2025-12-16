import asyncio
import json
from typing import Any, Dict, List, Optional, Union

import httpx
from playwright.async_api import BrowserContext, Page
from tenacity import retry, stop_after_attempt, wait_fixed

from .field import SearchNoteType, SearchSortType
from .help import get_search_id
from .playwright_sign import sign_with_playwright

class XiaoHongShuClient:
    def __init__(
        self,
        timeout=60,
        headers: Dict[str, str] = None,
        playwright_page: Page = None,
        cookie_dict: Dict[str, str] = None,
    ):
        self.timeout = timeout
        self.headers = headers or {}
        self._host = "https://edith.xiaohongshu.com"
        self._domain = "https://www.xiaohongshu.com"
        self.IP_ERROR_CODE = 300012
        self.playwright_page = playwright_page
        self.cookie_dict = cookie_dict or {}

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
        async with httpx.AsyncClient() as client:
            response = await client.request(method, url, timeout=self.timeout, **kwargs)

        print(f"[Client] {method} {url} -> {response.status_code}")
        
        if response.status_code == 471 or response.status_code == 461:
            verify_type = response.headers.get("Verifytype", "")
            verify_uuid = response.headers.get("Verifyuuid", "")
            msg = f"Captcha required: Verifytype: {verify_type}, Verifyuuid: {verify_uuid}"
            raise Exception(msg)

        if return_response:
            return response.text
        
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
            err_msg = data.get("msg", None) or f"{response.text[:200]}"
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
        res = await self.post(uri, data)
        if res and res.get("items"):
            return res["items"][0]["note_card"]
        return {}

    async def get_note_comments(
        self,
        note_id: str,
        xsec_token: str = "",
        cursor: str = "",
    ) -> Dict:
        uri = "/api/sns/web/v2/comment/page"
        params = {
            "note_id": note_id,
            "cursor": cursor,
            "top_comment_id": "",
            "image_formats": "jpg,webp,avif",
            "xsec_token": xsec_token,
        }
        return await self.get(uri, params)
