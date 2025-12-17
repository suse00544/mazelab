import random
import time
import re
from urllib.parse import parse_qs, urlparse

def base36encode(number, alphabet='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'):
    if not isinstance(number, int):
        raise TypeError('number must be an integer')
    base36 = ''
    sign = ''
    if number < 0:
        sign = '-'
        number = -number
    if 0 <= number < len(alphabet):
        return sign + alphabet[number]
    while number != 0:
        number, i = divmod(number, len(alphabet))
        base36 = alphabet[i] + base36
    return sign + base36

def get_search_id():
    e = int(time.time() * 1000) << 64
    t = int(random.uniform(0, 2147483646))
    return base36encode((e + t))

img_cdns = [
    "https://sns-img-qc.xhscdn.com",
    "https://sns-img-hw.xhscdn.com",
    "https://sns-img-bd.xhscdn.com",
    "https://sns-img-qn.xhscdn.com",
]

def get_img_url_by_trace_id(trace_id: str, format_type: str = "png"):
    return f"{random.choice(img_cdns)}/{trace_id}?imageView2/format/{format_type}"

def get_trace_id(img_url: str):
    return f"spectrum/{img_url.split('/')[-1]}" if img_url.find("spectrum") != -1 else img_url.split("/")[-1]

def extract_url_params_to_dict(url: str) -> dict:
    parsed = urlparse(url)
    params = parse_qs(parsed.query)
    return {k: v[0] if len(v) == 1 else v for k, v in params.items()}

def parse_note_info_from_note_url(url: str):
    """
    解析笔记 URL，支持以下格式：
    - https://www.xiaohongshu.com/explore/674c5e32000000001e019dd1
    - https://www.xiaohongshu.com/discovery/item/674c5e32000000001e019dd1
    - https://www.xiaohongshu.com/notes/674c5e32000000001e019dd1
    - https://xhslink.com/xxxx (短链接)
    - 674c5e32000000001e019dd1 (纯ID)
    """
    url = url.strip()

    # 如果是纯 ID（24位十六进制）
    if re.match(r'^[a-f0-9]{24}$', url):
        return {"note_id": url, "xsec_token": "", "xsec_source": ""}

    # 解析 URL
    note_id = url.split("/")[-1].split("?")[0]
    params = extract_url_params_to_dict(url)
    xsec_token = params.get("xsec_token", "")
    xsec_source = params.get("xsec_source", "")
    return {"note_id": note_id, "xsec_token": xsec_token, "xsec_source": xsec_source}


def parse_user_info_from_user_url(url: str):
    """
    解析用户主页 URL，支持以下格式：
    - https://www.xiaohongshu.com/user/profile/5a87c9134eacab2a4db1a0fb
    - https://www.xiaohongshu.com/user/profile/5a87c9134eacab2a4db1a0fb?xsec_token=xxx
    - 5a87c9134eacab2a4db1a0fb (纯ID)
    """
    url = url.strip()

    # 如果是纯 ID（24位十六进制）
    if re.match(r'^[a-f0-9]{24}$', url):
        return {"user_id": url}

    # 解析 URL
    parsed = urlparse(url)
    path_parts = parsed.path.split("/")

    # 找到 profile 后面的 user_id
    user_id = ""
    for i, part in enumerate(path_parts):
        if part == "profile" and i + 1 < len(path_parts):
            user_id = path_parts[i + 1].split("?")[0]
            break

    # 如果没找到，尝试取最后一个路径段
    if not user_id:
        user_id = path_parts[-1].split("?")[0]

    return {"user_id": user_id}


def parse_urls_batch(urls_text: str):
    """
    批量解析 URL，支持换行或逗号分隔
    返回 note_ids 和 user_ids 列表
    """
    urls = re.split(r'[,\n\r]+', urls_text)
    note_ids = []
    user_ids = []

    for url in urls:
        url = url.strip()
        if not url:
            continue

        # 判断是笔记还是用户链接
        if '/user/profile/' in url:
            info = parse_user_info_from_user_url(url)
            if info.get("user_id"):
                user_ids.append(info["user_id"])
        else:
            info = parse_note_info_from_note_url(url)
            if info.get("note_id"):
                note_ids.append(info)

    return {"note_ids": note_ids, "user_ids": user_ids}
