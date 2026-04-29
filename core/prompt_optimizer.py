"""
提示词副脑优化器 (Prompt Optimizer)
功能：强制 LLM 输出自然语言格式，避免 JSON 带来的解析冗余，提供高质量生图提示词。
"""
import re
import aiohttp
import asyncio
from astrbot.api import logger
from ..models import PluginConfig

class PromptOptimizer:
    def __init__(self, config: PluginConfig):
        self.config = config

    async def optimize(self, raw_action: str, count: int = 1) -> list:
        if not getattr(self.config, "enable_optimizer", True):
            return [raw_action] * count

        if not raw_action or raw_action.strip() == "": 
            return [raw_action] * count

        chain = self.config.chains.get("optimizer", [])
        provider = self.config.get_provider(chain[0]) if chain else (self.config.providers[0] if self.config.providers else None)
        if not provider: 
            return [raw_action] * count
            
        base_url = provider.base_url.rstrip("/")
        endpoint = f"{base_url}/chat/completions" if base_url.endswith("/v1") else f"{base_url}/v1/chat/completions"
        headers = {"Authorization": f"Bearer {provider.api_keys[0]}", "Content-Type": "application/json"}

        # Use natural language instruction instead of JSON structure
        sys_prompt = f"""You are an expert AI image prompt engineer. Your task is to expand the user's short request into highly detailed, cinematic English prompts.

CRITICAL RULES:
1. OUTPUT PURE TEXT ONLY. Do not use JSON, lists, markdown formatting, or key-value pairs. Output a single, flowing paragraph of English text.
2. Structure your description using this mental framework, but blend it naturally:
   - Subject: Specify the person, animal, or object (appearance, clothing, expression).
   - Action/Pose: What the subject is doing. CRITICAL: Describe exactly ONE specific pose. NEVER use words like 'various', 'multiple', 'different angles'.
   - Setting: The surrounding environment, time of day, and background details.
   - Lighting & Atmosphere: E.g., cinematic lighting, golden hour, moody, neon glow.
   - Medium & Style: E.g., 8k resolution, Unreal Engine 5 render, oil painting, studio photography, macro lens.
3. Maximize Details: Use precise adjectives.
4. Output only the prompt text. No conversational filler.

ANTI-COLLAGE RULE: Describe exactly ONE single frozen moment. NEVER describe collages, grids, or multiple views.
"""
        
        if count > 1:
            sys_prompt += f"\nGenerate exactly {count} distinct variations, separated by three dashes (---)."

        payload = {
            "model": self.config.optimizer_model,
            "messages": [{"role": "system", "content": sys_prompt}, {"role": "user", "content": raw_action}],
            "max_tokens": 800 if count > 1 else 300, 
            "temperature": 0.8
        }

        async with aiohttp.ClientSession() as session:
            try:
                timeout_val = self.config.optimizer_timeout * (1.5 if count > 1 else 1.0)
                logger.info(f"🧠 [副脑] 正在重构 {count} 组独立提示词 (自然语言模式, 模型: {self.config.optimizer_model})")
                
                async with session.post(endpoint, headers=headers, json=payload, timeout=timeout_val) as resp:
                    resp.raise_for_status()
                    data = await resp.json()
                    
                    if "choices" in data and len(data["choices"]) > 0:
                        raw_content = data["choices"][0]["message"]["content"].strip()
                        
                        anti_collage_tags = ", 1girl, solo, single image, one single frame, complete and unified scene, NO grid, NO collage, NO split screen, NO multiple views"
                        
                        if count == 1:
                            final_prompt = raw_content + anti_collage_tags
                            logger.info(f"✨ [副脑] 成功提取 1 组提示词！")
                            return [final_prompt]
                        else:
                            # Split by dashes if generating multiple variations
                            variations = [p.strip() + anti_collage_tags for p in re.split(r'\s*---\s*', raw_content) if p.strip()]
                            
                            while len(variations) < count:
                                variations.append(variations[0] if variations else raw_action + anti_collage_tags)
                                
                            logger.info(f"✨ [副脑] 成功提取 {len(variations[:count])} 组提示词！")
                            return variations[:count]
                            
            except Exception as e:
                logger.warning(f"⚠️ [副脑降级] ({str(e)})")
                return [raw_action] * count
                
        return [raw_action] * count
