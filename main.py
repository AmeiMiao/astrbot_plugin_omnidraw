"""
AstrBot 万象画卷插件 v1.1.0
"""

import aiohttp
from typing import AsyncGenerator, Any

from astrbot.api.star import Context, Star, register
from astrbot.api.event import filter, AstrMessageEvent
from astrbot.api.message_components import Image, Plain
from astrbot.api import logger

from .models import PluginConfig
from .constants import MessageEmoji
from .utils import handle_errors
from .core.chain_manager import ChainManager
from .core.parser import CommandParser
from .core.persona_manager import PersonaManager

@register("astrbot_plugin_omnidraw", "your_name", "万象画卷", "1.1.0")
class OmniDrawPlugin(Star):
    def __init__(self, context: Context, config: dict = None):
        super().__init__(context)
        self.plugin_config = PluginConfig.from_dict(config or {})
        self._session = aiohttp.ClientSession()
        self.chain_manager = ChainManager(self.plugin_config, self._session)
        self.cmd_parser = CommandParser()
        self.persona_manager = PersonaManager(self.plugin_config)
        logger.info(f"{MessageEmoji.SUCCESS} 万象画卷插件加载完毕!")

    async def terminate(self):
        if self._session and not self._session.closed:
            await self._session.close()

    @filter.command("万象帮助")
    @handle_errors
    async def cmd_help(self, event: AstrMessageEvent) -> AsyncGenerator[Any, None]:
        help_text = """📖 万象画卷 v1.1.0 帮助
━━━━━━━━━━━━
🎨 核心指令:
/画 [提示词] [--参数]
/自拍 [人设名] [动作]

⚙️ 管理指令:
/切模型 [节点ID] [模型名] - 动态换模型

💡 提示: 密钥已支持自动轮询，可在WebUI一行一个填入。"""
        yield event.plain_result(help_text)

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

    @filter.command("画")
    @handle_errors
    async def cmd_draw(self, event: AstrMessageEvent, message: str = "") -> AsyncGenerator[Any, None]:
        message = message.strip()
        if not message:
            yield event.plain_result(f"{MessageEmoji.WARNING} 请输入提示词，例如：/画 一只猫")
            return
        
        prompt, kwargs = self.cmd_parser.parse(message)
        yield event.plain_result(f"{MessageEmoji.PAINTING} 收到灵感，正在绘制，请稍候...")
        
        image_url = await self.chain_manager.run_chain("text2img", prompt, **kwargs)
        yield event.chain_result([
            Image.fromURL(image_url),
            Plain(f"\n{MessageEmoji.SUCCESS} 画好啦！\n提示词: {prompt}")
        ])

    @filter.command("自拍")
    @handle_errors
    async def cmd_selfie(self, event: AstrMessageEvent, persona_name: str = "", message: str = "") -> AsyncGenerator[Any, None]:
        persona_name = persona_name.strip()
        if not persona_name:
            available = [p.name for p in self.plugin_config.personas]
            yield event.plain_result(f"{MessageEmoji.WARNING} 请指定人设名！可用人设: {', '.join(available) if available else '无'}")
            return

        persona = self.persona_manager.get_persona(persona_name)
        if not persona:
            yield event.plain_result(f"{MessageEmoji.ERROR} 未找到名为「{persona_name}」的人设！")
            return

        message = message.strip()
        user_input = message if message else "看着镜头微笑"
        
        final_prompt, extra_kwargs = self.persona_manager.build_persona_prompt(persona, user_input)
        yield event.plain_result(f"{MessageEmoji.INFO} 正在以「{persona_name}」的形象进行拍摄...")

        chain_to_use = "selfie" if "selfie" in self.plugin_config.chains else "text2img"
        image_url = await self.chain_manager.run_chain(chain_to_use, final_prompt, **extra_kwargs)
        yield event.chain_result([
            Image.fromURL(image_url),
            Plain(f"\n{MessageEmoji.SUCCESS} 拍好啦！")
        ])
