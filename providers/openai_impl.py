"""
AstrBot 万象画卷插件 v3.1 - OpenAI 标准实现
功能描述：原生 OpenAI 图生图 (Image-to-Image) / 文生图兼容实现
破解失效之谜：严格遵循 multipart/form-data 规范进行改图
"""
import aiohttp
import json
from typing import Any
from astrbot.api import logger
from .base import BaseProvider

class OpenAIProvider(BaseProvider):

    async def _get_image_bytes(self, image_path_or_url: str) -> bytes:
        """获取图片的真实二进制数据，用于表单文件上传"""
        if image_path_or_url.startswith("http"):
            async with self.session.get(image_path_or_url) as resp:
                return await resp.read()
        else:
            with open(image_path_or_url, "rb") as f:
                return f.read()

    async def generate_image(self, prompt: str, **kwargs: Any) -> str:
        current_key = self.get_current_key()
        if not current_key:
            raise ValueError(f"节点 [{self.config.id}] 未配置 API Key！")

        base_url = self.config.base_url.rstrip("/")
        
        # 提取参考图 (双轨制：聊天捕获的动作图 > WebUI固定人设图)
        ref_image = kwargs.get("user_ref") or kwargs.get("persona_ref")

        if ref_image:
            # ==========================================
            # 🖼️ 核心修复：图生图模式 (Image-to-Image / Edits)
            # 必须走 /edits 接口，并且以文件表单形式提交！
            # ==========================================
            url = f"{base_url}/images/edits" if not base_url.endswith("/v1") else f"{base_url}/edits"
            logger.info(f"✅ 检测到参考图，正切换至标准改图通道: {url}")
            
            try:
                image_bytes = await self._get_image_bytes(ref_image)
            except Exception as e:
                raise RuntimeError(f"读取参考图数据失败: {e}")

            # 构造标准的 multipart/form-data 文件表单
            data = aiohttp.FormData()
            data.add_field('image', image_bytes, filename='reference.png', content_type='image/png')
            data.add_field('prompt', prompt)
            data.add_field('model', self.config.model)
            data.add_field('n', '1')
            
            headers = {
                "Authorization": f"Bearer {current_key}"
                # 警惕暗坑：千万不要手动写 Content-Type 为 application/json，aiohttp 会自动生成边界符
            }
            
            logger.debug(f"[{self.config.id}] 📦 Payload -> [Multipart Form Data: 文件流 + 提示词]")
            
            timeout_obj = aiohttp.ClientTimeout(total=self.config.timeout)
            async with self.session.post(url, data=data, headers=headers, timeout=timeout_obj) as response:
                return await self._parse_response(response, base_url)
                
        else:
            # ==========================================
            # 🎨 文生图模式 (Text-to-Image / Generations)
            # ==========================================
            url = f"{base_url}/images/generations" if not base_url.endswith("/v1") else f"{base_url}/generations"
            
            payload = {
                "model": self.config.model,
                "prompt": prompt,
                "n": 1,
            }
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {current_key}"
            }
            
            logger.debug(f"[{self.config.id}] 📦 JSON Payload -> {json.dumps(payload, ensure_ascii=False)}")
            
            timeout_obj = aiohttp.ClientTimeout(total=self.config.timeout)
            async with self.session.post(url, json=payload, headers=headers, timeout=timeout_obj) as response:
                return await self._parse_response(response, base_url)

    async def _parse_response(self, response: aiohttp.ClientResponse, base_url: str) -> str:
        status = response.status
        if status != 200:
            error_text = await response.text()
            logger.error(f"[{self.config.id}] 💥 API 返回错误:\n{error_text}")
            error_msg = error_text
            try:
                error_json = json.loads(error_text)
                if "error" in error_json and "message" in error_json["error"]:
                    error_msg = error_json["error"]["message"]
            except: pass
            
            # 提供更直观的报错引导
            if "not exist" in error_text.lower() or status == 404:
                error_msg += " (提示: 您的 API 节点可能不支持标准的 /images/edits 改图接口哦)"
                
            raise RuntimeError(f"HTTP {status}: {error_msg}")
        
        result = await response.json()
        
        if "data" in result and len(result["data"]) > 0:
            if "b64_json" in result["data"][0]:
                return f"data:image/png;base64,{result['data'][0]['b64_json']}"
            if "url" in result["data"][0]:
                img_url = result["data"][0]["url"]
                if not img_url.startswith("http") and not img_url.startswith("data:"):
                    img_url = f"{base_url.rstrip('/v1')}/{img_url.lstrip('/')}"
                return img_url
                
        raise ValueError(f"API 返回结构异常，未找到图片数据: {result}")"""
AstrBot 万象画卷插件 v3.0 - OpenAI 兼容实现
支持多维度控制：WebUI 固定人脸 (persona_ref) + 用户动态发送姿势 (user_ref)
"""
import aiohttp
import json
from typing import Any
from astrbot.api import logger
from .base import BaseProvider

class OpenAIProvider(BaseProvider):
    
    async def generate_image(self, prompt: str, **kwargs: Any) -> str:
        current_key = self.get_current_key()
        if not current_key:
            raise ValueError(f"节点 [{self.config.id}] 未配置 API Key！")

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {current_key}"
        }
        
        base_url = self.config.base_url.rstrip("/")
        url = f"{base_url}/images/generations" if not base_url.endswith("/v1") else f"{base_url}/generations"
        
        # 提取双重参考图
        persona_ref = kwargs.get("persona_ref") # WebUI 上传的人脸/形象
        user_ref = kwargs.get("user_ref")       # 用户聊天的姿势/服装

        b64_persona = None
        b64_user = None
        
        model_lower = self.config.model.lower()
        if "dall-e" not in model_lower:
            if persona_ref:
                b64_persona = self.encode_local_image_to_base64(persona_ref) if not persona_ref.startswith("http") else persona_ref
            if user_ref:
                b64_user = self.encode_local_image_to_base64(user_ref) if not user_ref.startswith("http") else user_ref
        else:
            if persona_ref or user_ref:
                logger.warning(f"⚠️ 模型 {self.config.model} 原生不支持参考图，将退化为纯文本生图。")

        # 组装 Payload
        payload = {
            "model": self.config.model,
            "prompt": prompt,
            "n": 1,
        }
        
        # 将 kwargs 里的常规参数注入 (过滤掉自定义参数)
        for k, v in kwargs.items():
            if k not in ["persona_ref", "user_ref"]:
                payload[k] = v

        # 注入参考图逻辑 (支持 Banana 等第三方网关的 ControlNet 参数)
        if b64_user:
            payload["image"] = b64_user
            logger.info("✅ 注入动态用户参考图 (作为主图/姿势/服装控制)")
            if b64_persona:
                payload["face_ref"] = b64_persona 
                logger.info("✅ 注入固定形象面部参考图 (作为脸部锚点控制)")
        elif b64_persona:
            payload["image"] = b64_persona
            logger.info("✅ 注入固定形象参考图 (作为主图控制)")

        safe_key = f"{current_key[:4]}...{current_key[-4:]}" if len(current_key) > 8 else "INVALID_KEY"
        logger.info(f"[{self.config.id}] 📡 发起请求 -> URL: {url}")
        
        payload_for_log = {k: (v[:30] + '...' if (isinstance(v, str) and v.startswith('data:image')) else v) for k, v in payload.items()}
        logger.debug(f"[{self.config.id}] 📦 Payload -> {json.dumps(payload_for_log, ensure_ascii=False)}")
        
        timeout_obj = aiohttp.ClientTimeout(total=self.config.timeout)
        
        async with self.session.post(url, json=payload, headers=headers, timeout=timeout_obj) as response:
            status = response.status
            if status != 200:
                error_text = await response.text()
                logger.error(f"[{self.config.id}] 💥 API 返回错误:\n{error_text}")
                error_msg = error_text
                try:
                    error_json = json.loads(error_text)
                    if "error" in error_json and "message" in error_json["error"]:
                        error_msg = error_json["error"]["message"]
                except: pass
                raise RuntimeError(f"HTTP {status}: {error_msg}")
            
            result = await response.json()
            
            if "data" in result and len(result["data"]) > 0:
                if "b64_json" in result["data"][0]:
                    return f"data:image/png;base64,{result['data'][0]['b64_json']}"
                if "url" in result["data"][0]:
                    img_url = result["data"][0]["url"]
                    if not img_url.startswith("http") and not img_url.startswith("data:"):
                        img_url = f"{base_url.rstrip('/v1')}/{img_url.lstrip('/')}"
                    return img_url
                    
            raise ValueError(f"API返回结构异常，未找到图片数据: {result}")
