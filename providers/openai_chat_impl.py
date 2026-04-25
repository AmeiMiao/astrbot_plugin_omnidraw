"""
AstrBot 万象画卷插件 v3.1 - OpenAI Chat 兼容实现 (满级防弹版)
修复：动态拦截并本地化网络图片，破解平台防盗链导致大模型无法读取图片的问题
"""
import aiohttp
import re
import json
import base64
from typing import Any
from astrbot.api import logger

# ==========================================
# 🛡️ 终极防弹导入机制 (无视框架路径错乱)
# ==========================================
try:
    from .base import BaseProvider
except ImportError:
    try:
        from .providers.base import BaseProvider
    except ImportError:
        from data.plugins.astrbot_plugin_omnidraw.providers.base import BaseProvider

class OpenAIChatProvider(BaseProvider):

    async def _encode_image_to_base64(self, image_path_or_url: str) -> str:
        """统一将本地路径或网络URL转化为 Base64，彻底切断对外部大模型网关下载图片的依赖"""
        try:
            if image_path_or_url.startswith("http"):
                # 🚀 核心修复：遇到网络图片，插件自己先在本地下载到内存里！
                logger.info(f"📥 正在本地内存中拦截并下载网络参考图...")
                async with self.session.get(image_path_or_url) as resp:
                    if resp.status == 200:
                        image_bytes = await resp.read()
                        b64_data = base64.b64encode(image_bytes).decode('utf-8')
                        return "data:image/png;base64," + b64_data
                    else:
                        logger.error(f"下载网络图片失败，状态码: {resp.status}")
                        return ""
            else:
                # 本地图片处理逻辑保持不变
                with open(image_path_or_url, "rb") as f:
                    b64_data = base64.b64encode(f.read()).decode('utf-8')
                    return "data:image/png;base64," + b64_data
        except Exception as e:
            logger.error("读取或下载参考图失败: " + str(e))
            return ""

    async def generate_image(self, prompt: str, **kwargs: Any) -> str:
        current_key = self.get_current_key()
        if not current_key:
            raise ValueError("节点未配置 API Key！")

        persona_ref = kwargs.get("persona_ref")
        user_ref = kwargs.get("user_ref")

        user_content = [{"type": "text", "text": prompt}]

        # 视觉通道：注入参考图 (现在网络图和本地图都会被强制转化为 Base64 本地数据)
        if persona_ref:
            b64_persona = await self._encode_image_to_base64(persona_ref)
            if b64_persona:
                user_content.append({"type": "image_url", "image_url": {"url": b64_persona}})
                logger.info("✅ [Chat/Vision] 成功将【专属人设图】转化为视觉信号注入对话")

        if user_ref:
            b64_user = await self._encode_image_to_base64(user_ref)
            if b64_user:
                user_content.append({"type": "image_url", "image_url": {"url": b64_user}})
                logger.info("✅ [Chat/Vision] 成功将【动态姿势图】转化为视觉信号注入对话")

        if len(user_content) == 1:
            user_content = prompt

        payload = {
            "model": self.config.model,
            "messages": [
                {
                    "role": "system", 
                    "content": "You are a professional image generation assistant. Based on the prompt and any reference images (e.g., character face or pose), generate the corresponding image and return ONLY the markdown image link: ![image](url). DO NOT output any extra conversational text."
                },
                {
                    "role": "user", 
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
        
        logger.info("📡 发起 Vision 请求 -> URL: " + url)
        
        timeout_obj = aiohttp.ClientTimeout(total=self.config.timeout)
        
        async with self.session.post(url, json=payload, headers=headers, timeout=timeout_obj) as response:
            status = response.status
            if status != 200:
                error_text = await response.text()
                logger.error("💥 API 返回错误:\n" + error_text)
                raise RuntimeError("HTTP " + str(status) + ": " + error_text)
            
            result = await response.json()
            
            if "choices" in result and len(result["choices"]) > 0:
                content = result["choices"][0]["message"]["content"].strip()
                logger.info("🤖 Chat模型回复原话: " + content)
                
                match = re.search(r'!\[.*?\]\((.*?)\)', content)
                if match:
                    return match.group(1)
                
                if content.startswith("http") or content.startswith("data:image"):
                    return content
                    
                raise ValueError("Chat接口未返回有效图片链接。模型原话: " + content)
            else:
                raise ValueError("API返回结构异常: " + str(result))
