"""
视频任务后台挂机引擎 (Background Polling Task)
功能：代替大模型忍受视频生成的漫长耗时，不阻塞聊天通道。
支持用户在面板自定义三种市面主流接口模式，并提供完善的异步轮询与容错拦截。
"""
import re
import time
import os
import aiohttp
import asyncio
import base64
from typing import Optional
from astrbot.api import logger
from astrbot.api.message_components import Video, Plain
from astrbot.api.event import AstrMessageEvent

from ..models import PluginConfig, ProviderConfig

# 🚀 4. 定义专属异常类型，任务失败直接终止
class VideoTaskError(Exception):
    pass

class VideoManager:
    def __init__(self, config: PluginConfig):
        self.config = config

    def _get_active_video_provider(self) -> Optional[ProviderConfig]:
        """获取当前的主力视频节点"""
        chain = self.config.chains.get("video", [])
        if chain:
            return self.config.get_video_provider(chain[0])
        if self.config.video_providers:
            return self.config.video_providers[0]
        return None

    def _extract_url(self, text: str) -> str:
        match = re.search(r'(https?://[^\s\]\)"\']+)', text)
        return match.group(1) if match else text

    # 🚀 3. 参考图 base64 编码支持
    async def _encode_image_to_base64(self, image_ref: str, session: aiohttp.ClientSession) -> str:
        """自动判断来源，将网络图片下载或本地图片直读转换为 Base64"""
        try:
            if image_ref.startswith("http"):
                logger.info(f"📥 正在下载视频参考图并转码 Base64...")
                headers = {"User-Agent": "Mozilla/5.0"}
                async with session.get(image_ref, headers=headers, timeout=15) as resp:
                    if resp.status == 200:
                        image_bytes = await resp.read()
                        return "data:image/png;base64," + base64.b64encode(image_bytes).decode('utf-8')
            elif image_ref.startswith("data:image"):
                return image_ref
            else:
                if os.path.exists(image_ref):
                    with open(image_ref, "rb") as f:
                        return "data:image/png;base64," + base64.b64encode(f.read()).decode('utf-8')
        except Exception as e:
            logger.error(f"❌ 图片转 Base64 失败 ({image_ref}): {e}")
        return ""

    # 🚀 2. 异步任务队列模式支持 (task_id 轮询)
    async def _poll_task_result(self, provider: ProviderConfig, task_id: str, session: aiohttp.ClientSession) -> str:
        base_url = provider.base_url.rstrip("/")
        # 🚀 5. 轮询 URL 修复
        poll_url = f"{base_url}/videos/generations/{task_id}"
        
        headers = {
            "Authorization": f"Bearer {provider.api_keys[0]}",
            "Content-Type": "application/json"
        }

        # 计算最多可以轮询多少次（每次间隔 10 秒）
        max_retries = max(1, int(provider.timeout) // 10)
        
        for attempt in range(max_retries):
            await asyncio.sleep(10)
            try:
                async with session.get(poll_url, headers=headers, timeout=10) as resp:
                    resp.raise_for_status()
                    data = await resp.json()
                    
                    status = str(data.get("status", data.get("task_status", ""))).upper()
                    logger.info(f"⏳ [视频轮询] Task ID: {task_id}, 状态: {status} (尝试 {attempt+1}/{max_retries})")

                    # 自动识别成功状态
                    if status in ["SUCCESS", "SUCCEEDED", "COMPLETED"]:
                        video_url = data.get("video_url", data.get("url", ""))
                        if not video_url and "data" in data and isinstance(data["data"], list) and len(data["data"]) > 0:
                            video_url = data["data"][0].get("url", "")
                            
                        if video_url:
                            return video_url
                        else:
                            raise VideoTaskError("任务显示成功，但未找到视频 URL！")
                            
                    # 🚀 4. 自动识别 FAILURE 状态并阻断
                    elif status in ["FAIL", "FAILED", "FAILURE"]:
                        error_msg = data.get("error", data.get("message", "未知失败原因"))
                        raise VideoTaskError(f"API 节点拒绝或渲染失败，平台反馈：{error_msg}")
                        
            except VideoTaskError:
                raise # 直接向外抛出失败异常，不重试
            except Exception as e:
                logger.warning(f"⚠️ 轮询请求状态异常 (跳过本次): {e}")
                
        raise VideoTaskError(f"视频生成轮询超时！已达到设置的 {provider.timeout} 秒最大等待时间。")

    async def _fetch_video_from_api(self, provider: ProviderConfig, prompt: str, image_urls: list = None) -> str:
        if image_urls is None:
            image_urls = []
            
        headers = {
            "Authorization": f"Bearer {provider.api_keys[0]}",
            "Content-Type": "application/json"
        }
        
        base_url = provider.base_url.rstrip("/")
        api_type = provider.api_type # 取决于用户在配置面板里的选择
        
        async with aiohttp.ClientSession() as session:
            # 统一转码参考图为 Base64
            b64_images = []
            for img in image_urls:
                b64 = await self._encode_image_to_base64(img, session)
                if b64:
                    b64_images.append(b64)

            # --- 模式一：异步排队轮询模式 (Kling, Luma 等主流) ---
            if api_type == "async_task":
                endpoint = f"{base_url}/videos/generations"
                payload = {"model": provider.model, "prompt": prompt}
                # 🚀 3. 视频 API 使用 images 字段传递图片数组
                if b64_images:
                    payload["images"] = b64_images
                    
                logger.info(f"🎬 [Async Task 模式] 提交视频任务至: {endpoint}")
                async with session.post(endpoint, headers=headers, json=payload, timeout=30) as resp:
                    resp.raise_for_status()
                    data = await resp.json()
                    
                    # 兼容各家 API 返回的 ID 字段名
                    task_id = data.get("id") or data.get("task_id")
                    if not task_id and "data" in data and isinstance(data["data"], dict):
                        task_id = data["data"].get("task_id") or data["data"].get("id")
                        
                    if not task_id:
                        raise VideoTaskError(f"提交成功但未找到任务 ID。API 原始返回: {data}")
                        
                    logger.info(f"✅ 任务提交成功，获得 Task ID: {task_id}，即将进入轮询...")
                    return await self._poll_task_result(provider, str(task_id), session)

            # --- 模式二：同步直返模式 (Sora 官方标准) ---
            elif api_type == "openai_sync":
                endpoint = f"{base_url}/videos/generations"
                payload = {"model": provider.model, "prompt": prompt}
                if b64_images:
                    payload["images"] = b64_images 
                    payload["image_url"] = b64_images[0] # 兼容老版
                    
                logger.info(f"🎬 [Sync 模式] 阻塞请求视频至: {endpoint}")
                # 此模式可能会耗时很久，使用 provider.timeout
                async with session.post(endpoint, headers=headers, json=payload, timeout=provider.timeout) as resp:
                    resp.raise_for_status()
                    data = await resp.json()
                    if "data" in data and len(data["data"]) > 0:
                        return data["data"][0].get("url", "")
                    raise VideoTaskError(f"Generations 返回值异常: {data}")

            # --- 模式三：对话返回 URL 模式 (部分中转站魔改版) ---
            elif api_type == "openai_chat":
                endpoint = f"{base_url}/chat/completions"
                content = [{"type": "text", "text": prompt}]
                for b64_img in b64_images:
                    content.append({"type": "image_url", "image_url": {"url": b64_img}})
                payload = {"model": provider.model, "messages": [{"role": "user", "content": content}]}
                
                logger.info(f"🎬 [Chat 模式] 请求视频至: {endpoint}")
                async with session.post(endpoint, headers=headers, json=payload, timeout=provider.timeout) as resp:
                    resp.raise_for_status()
                    data = await resp.json()
                    if "choices" in data and len(data["choices"]) > 0:
                        raw_content = data["choices"][0]["message"]["content"]
                        return self._extract_url(raw_content)
                    raise VideoTaskError(f"Chat 返回值异常: {data}")

            else:
                raise ValueError(f"不受支持的接口模式: {api_type}，请在后台配置正确类型！")

    async def background_task_runner(self, event: AstrMessageEvent, prompt: str, image_urls: list = None):
        """
        幽灵任务：在后台默默执行，完成后主动回调发送
        """
        start_time = time.perf_counter()
        provider = self._get_active_video_provider()
        
        if not provider:
            await event.send(Plain("❌ 抱歉，管理员尚未配置可用的视频渲染节点。"))
            return

        try:
            video_url = await self._fetch_video_from_api(provider, prompt, image_urls)
            end_time = time.perf_counter()
            logger.info(f"✅ [视频任务完成] 耗时: {end_time - start_time:.2f} 秒！准备逆向推送给用户。")
            
            if video_url:
                await event.send(event.chain_result([
                    Plain(f"🎬 当当当！历时 {int(end_time - start_time)} 秒，你要求的视频渲染完成啦：\n"),
                    Video.fromURL(video_url)
                ]))
            else:
                await event.send(Plain("❌ 视频渲染失败：API 没有返回有效视频链接。"))

        except VideoTaskError as ve:
            # 🚀 4. 用户可看到具体失败原因 (被我们阻断的失败)
            await event.send(Plain(f"❌ 视频生成失败: {str(ve)}"))
        except Exception as e:
            # 其他网络或底层崩溃错误
            await event.send(Plain(f"❌ 后台视频渲染引擎发生错误：{str(e)}"))
