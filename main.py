"""
AstrBot 万象画卷插件 v1.6.0

更新说明：
- 废弃聊天上传指令，全面接入 AstrBot WebUI 原生 Image 上传组件
"""

import aiohttp
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

@register("astrbot_plugin_omnidraw", "your_name", "万象画卷 - 深度多模态工程版", "1.6.0")
class OmniDrawPlugin(Star):
    def __init__(self, context: Context, config: dict = None):
        super().__init__(context)
        # WebUI 自动保存文件，我们直接读取配置即可
        self.plugin_config = PluginConfig.from_dict(config or {})
        self.cmd_parser = CommandParser()
        self.persona_manager = PersonaManager(self.plugin_config)
        
        logger.info(f"{MessageEmoji.SUCCESS} 万象画卷插件 v1.6.0 加载完毕! (已启用 WebUI 极速传图)")

    @filter.command("万象帮助")
    @handle_errors
    async def cmd_help(self, event: AstrMessageEvent) -> AsyncGenerator[Any, None]:
        help_text = """📖 万象画卷 v1.6.0 帮助
━━━━━━━━━━━━
🎨 核心作画:
/画 [提示词] [--参数]

🤖 智能召唤:
日常对话提及人设、外貌需求，大模型将自动决策调用画笔。

⚙️ 管理指令:
/切模型 [节点ID] [模型名]

💡 提示：人设参考图请直接前往 WebUI 面板点击上传！"""
        yield event.plain_result(help_text)

    @filter.command("画")
    @handle_errors
    async def cmd_draw(self, event: AstrMessageEvent, message: str = "") -> AsyncGenerator[Any, None]:
        message = message.strip()
        if not message:
            yield event.plain_result(f"{MessageEmoji.WARNING} 请输入提示词，例如：/画 一只猫")
            return
        
        prompt, kwargs = self.cmd_parser.parse(message)
        yield event.plain_result(f"{MessageEmoji.PAINTING} 收到灵感，正在绘制...")
        
        async with aiohttp.ClientSession() as session:
            chain_manager = ChainManager(self.plugin_config, session)
            image_url = await chain_manager.run_chain("text2img", prompt, **kwargs)
            
        yield event.chain_result([
            Image.fromURL(image_url),
            Plain(f"\n{MessageEmoji.SUCCESS} 画好啦！\n提示词: {prompt}")
        ])

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
        
        async with aiohttp.ClientSession() as session:
            chain_manager = ChainManager(self.plugin_config, session)
            image_url = await chain_manager.run_chain(chain_to_use, final_prompt, **extra_kwargs)
            
        yield event.chain_result([
            Image.fromURL(image_url),
            Plain(f"\n{MessageEmoji.SUCCESS} 铛铛！为你画好啦！")
        ])

    @llm_tool(name="generate_selfie", description="以此 AI 助理（我）的特定人设和形象拍摄一张自拍或人像照片。当用户在日常聊天中通过自然语言表达出想看看我、看看腿、要求我发自拍或人像照片时，必须调用此工具。传入的 action 必须是你根据上下文自动生成的、包含动作、场景、光影细节的描述。")
    async def tool_generate_selfie(self, event: AstrMessageEvent, action: str) -> AsyncGenerator[Any, None]:
        """供大语言模型调用的自拍/人像工具。
        Args:
            action (string): 你自主决策的场景和动作描述。
        """
        logger.info(f"🧠 [LLM Tool] 触发智能自拍！描述: {action}")
        try:
            selected_persona = self.persona_manager.get_closest_persona(action)
            final_prompt, extra_kwargs = self.persona_manager.build_persona_prompt(selected_persona, action)
            chain_to_use = "selfie" if "selfie" in self.plugin_config.chains else "text2img"
            
            async with aiohttp.ClientSession() as session:
                chain_manager = ChainManager(self.plugin_config, session)
                image_url = await chain_manager.run_chain(chain_to_use, final_prompt, **extra_kwargs)
                
            yield event.chain_result([Image.fromURL(image_url)])
        except Exception as e:
            logger.error(f"❌ [LLM Tool] 自拍失败: {e}", exc_info=True)
            yield event.plain_result(f"{MessageEmoji.ERROR} 画笔坏了：{str(e)}")

    @llm_tool(name="generate_image", description="AI 绘图生成器。当用户请求画图、生成图片或提出明确的画面描述要求你画出来时，必须调用此工具。")
    async def tool_generate_image(self, event: AstrMessageEvent, prompt: str) -> AsyncGenerator[Any, None]:
        """供大语言模型调用的画图接口。
        Args:
            prompt (string): 根据用户需求扩写并翻译成英文的高质量提示词。
        """
        logger.info(f"🧠 [LLM Tool] 触发画图！描述: {prompt}")
        try:
            yield event.plain_result(f"{MessageEmoji.PAINTING} 好的，我马上为你作画，请稍等片刻...")
            
            async with aiohttp.ClientSession() as session:
                chain_manager = ChainManager(self.plugin_config, session)
                image_url = await chain_manager.run_chain("text2img", prompt)
                
            yield event.chain_result([
                Image.fromURL(image_url),
                Plain(f"\n{MessageEmoji.SUCCESS} 为你画好啦！\n(Prompt: {prompt})")
            ])
        except Exception as e:
            logger.error(f"❌ [LLM Tool] 画图失败: {e}", exc_info=True)
            yield event.plain_result(f"{MessageEmoji.ERROR} 画笔坏了：{str(e)}")

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
        
        yield event.plain_result(f"{MessageEmoji.SUCCESS} 节点 [{provider_id}] 模型已切换: {old_model} ➔ {new_model}")
