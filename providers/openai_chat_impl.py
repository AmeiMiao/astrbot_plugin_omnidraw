"""
AstrBot 万象画卷插件 v3.0
功能描述：OpenAI Chat 接口 (/v1/chat/completions) 出图实现
支持多维度控制：双图同传 (Vision 格式)
"""

import aiohttp
import re
import json
from typing import Any
from astrbot.api import logger
from .base import BaseProvider

class OpenAIChatProvider(BaseProvider):
    """OpenAI 聊天接口出图支持 (Vision 增强版)"""
    
    async def generate_image(self, prompt: str, **kwargs: Any) -> str:
        current_key = self.get_current_key()
        if not current_key:
            raise ValueError(f"节点 [{self.config.id}] 未配置任何 API Key！")

        # 提取双重参考图
        persona_ref = kwargs.get("persona_ref") # WebUI 上传的人脸/形象
        user_ref = kwargs.get("user_ref")       # 用户聊天的姿势/服装

        # 基础文本 Prompt
        user_content = [{"type": "text", "text": prompt}]
        
        b64_persona = None
        b64_user = None

        # 1. 处理人脸/固定形象图，并附加到多模态消息中
        if persona_ref:
            b64_persona = self.encode_local_image_to_base64(persona_ref) if not persona_ref.startswith("http") else persona_ref
            if b64_persona:
                user_content.append({"type": "image_url", "image_url": {"url": b64_persona}})
                logger.info("✅ [Chat/Vision] 已附加固定形象面部参考图")

        # 2. 处理用户发送的动态姿势图，并附加到多模态消息中
        if user_ref:
            b64_user = self.encode_local_image_to_base64(user_ref) if not user_ref.startswith("http") else user_ref
            if b64_user:
                user_content.append({"type": "image_url", "image_url": {"url": b64_user}})
                logger.info("✅ [Chat/Vision] 已附加用户动态姿势/服装参考图")

        # 如果一张图片都没有，退化为简单的纯文本格式
        if len(user_content) == 1:
            user_content = prompt

        payload = {
            "model": self.config.model,
            "messages": [
                {
                    "role": "system", 
                    # 提示大模型如何理解两张图的先后顺序
                    "content": "You are a direct image link generator. Based on the user's prompt and the reference images (if provided, the first is usually the face/character, the second is pose/style), generate an image and output ONLY the image markdown link: ![image](url). Do not output any other text."
                },
                {
                    "role": "user", 
                    "content": user_content
                }
            ]
        }
        
        safe_key = f"{current_key[:4]}...{current_key[-4:]}" if len(current_key) > 8 else "INVALID_KEY"
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {current_key}"
        }
        
        base_url = self.config.base_url.rstrip("/")
        url = f"{base_url}/v1/chat/completions" if not base_url.endswith("/v1") else f"{base_url}/chat/completions"
        
        logger.info(f"[{self.config.id}] 📡 发起请求 -> URL: {url}")
        
        # 脱敏日志，防止 Base64 刷屏
        payload_for_log = json.loads(json.dumps(payload))
        if isinstance(user_content, list):
            for item in payload_for_log["messages"][1]["content"]:
                if item["type"] == "image_url":
                    item["image_url"]["url"] = "data:image/png;base64, [已为您省略...]"
        logger.debug(f"[{self.config.id}] 📦 Payload -> {json.dumps(payload_for_log, ensure_ascii=False)}")
        
        timeout_obj = aiohttp.ClientTimeout(total=self.config.timeout)
        
        async with self.session.post(url, json=payload, headers=headers, timeout=timeout_obj) as response:
            status = response.status
            if status != 200:
                error_text = await response.text()
                logger.error(f"[{self.config.id}] 💥 API 返回错误:\n{error_text}")
                raise RuntimeError(f"HTTP {status}: {error_text}")
            
            result = await response.json()
            
            if "choices" in result and len(result["choices"]) > 0:
                content = result["choices"][0]["message"]["content"].strip()
                logger.info(f"[{self.config.id}] 🤖 模型回复原话: {content}")
                
                # 尝试提取 Markdown 图片链接
                match = re.search(r'!\[.*?\]\((.*?)\)', content)
                if match:
                    return match.group(1)
                
                # 尝试直接提取裸链接
                if content.startswith("http") or content.startswith("data:image"):
                    return content
                    
                raise ValueError(f"Chat接口未返回有效图片链接。模型原话: {content}")
            else:
                raise ValueError(f"API返回结构异常: {result}")
