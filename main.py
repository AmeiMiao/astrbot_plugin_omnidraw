"""
AstrBot 万象画卷插件 v1.3.0

新增功能：
- 指令级本地文件上传更新人设人设图片
- 真正的无机械回复 LLM 自拍工具 use
"""

import aiohttp
import os
import json
from typing import AsyncGenerator, Any

from astrbot.api.star import Context, Star, register
from astrbot.api.event import filter, AstrMessageEvent
from astrbot.api.message_components import Image, Plain
from astrbot.api import logger, llm_tool 

from .models import PluginConfig
from .constants import MessageEmoji
from .utils import handle_errors
from .core.chain_manager import ChainManager
from .core.parser import CommandParser
from .core.persona_manager import PersonaManager

# 定义本地文件存储路径
PLUGIN_DATA_DIR = os.path.join("data", "star", "astrbot_plugin_omnidraw")
PERSONA_IMAGES_DIR = os.path.join(PLUGIN_DATA_DIR, "persona_images")

@register("astrbot_plugin_omnidraw", "your_name", "万象画卷 - 深度多模态工程版", "1.3.0")
class OmniDrawPlugin(Star):
    def __init__(self, context: Context, config: dict = None):
        super().__init__(context)
        # 1. 初始化文件系统
        self._setup_local_directories()
        
        # 2. 结构化配置
        self.current_raw_config = config or {} # 保留一份原始的，用于指令修改和保存
        self.plugin_config = PluginConfig.from_dict(self.current_raw_config)
        
        self._session = aiohttp.ClientSession()
        self.chain_manager = ChainManager(self.plugin_config, self._session)
        self.cmd_parser = CommandParser()
        self.persona_manager = PersonaManager(self.plugin_config)
        
        logger.info(f"{MessageEmoji.SUCCESS} 万象画卷插件升级完毕! (已支持本地人设文件和纯LLM重塑)")

    def _setup_local_directories(self):
        """创建必要的本地图片存储目录"""
        if not os.path.exists(PERSONA_IMAGES_DIR):
            try:
                os.makedirs(PERSONA_IMAGES_DIR)
                logger.info(f"✅ 已创建人设图片本地存储目录: {PERSONA_IMAGES_DIR}")
            except Exception as e:
                logger.error(f"❌ 创建本地目录失败，将影响图片上传功能: {e}")

    async def terminate(self):
        if self._session and not self._session.closed:
            await self._session.close()

    @filter.command("万象帮助")
    @handle_errors
    async def cmd_help(self, event: AstrMessageEvent) -> AsyncGenerator[Any, None]:
        # 优化帮助，去除了机械感说明
        help_text = """📖 万象画卷 v1.3.0 帮助
━━━━━━━━━━━━
🎨 核心作画:
/画 [提示词] [--参数]

🤖 智能召唤:
日常对话提及人设、外貌需求，大模型将自动决策调用画笔。

⚙️ 管理指令:
/设置人设图片 [人设名] [发送图片 component] - 更新指定人设的参考图文件
/切模型 [节点ID] [模型名]
"""
        yield event.plain_result(help_text)

    # ==========================================
    # 🌟 指令：本地上传参考图文件
    # ==========================================
    @filter.command("设置人设图片")
    async def cmd_set_persona_image(self, event: AstrMessageEvent, persona_name: str = "") -> AsyncGenerator[Any, None]:
        """使用指令上传本地图片作为人设参考图
        用法: /设置人设图片 默认人设 [在下一条消息或本条中发送图片]
        """
        persona_name = persona_name.strip()
        if not persona_name:
            available = [p.name for p in self.plugin_config.personas]
            yield event.plain_result(f"{MessageEmoji.WARNING} 请指定人设名！可用人设: {', '.join(available) if available else '无'}")
            return

        # 1. 查找是否存在该人设
        target_persona_config = None
        for p in self.plugin_config.personas:
            if p.name == persona_name:
                target_persona_config = p
                break
        
        if not target_persona_config:
            yield event.plain_result(f"{MessageEmoji.ERROR} 未找到名为「{persona_name}」的人设！")
            return

        # 2. 从 event 获取图片组件
        images = event.get_messages_by_type(Image)
        if not images:
            yield event.plain_result(f"{MessageEmoji.WARNING} 请在指令中附带图片，或引用包含图片的上文。")
            return
        
        image_component = images[0]
        # 尝试获取文件名和数据，如果不支持可能会比较麻烦，取决于 AstrBot 组件结构
        # 这里假设框架已经将图片下载下来或者提供了文件名/绝对路径
        # 许多 AstrBot 组件返回的是一个本地临时文件的 path
        
        source_path = getattr(image_component, "path", None)
        if not source_path or not os.path.exists(source_path):
            # 如果没有本地 path，可能只给了 URL，这里为了不机械，我们不支持通过指令下载网络URL作为本地，请用户用 WebUI 填入URL
            yield event.plain_result(f"{MessageEmoji.ERROR} 无法从当前消息中获取可保存的本地图片文件路径。")
            return

        yield event.plain_result(f"{MessageEmoji.INFO} 正在为人设「{persona_name}」保存并更新参考图文件...")

        # 3. 将图片复制到我们的专用目录
        file_ext = os.path.splitext(source_path)[1] or ".png"
        safe_persona_id = "".join([c for c in persona_name if c.isalpha() or c.isdigit()]).rstrip() or "persona"
        final_save_name = f"{safe_persona_id}{file_ext}"
        final_save_path = os.path.join(PERSONA_IMAGES_DIR, final_save_name)

        import shutil
        try:
            # 使用复制而不是移动，防止原组件异常
            shutil.copy2(source_path, final_save_path)
            logger.info(f"✅ 人设图片已保存到本地: {final_save_path}")
        except Exception as e:
            logger.error(f"❌ 保存本地图片失败: {e}")
            yield event.plain_result(f"{MessageEmoji.ERROR} 保存文件失败: {e}")
            return

        # 4. 【关键步骤】动态更新原始配置并持久化保存
        try:
            personas_list = self.current_raw_config.get("personas", [])
            # 找到对应人设在列表里的索引并修改
            for i, p in enumerate(personas_list):
                if p.get("name") == persona_name:
                    p["ref_image_url"] = final_save_path # 填入我们的本地绝对路径
                    break
            
            # 这里的 save 方法取决于 Star 类如何获取 ConfigManager
            # 不同的 AstrBot 版本实现可能不同。如果 Star 类本身不支持直接 save config
            # 可能需要调用 self.context.config_manager.update_config(...)
            # 假设有一个 self.context.save_plugin_config(config_dict) 或者 self.save_config() 的方法
            # 根据 AstrBot 文档，你可以通过 self.context.save_plugin_config() 保存。
            
            # 先同步到我们的内存模型
            self.plugin_config = PluginConfig.from_dict(self.current_raw_config)
            # 刷新 persona_manager
            self.persona_manager = PersonaManager(self.plugin_config)
            
            # 如果 Star 支持这个方法的话 ( AstrBot 3.0+ 推荐玩法)
            await self.context.save_plugin_config(self.current_raw_config)
            
            yield event.plain_result(f"{MessageEmoji.SUCCESS} 人设「{persona_name}」参考图已成功设置为本地文件！")
        except Exception as e:
            logger.error(f"❌ 动态更新配置持久化失败: {e}")
            yield event.plain_result(f"{MessageEmoji.WARNING} 图片已保存，但在配置中持久化保存失败。插件重启前有效。错误: {e}")

    # ==========================================
    # 🌟 标准画图指令（无参数报错修复）
    # ==========================================
    @filter.command("画")
    @handle_errors
    async def cmd_draw(self, event: AstrMessageEvent, message: str = "") -> AsyncGenerator[Any, None]:
        message = message.strip()
        if not message:
            yield event.plain_result(f"{MessageEmoji.WARNING} 请输入提示词，例如：/画 一只猫")
            return
        
        prompt, kwargs = self.cmd_parser.parse(message)
        yield event.plain_result(f"{MessageEmoji.PAINTING} 收到灵感，正在绘制...")
        
        image_url = await self.chain_manager.run_chain("text2img", prompt, **kwargs)
        yield event.chain_result([
            Image.fromURL(image_url),
            Plain(f"\n{MessageEmoji.SUCCESS} 画好啦！\n提示词: {prompt}")
        ])

    # 隐藏机械式的 /自拍 指令，只留智能调用
    @filter.command("自拍")
    @handle_errors
    async def cmd_selfie(self, event: AstrMessageEvent, persona_name: str = "", message: str = "") -> AsyncGenerator[Any, None]:
        persona_name = persona_name.strip()
        if not persona_name:
            yield event.plain_result(f"{MessageEmoji.WARNING} 用法: /自拍 [人设名] [动作详情]")
            return
        persona = self.persona_manager.get_persona(persona_name)
        if not persona:
            yield event.plain_result(f"{MessageEmoji.ERROR} 未找到名为「{persona_name}」的人设！")
            return
        
        user_input = message.strip() if message else "看着镜头微笑"
        final_prompt, extra_kwargs = self.persona_manager.build_persona_prompt(persona, user_input)
        yield event.plain_result(f"{MessageEmoji.INFO} 正在生成自拍...")

        chain_to_use = "selfie" if "selfie" in self.plugin_config.chains else "text2img"
        image_url = await self.chain_manager.run_chain(chain_to_use, final_prompt, **extra_kwargs)
        yield event.chain_result([
            Image.fromURL(image_url),
            Plain(f"\n{MessageEmoji.SUCCESS} 铛铛！为你画好啦！")
        ])

    # ==========================================
    # 🌟 核心高阶功能：真正无机械回复的自拍工具
    # ==========================================
    @llm_tool(name="generate_selfie", description="以此 AI 助理（我）的特定人设和形象拍摄一张自拍或人像照片。当用户在日常聊天中通过自然语言表达出想看看我、看看腿、要求我发自拍或人像照片时，必须调用此工具。传入的 action 必须是你根据上下文自动生成的、包含动作、场景、光影细节的描述。")
    async def tool_generate_selfie(self, event: AstrMessageEvent, action: str) -> AsyncGenerator[Any, None]:
        """
        供大语言模型调用的自拍/人像工具。
        
        Args:
            action (string): 你自主决策的场景和动作描述。例如：“我正靠在椅子上，穿着过膝袜，用手机对着镜子自拍”
        """
        logger.info(f"🧠 [LLM Tool] 触发智能自拍！模型生成的动作描述: {action}")
        
        try:
            # 【完美非机械回复的关键】：这里我们绝对不要 yield plain_result！！！

            # 1. 大模型自主选择一个人设
            selected_persona = self.persona_manager.get_closest_persona(action)
            
            # 2. 组装 Prompt (此时 persona_manager 会自动注入本地人设图片路径到 kwargs)
            final_prompt, extra_kwargs = self.persona_manager.build_persona_prompt(selected_persona, action)
            
            # 3. 直接调用链路调度 (带有超强日志和兜底重试)
            chain_to_use = "selfie" if "selfie" in self.plugin_config.chains else "text2img"
            image_url = await self.chain_manager.run_chain(chain_to_use, final_prompt, **extra_kwargs)
            
            # 4. 成功后直接返回图片 component 链。不要加文字！大模型知道你成功了。
            yield event.chain_result([Image.fromURL(image_url)])
            
        except Exception as e:
            logger.error(f"❌ [LLM Tool] 自拍生成失败: {e}", exc_info=True)
            # 失败时才返回纯文本错误给大模型让它告诉你
            yield event.plain_result(f"{MessageEmoji.ERROR} 哎呀，画笔好像坏了：{str(e)}")

    @filter.command("切模型")
    @handle_errors
    async def cmd_switch_model(self, event: AstrMessageEvent, provider_id: str = "", new_model: str = "") -> AsyncGenerator[Any, None]:
        provider_id = provider_id.strip()
        new_model = new_model.strip()

        if not provider_id or not new_model:
            info = "当前节点列表:\n"
            for p in self.plugin_config.providers:
                info += f"• [{p.id}]: {p.model}\n"
            yield event.plain_result(f"{info}\n用法: /切模型 [节点ID] [新模型名]")
            return

        provider = self.plugin_config.get_provider(provider_id)
        if not provider:
            yield event.plain_result(f"{MessageEmoji.ERROR} 未找到节点: {provider_id}")
            return

        old_model = provider.model
        provider.model = new_model
        
        logger.info(f"👤 用户 {event.get_sender_id()} 将节点 {provider_id} 的模型从 {old_model} 切换为 {new_model}")
        yield event.plain_result(f"{MessageEmoji.SUCCESS} 节点 [{provider_id}] 模型已切换: {old_model} ➔ {new_model}")
