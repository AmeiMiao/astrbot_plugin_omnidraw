"""
AstrBot 万象画卷插件 v1.0.0

功能描述：
- OpenAI 标准接口实现

作者: your_name
版本: 1.0.0
日期: 2026-04-25
"""

import aiohttp
import asyncio
from typing import Any
from astrbot.api import logger
from .base import BaseProvider
from ..constants import API_TIMEOUT_DEFAULT

class OpenAIProvider(BaseProvider):
    async def generate_image(self, prompt: str, **kwargs: Any) -> str:
        current_key = self.get_current_key() # 关键：使用轮询获取 Key
        
        payload = {
            "model": self.config.model,
            "prompt": prompt,
            "n": 1,
            "size": kwargs.get("size", "1024x1024")
        }
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {current_key}"
        }
        
        # 确保 url 拼接正确
        base_url = self.config.base_url.rstrip("/")
        if not base_url.endswith("/v1"):
            url = f"{base_url}/v1/images/generations"
        else:
            url = f"{base_url}/images/generations"
            
        logger.info(f"[{self.config.id}] 正在请求: {url}")
        
        # 异步 HTTP 请求并包含超时控制
        timeout_obj = aiohttp.ClientTimeout(total=API_TIMEOUT_DEFAULT)
        async with self.session.post(url, json=payload, headers=headers, timeout=timeout_obj) as response:
            if response.status != 200:
                error_text = await response.text()
                raise RuntimeError(f"HTTP {response.status}: {error_text}")
            
            result = await response.json()
            if "data" in result and len(result["data"]) > 0:
                return result["data"][0].get("url", "")
            else:
                raise ValueError(f"返回数据异常: {result}")
