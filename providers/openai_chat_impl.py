"""
AstrBot 万象画卷插件 v3.1 - OpenAI Chat 兼容实现
功能：保留防盗链拦截 + 最终提示词日志打印，使用 Markdown 降维法强力注入垫图
"""
import aiohttp
import re
import json
import base64
from typing import Any
from astrbot.api import logger

# 🚀 纯净的相对导入
from .base import BaseProvider

class OpenAIChatProvider(BaseProvider):

    async def _encode_image_to_base64(self, image_path_or_url: str) -> str:
        """拦截网络图片下载，对抗防盗链"""
        try:
            if image_path_or_url.startswith("http"):
                logger.info("📥 正在本地内存中拦截并下载网络参考图...")
                headers = {"User-Agent": "Mozilla/5.0"}
                async with self.session.get(image_path_or_url, headers=headers) as resp:
                    if resp.status == 200:
                        image_bytes = await resp.read()
                        return "data:image/png;base64," + base64.b64encode(image_bytes).decode('utf-8')
                    else:
                        logger.error(f"下载网络图片失败，状态码: {resp.status}")
                        return ""
            else:
                with open(image_path_or_url, "rb") as f:
                    return "data:image/png;base64," + base64.b64encode(f.read()).decode('utf-8')
        except Exception as e:
            logger.error("读取或下载参考图失败: " + str(e))
            return ""

    async def generate_image(self, prompt: str, **kwargs: Any) -> str:
        current_key = self.get_current_key()
        if not current_key:
            raise ValueError("节点未配置 API Key！")

        persona_ref = kwargs.get("persona_ref")
        user_ref = kwargs.get("user_ref")

        logger.info(f"📝 [Chat/Vision通道] 最终发送给 API 的核心提示词:\n{prompt}")

        # ==========================================
        # 🚀 思路一：Markdown 降维打击法
        # 将图片转化为纯字符串，彻底绕过 API 中转对多模态数组的拦截
        # ==========================================
        final_prompt_parts = []

        # 1. 注入人设图
        if persona_ref:
            b64_persona = await self._encode_image_to_base64(persona_ref)
            if b64_persona:
                final_prompt_parts.append(f"![persona_reference_image]({b64_persona})")
                logger.info("✅ [Chat/Vision] 成功将【专属人设图】降维为 Markdown 嵌入文本")

        # 2. 注入用户动作图
        if user_ref:
            b64_user = await self._encode_image_to_base64(user_ref)
            if b64_user:
                final_prompt_parts.append(f"![user_action_reference]({b64_user})")
                logger.info("✅ [Chat/Vision] 成功将【动态姿势图】降维为 Markdown 嵌入文本")

        # 3. 注入纯文字提示词
        final_prompt_parts.append(prompt)

        # 拼接成一个巨大的纯文本字符串，两段之间用换行符隔开
        user_content = "\n\n".join(final_prompt_parts)

        payload = {
            "model": self.config.model,
            "messages": [
                {
                    "role": "system", 
                    "content": "You are a professional image generation assistant. Based on the prompt and any reference images (provided as markdown image links), generate the corresponding image and return ONLY the markdown image link: ![image](url). DO NOT output any extra conversational text."
                },
                {
                    "role": "user", 
                    # 彻底变为纯文本字符串，任何 API 中转站都不会再吃图了！
                    "content": user_content 
                }
            ]
        }

        headers = {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + current_key
        }
        
        base_url = self.config.base_url.rstrip("/")
        url = base_url + "/v1/chat/completions" if not base_url.endswith("/v1") else base_url + "/chat/completions"
        
        timeout_obj = aiohttp.ClientTimeout(total=self.config.timeout)
        async with self.session.post(url, json=payload, headers=headers, timeout=timeout_obj) as response:
            status = response.status
            if status != 200:
                error_text = await response.text()
                raise RuntimeError("HTTP " + str(status) + ": " + error_text)
            
            result = await response.json()
            if "choices" in result and len(result["choices"]) > 0:
                content = result["choices"][0]["message"]["content"].strip()
                match = re.search(r'!\[.*?\]\((.*?)\)', content)
                if match:
                    return match.group(1)
                if content.startswith("http") or content.startswith("data:image"):
                    return content
                raise ValueError("Chat接口未返回有效图片链接。模型原话: " + content)
            else:
                raise ValueError("API返回结构异常: " + str(result))
