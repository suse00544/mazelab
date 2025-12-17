"""
IP代理池管理模块

IP代理池的作用：
1. 防止IP被封：频繁请求同一IP容易被平台封禁
2. 提高成功率：使用多个IP轮换，降低单IP请求频率
3. 模拟真实用户：不同IP看起来像不同用户
4. 突破地域限制：可以使用不同地区的IP

代理池类型：
1. HTTP/HTTPS代理：最常见的代理类型
2. SOCKS5代理：更安全，支持TCP和UDP
3. 住宅代理：真实用户IP，更难被检测
4. 数据中心代理：速度快但容易被识别

使用场景：
- 大量爬取时轮换IP
- IP被封后自动切换
- 需要特定地区IP时
"""
import random
from typing import List, Optional, Dict
import httpx

class ProxyPool:
    def __init__(self, proxies: List[str] = None):
        """
        Args:
            proxies: 代理列表，格式: ["http://user:pass@host:port", ...]
        """
        self.proxies = proxies or []
        self.current_index = 0
        self.failed_proxies = set()  # 记录失败的代理
    
    def add_proxy(self, proxy: str):
        """添加代理到池中"""
        if proxy not in self.proxies:
            self.proxies.append(proxy)
            print(f"[ProxyPool] Added proxy: {proxy[:20]}...")
    
    def get_proxy(self) -> Optional[Dict[str, str]]:
        """获取下一个可用代理（轮询方式）
        
        Returns:
            代理配置字典，格式: {"http://": "http://proxy:port", "https://": "http://proxy:port"}
            如果没有代理则返回None
        """
        if not self.proxies:
            return None
        
        # 过滤掉失败的代理
        available_proxies = [p for p in self.proxies if p not in self.failed_proxies]
        if not available_proxies:
            # 如果所有代理都失败，重置失败列表
            print("[ProxyPool] All proxies failed, resetting failed list")
            self.failed_proxies.clear()
            available_proxies = self.proxies
        
        # 轮询获取代理
        proxy = available_proxies[self.current_index % len(available_proxies)]
        self.current_index += 1
        
        return {
            "http://": proxy,
            "https://": proxy,
        }
    
    def get_random_proxy(self) -> Optional[Dict[str, str]]:
        """随机获取一个代理"""
        if not self.proxies:
            return None
        
        available_proxies = [p for p in self.proxies if p not in self.failed_proxies]
        if not available_proxies:
            self.failed_proxies.clear()
            available_proxies = self.proxies
        
        proxy = random.choice(available_proxies)
        return {
            "http://": proxy,
            "https://": proxy,
        }
    
    def mark_failed(self, proxy: str):
        """标记代理为失败"""
        self.failed_proxies.add(proxy)
        print(f"[ProxyPool] Marked proxy as failed: {proxy[:20]}...")
    
    def test_proxy(self, proxy: str, timeout: int = 5) -> bool:
        """测试代理是否可用
        
        Args:
            proxy: 代理地址
            timeout: 超时时间（秒）
        
        Returns:
            是否可用
        """
        try:
            proxies = {
                "http://": proxy,
                "https://": proxy,
            }
            with httpx.Client(proxies=proxies, timeout=timeout) as client:
                response = client.get("https://www.baidu.com", timeout=timeout)
                return response.status_code == 200
        except:
            return False
    
    def get_stats(self) -> Dict:
        """获取代理池统计信息"""
        return {
            "total": len(self.proxies),
            "available": len(self.proxies) - len(self.failed_proxies),
            "failed": len(self.failed_proxies),
        }

