"""
登录态缓存管理模块

登录态缓存的作用：
1. 避免频繁登录：将登录后的 Cookie 和签名信息保存到本地
2. 提高爬取效率：不需要每次都重新登录和获取签名
3. 降低被封风险：减少登录频率，模拟正常用户行为
4. 支持多账号：可以为不同账号保存不同的登录态

缓存内容：
- Cookie 信息（特别是 a1 字段，用于签名）
- 签名算法相关的临时数据
- 过期时间
"""
import json
import os
from datetime import datetime, timedelta
from typing import Dict, Optional

CACHE_DIR = os.path.join(os.path.dirname(__file__), "../../cache")
CACHE_FILE = os.path.join(CACHE_DIR, "xhs_session.json")

class SessionCache:
    def __init__(self):
        os.makedirs(CACHE_DIR, exist_ok=True)
    
    def save(self, user_id: str, cookies: Dict[str, str], expires_in: int = 86400):
        """保存登录态到缓存
        
        Args:
            user_id: 用户ID（可选，用于多账号管理）
            cookies: Cookie字典
            expires_in: 过期时间（秒），默认24小时
        """
        cache_data = {
            "user_id": user_id,
            "cookies": cookies,
            "created_at": datetime.now().isoformat(),
            "expires_at": (datetime.now() + timedelta(seconds=expires_in)).isoformat(),
        }
        
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(cache_data, f, ensure_ascii=False, indent=2)
        
        print(f"[Cache] Session saved for user: {user_id}")
    
    def load(self) -> Optional[Dict[str, str]]:
        """从缓存加载登录态
        
        Returns:
            Cookie字典，如果过期或不存在则返回None
        """
        if not os.path.exists(CACHE_FILE):
            return None
        
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                cache_data = json.load(f)
            
            expires_at = datetime.fromisoformat(cache_data["expires_at"])
            if datetime.now() > expires_at:
                print("[Cache] Session expired")
                return None
            
            print(f"[Cache] Session loaded for user: {cache_data.get('user_id', 'unknown')}")
            return cache_data["cookies"]
        except Exception as e:
            print(f"[Cache] Error loading session: {e}")
            return None
    
    def clear(self):
        """清除缓存"""
        if os.path.exists(CACHE_FILE):
            os.remove(CACHE_FILE)
            print("[Cache] Session cleared")

