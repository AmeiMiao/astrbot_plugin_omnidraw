"""
AstrBot 万象画卷插件 v1.0.0

功能描述：
- OpenAI Chat 接口 (/v1/chat/completions) 出图实现
- 适用于将生成图片转为 Markdown 链接返回的聚合网关大模型

作者: your_name
版本: 1.0.0
日期: 2026-04-25
"""

import aiohttp
import asyncio
import re
from typing import Any
from astrbot.api import logger
from .base import BaseProvider
from ..constants import API_TIMEOUT_DEFAULT

class OpenAIChatProvider(BaseProvider):
    """OpenAI 聊天接口出图支持"""
    
    async def generate_image(self, prompt: str, **kwargs: Any) -> str:
        # Chat 接口专属的 Payload：通过 System Prompt 强制模型只返回 Markdown 图片
        payload = {
            "model": self.config.model,
            "messages": [
                {
                    "role": "system", 
                    "content": "You are a direct image link generator. Based on the user's prompt, generate an image and output ONLY the image markdown link: ![image](url). Do not output any other text or explanations."
                },
                {
                    "role": "user", 
                    "content": prompt
                }
            ]
        }
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.config.api_key}"
        }
        
        # 组装 Chat 接口路由
        base_url = self.config.base_url.rstrip("/")
        if not base_url.endswith("/v1"):
            url = f"{base_url}/v1/chat/completions"
        else:
            url = f"{base_url}/chat/completions"
            
        logger.info(f"[{self.config.id}] 正在请求 Chat 对话出图接口: {url}")
        
        timeout_obj = aiohttp.ClientTimeout(total=API_TIMEOUT_DEFAULT)
        async with self.session.post(url, json=payload, headers=headers, timeout=timeout_obj) as response:
            if response.status != 200:
                error_text = await response.text()
                raise RuntimeError(f"HTTP {response.status}: {error_text}")
            
            result = await response.json()
            
            # 解析大模型的回复文本
            if "choices" in result and len(result["choices"]) > 0:
                content = result["choices"][0]["message"]["content"].strip()
                
                # 正则表达式：提取 Markdown 里的 URL -> ![任意文字](提取这里的URL)
                match = re.search(r'!\[.*?\]\((.*?)\)', content)
                if match:
                    return match.group(1)
                
                # 如果没加 ![...]()，也许它乖巧地直接返回了纯 URL 或 Base64 数据
                if content.startswith("http") or content.startswith("data:image"):
                    return content
                    
                raise ValueError(f"Chat 接口未返回有效的图片格式链接。模型原话: {content}")
            else:
                raise ValueError(f"API 返回的数据结构异常: {result}")
