"""
AstrBot 万象画卷插件 v3.1
功能：防盗链突破 + LLM 静默后台回显(不在群内刷屏) + 强化人设图传输
"""
import os
import base64
import uuid
import time
import aiohttp
import asyncio
from typing import AsyncGenerator, Any

from astrbot.api.star import Context, Star, register
from astrbot.api.event import filter, AstrMessageEvent
from astrbot.api.message_components import Image, Plain, Video
from astrbot.api import logger, llm_tool 

from .models import PluginConfig
from .constants import MessageEmoji
from .utils import handle_errors
from .core.chain_manager import ChainManager
from .core.parser import CommandParser
from .core.persona_manager import PersonaManager
from .core.video_manager import VideoManager

@register("astrbot_plugin_omnidraw", "your_name", "万象画卷 v3.1 - 终极版", "3.1.0")
class OmniDrawPlugin(Star):
    def __init__(self, context: Context, config: dict = None):
        super().__init__(context)
        self.plugin_config = PluginConfig.from_dict(config or {})
        self.cmd_parser = CommandParser()
        self.persona_manager = PersonaManager(self.plugin_config)
        self.video_manager = VideoManager(self.plugin_config)

    def _get_event_images(self, event: AstrMessageEvent) -> list:
        """从消息中提取原始的图片路径或URL列表"""
        images = []
        for comp in event.message_obj.message:
            if isinstance(comp, Image):
                path = getattr(comp, "path", getattr(comp, "file", None))
                url = getattr(comp, "url", None)
                img_ref = path if (path and not path.startswith("http")) else url
                if img_ref:
                    images.append(img_ref)
        return images

    async def _process_images_to_base64(self, raw_images: list) -> list:
        """将原始图片(网络/本地)强力转换为兼容 API 的 Base64"""
        processed = []
        if not raw_images:
            return processed
            
        save_dir = os.path.abspath(os.path.join(os.getcwd(), "data", "plugin_data", "astrbot_plugin_omnidraw", "user_refs"))
        os.makedirs(save_dir, exist_ok=True)
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        
        async with aiohttp.ClientSession() as session:
            for img_ref in raw_images:
                if not img_ref: continue
                if img_ref.startswith("http"):
                    success = False
                    for attempt in range(3):
                        try:
                            async with session.get(img_ref, headers=headers, timeout=15) as resp:
                                if resp.status == 200:
                                    img_data = await resp.read()
                                    b64_str = base64.b64encode(img_data).decode("utf-8")
                                    processed.append(f"data:image/png;base64,{b64_str}")
                                    success = True
                                    logger.info(f"🛡️ [防盗链突破] 成功获取网络图并转码")
                                    break
                        except Exception as e:
                            logger.warning(f"⚠️ [防盗链] 下载异常 (尝试 {attempt+1}/3): {e}")
                        await asyncio.sleep(1)
                    if not success:
                        logger.error(f"❌ [防盗链] 彻底丢失参考图: {img_ref}")
                else:
                    try:
                        if os.path.exists(img_ref):
                            with open(img_ref, "rb") as f:
                                img_data = f.read()
                            b64_str = base64.b64encode(img_data).decode("utf-8")
                            processed.append(f"data:image/png;base64,{b64_str}")
                            logger.info(f"🛡️ [本地读取] 成功转码本地图: {img_ref}")
                        else:
                            logger.error(f"❌ [本地读取] 找不到文件: {img_ref}")
                    except Exception as e:
                        logger.error(f"❌ [本地读取] 异常: {e}")
        return processed

    def _has_permission(self, event: AstrMessageEvent) -> bool:
        allowed = self.plugin_config.allowed_users
        if not allowed:
            return True
        sender_id = str(event.get_sender_id())
        if sender_id in allowed:
            return True
        logger.warning(f"🚫 拦截无权限调用: {sender_id}")
        return False

    def _create_image_component(self, image_url: str) -> Image:
        if image_url.startswith("data:image"):
            b64_data = image_url.split(",", 1)[1]
            save_dir = os.path.abspath(os.path.join(os.getcwd(), "data", "plugin_data", "astrbot_plugin_omnidraw", "temp_images"))
            os.makedirs(save_dir, exist_ok=True)
            file_path = os.path.join(save_dir, f"img_{uuid.uuid4().hex[:8]}.png")
            with open(file_path, "wb") as f:
                f.write(base64.b64decode(b64_data))
            return Image.fromFileSystem(file_path)
        else:
            return Image.fromURL(image_url)

    def _get_active_provider(self):
        chain = self.plugin_config.chains.get("text2img", [])
        if chain: return self.plugin_config.get_provider(chain[0])
        if self.plugin_config.providers: return self.plugin_config.providers[0]
        return None

    @filter.command("万象帮助")
    @handle_errors
    async def cmd_help(self, event: AstrMessageEvent) -> AsyncGenerator[Any, None]:
        yield event.plain_result("📖 万象画卷 v3.1\n/画 [提示词]\n/自拍 [动作描述]\n/切换模型 [序号]\n/视频 [提示词]")

    @filter.command("切换模型")
    @handle_errors
    async def cmd_switch_model(self, event: AstrMessageEvent, target: str = "") -> AsyncGenerator[Any, None]:
        if not self._has_permission(event):
            yield event.plain_result(f"{MessageEmoji.WARNING} 暂无权限！")
            return
        provider = self._get_active_provider()
        if not provider or not provider.available_models:
            yield event.plain_result(f"{MessageEmoji.WARNING} 未配置可用模型！")
            return
        target = target.strip()
        if not target:
            msg = f"⚙️ 当前节点 [{provider.id}] 的可用模型：\n"
            for i, m in enumerate(provider.available_models):
                is_active = " 👈(当前)" if m == provider.model else ""
                msg += f"[{i+1}] {m}{is_active}\n"
            yield event.plain_result(msg)
            return
        selected_model = target if target in provider.available_models else (provider.available_models[int(target)-1] if target.isdigit() and 0 <= int(target)-1 < len(provider.available_models) else None)
        if not selected_model:
            yield event.plain_result(f"{MessageEmoji.ERROR} 找不到该模型！")
            return
        provider.model = selected_model
        yield event.plain_result(f"✅ 已切换至模型：{selected_model}")

    # ==========================================
    # 常规指令区 (保持指令回显给用户看)
    # ==========================================
    @filter.command("画")
    @handle_errors
    async def cmd_draw(self, event: AstrMessageEvent, message: str = "") -> AsyncGenerator[Any, None]:
        if not self._has_permission(event):
            yield event.plain_result(f"{MessageEmoji.WARNING} 抱歉，暂无权限！")
            return

        message = message.strip()
        raw_refs = self._get_event_images(event)
        
        if not message and not raw_refs:
            yield event.plain_result(f"{MessageEmoji.WARNING} 请输入提示词或附带一张参考图！")
            return
            
        safe_refs = await self._process_images_to_base64(raw_refs)
        prompt, kwargs = self.cmd_parser.parse(message)
        
        actual_ref_count = 0
        if safe_refs:
            kwargs["user_ref"] = safe_refs[0]
            actual_ref_count = 1
            
        yield event.plain_result(
            f"{MessageEmoji.PAINTING} 收到灵感，正在绘制...\n"
            f"📝 最终提示词：{prompt}\n"
            f"🖼️ 实际参考图：{actual_ref_count} 张"
        )
        
        async with aiohttp.ClientSession() as session:
            chain_manager = ChainManager(self.plugin_config, session)
            image_url = await chain_manager.run_chain("text2img", prompt, **kwargs)
            
        yield event.chain_result([self._create_image_component(image_url)])

    @filter.command("自拍")
    @handle_errors
    async def cmd_selfie(self, event: AstrMessageEvent, message: str = "") -> AsyncGenerator[Any, None]:
        if not self._has_permission(event):
            yield event.plain_result(f"{MessageEmoji.WARNING} 抱歉，暂无权限！")
            return

        user_input = message.strip() if message else "看着镜头微笑"
        final_prompt, extra_kwargs = self.persona_manager.build_persona_prompt(user_input)
        
        persona_ref = extra_kwargs.get("user_ref", "")
        raw_refs = self._get_event_images(event)
        
        target_refs = raw_refs if raw_refs else ([persona_ref] if persona_ref else [])
        safe_refs = await self._process_images_to_base64(target_refs)
        
        actual_ref_count = 0
        if safe_refs:
            extra_kwargs["user_ref"] = safe_refs[0]
            actual_ref_count = 1
        else:
            extra_kwargs.pop("user_ref", None) 
            
        yield event.plain_result(
            f"{MessageEmoji.INFO} 正在为「{self.plugin_config.persona_name}」生成自拍...\n"
            f"📝 最终提示词：{final_prompt}\n"
            f"🖼️ 实际参考图：{actual_ref_count} 张"
        )
        
        chain_to_use = "selfie" if "selfie" in self.plugin_config.chains else "text2img"
        async with aiohttp.ClientSession() as session:
            chain_manager = ChainManager(self.plugin_config, session)
            image_url = await chain_manager.run_chain(chain_to_use, final_prompt, **extra_kwargs)
            
        yield event.chain_result([self._create_image_component(image_url)])

    @filter.command("视频")
    @handle_errors
    async def cmd_video(self, event: AstrMessageEvent, message: str = "") -> AsyncGenerator[Any, None]:
        if not self._has_permission(event):
            yield event.plain_result(f"{MessageEmoji.WARNING} 抱歉，暂无权限！")
            return

        message = message.strip()
        raw_refs = self._get_event_images(event)
        
        if not message and not raw_refs:
            yield event.plain_result(f"{MessageEmoji.WARNING} 请输入视频提示词或附带参考图！")
            return
            
        prompt, _ = self.cmd_parser.parse(message)
        safe_refs = await self._process_images_to_base64(raw_refs)
        
        yield event.plain_result(
            f"{MessageEmoji.INFO} 视频任务已提交后台！\n"
            f"📝 最终提示词：{prompt}\n"
            f"🖼️ 实际参考图：{len(safe_refs)} 张\n"
            f"⏳ 正在渲染，请稍候..."
        )
        
        asyncio.create_task(self.video_manager.background_task_runner(event, prompt, safe_refs))

    # ==========================================
    # 🤖 LLM 工具区 (静默化！回显转入后台日志！)
    # ==========================================
    @llm_tool(name="generate_selfie")
    async def tool_generate_selfie(self, event: AstrMessageEvent, action: str) -> str:
        """
        以此 AI 助理（我）的固定人设拍摄自拍。
        Args:
            action (string): 动作和场景描述。纯动作描述即可，无需包含人物长相特征。
        """
        if not self._has_permission(event):
            return "系统提示：无权限调用。"

        try:
            final_prompt, extra_kwargs = self.persona_manager.build_persona_prompt(action)
            persona_ref = extra_kwargs.get("user_ref", "")
            raw_refs = self._get_event_images(event)
            
            # 🚀 第一步：优先安全处理并注入所有图片
            target_refs = raw_refs if raw_refs else ([persona_ref] if persona_ref else [])
            safe_refs = await self._process_images_to_base64(target_refs)
            
            actual_ref_count = 0
            if safe_refs:
                extra_kwargs["user_ref"] = safe_refs[0]
                actual_ref_count = 1
            else:
                extra_kwargs.pop("user_ref", None)
                
            # 🚀 第二步：不打扰群友，在后台详细打桩打印！
            logger.info(f"📸 [LLM 工具调用] generate_selfie\n"
                        f"📝 注入提示词：{final_prompt}\n"
                        f"🖼️ 注入参考图：{actual_ref_count} 张")

            # 🚀 第三步：携带完整参数正式请求 API
            chain_to_use = "selfie" if "selfie" in self.plugin_config.chains else "text2img"
            async with aiohttp.ClientSession() as session:
                chain_manager = ChainManager(self.plugin_config, session)
                image_url = await chain_manager.run_chain(chain_to_use, final_prompt, **extra_kwargs)
            
            await event.send(event.chain_result([self._create_image_component(image_url)]))
            return "系统提示：自拍发送成功。请回复一句话闲聊收尾。"
            
        except Exception as e:
            return f"系统提示：画图失败 ({str(e)})。"

    @llm_tool(name="generate_image")
    async def tool_generate_image(self, event: AstrMessageEvent, prompt: str) -> str:
        """
        AI 画图工具。当用户提出明确的画面要求你画出来时调用此工具。
        Args:
            prompt (string): 扩写成英文的高质量动作与场景提示词。
        """
        if not self._has_permission(event):
            return "系统提示：无权限调用。"

        try:
            kwargs = {}
            raw_refs = self._get_event_images(event)
            
            # 🚀 优先注入图片
            safe_refs = await self._process_images_to_base64(raw_refs)
            actual_ref_count = 0
            if safe_refs:
                kwargs["user_ref"] = safe_refs[0]
                actual_ref_count = 1
                
            # 🚀 后台精准打桩
            logger.info(f"🎨 [LLM 工具调用] generate_image\n"
                        f"📝 注入提示词：{prompt}\n"
                        f"🖼️ 注入参考图：{actual_ref_count} 张")

            async with aiohttp.ClientSession() as session:
                chain_manager = ChainManager(self.plugin_config, session)
                image_url = await chain_manager.run_chain("text2img", prompt, **kwargs)

            await event.send(event.chain_result([self._create_image_component(image_url)]))
            return "系统提示：画图发送成功。请立刻回复用户一句话完美收尾。"

        except Exception as e:
            return f"系统提示：画图失败 ({str(e)})。"

    @llm_tool(name="generate_video")
    async def tool_generate_video(self, event: AstrMessageEvent, prompt: str) -> str:
        """
        AI 视频生成工具。当用户要求生成一段视频(mp4)时调用此工具。
        Args:
            prompt (string): 扩写成英文的高质量视频场景和动作提示词。
        """
        if not self._has_permission(event):
            return "系统提示：无权限调用。"

        try:
            raw_refs = self._get_event_images(event)
            
            # 🚀 优先注入图片
            safe_refs = await self._process_images_to_base64(raw_refs)
            
            # 🚀 后台精准打桩
            logger.info(f"🎞️ [LLM 工具调用] generate_video\n"
                        f"📝 注入提示词：{prompt}\n"
                        f"🖼️ 注入参考图：{len(safe_refs)} 张")
            
            asyncio.create_task(self.video_manager.background_task_runner(event, prompt, safe_refs))
            return "系统提示：视频任务已提交后台。请用自然语气告诉用户正在渲染中，稍后主动发给他。"

        except Exception as e:
            return f"系统提示：视频渲染失败 ({str(e)})。"
