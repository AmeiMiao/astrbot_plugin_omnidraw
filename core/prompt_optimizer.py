"""
提示词副脑优化器 (Prompt Optimizer)
功能：强制 LLM 输出 JSON 格式保证结构完整，然后将其扁平化为顶级的自然语言/Tag流，以完美匹配底层绘图模型的审美上限。
带有无敌抢救模式，无视一切 JSON 语法错误与截断。
"""
import json
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

        if not raw_action or raw_action.strip() == "": return [raw_action] * count

        chain = self.config.chains.get("optimizer", [])
        provider = self.config.get_provider(chain[0]) if chain else (self.config.providers[0] if self.config.providers else None)
        if not provider: return [raw_action] * count
            
        base_url = provider.base_url.rstrip("/")
        endpoint = f"{base_url}/chat/completions" if base_url.endswith("/v1") else f"{base_url}/v1/chat/completions"
        headers = {"Authorization": f"Bearer {provider.api_keys[0]}", "Content-Type": "application/json"}

        # 🚀 极致细节骨架：强迫 LLM 输出极其专业的光影、材质和摄影机参数
        base_json_struct = """{
  "subject_appearance": "EXTREME DETAIL: exact age, ethnicity, body type, hyper-realistic skin texture, visible pores, peach fuzz, subsurface scattering, natural micro-blemishes, flawless anatomy, intricate facial features",
  "clothing_and_accessories": "EXTREME DETAIL: specific fabrics (e.g., thick knit, worn denim, translucent silk), micro-textures, wrinkles, seams, styling, realistic physical drape",
  "pose_and_action": "CRITICAL: EXACTLY ONE specific, natural pose. NEVER use words like various or multiple. Describe exact limb placement, micro-expressions, and eye contact",
  "environment_and_scene": "EXTREME DETAIL: specific real-world location, rich background elements, atmospheric effects (dust, haze, fog), depth, foreground elements out of focus",
  "lighting_and_mood": "PHOTOGRAPHIC LIGHTING: specific setups (e.g., Rembrandt, cinematic chiaroscuro, volumetric sunlight, rim light), global illumination, bounce light, shadow quality",
  "technical_specs": "CAMERA SPECS: exact camera (e.g., Hasselblad H6D, ARRI Alexa), specific lens (e.g., 85mm f/1.2), film stock (e.g., Kodak Portra 400), 8k, raw photo, ultra-sharp focus"
}"""

        if count == 1:
            sys_prompt = f"""You are a Master Prompt Engineer, Elite Cinematographer, and Anatomist for advanced AI image generation (like Midjourney v6 / DALL-E 3).
Output ONLY ONE valid JSON object based on the user's action.
CRITICAL RULES:
1. Output MUST be a valid JSON object. ALL keys and values MUST be strings.
2. Escape any inner double quotes with a backslash (\\").
3. ABSOLUTELY NO collages, grids, or multiple views. Describe exactly ONE single frozen moment.
4. HYPER-REALISM RULE: You MUST use advanced photographic terminology, optical physics, and extreme anatomical details. Describe micro-textures (pores, fabric weave, dust).
5. Be highly descriptive. Use comma-separated tags and evocative sentences within the values.
OUTPUT FORMAT (Use these exact keys):
{base_json_struct}"""
        else:
            sys_prompt = f"""You are a Master Prompt Engineer, Elite Cinematographer, and Anatomist for advanced AI image generation.
Generate EXACTLY {count} distinct variations of the user's action.
CRITICAL RULES:
1. Output MUST be a valid JSON object containing a "results" array.
2. Escape any inner double quotes with a backslash (\\").
3. ANTI-COLLAGE RULE: Each JSON object represents ONE SINGLE IMAGE. Pick exactly ONE specific pose and ONE camera angle per object!
4. HYPER-REALISM RULE: Use professional photographic vocabulary, describe skin pores, fabric textures, and precise lighting setups.

OUTPUT FORMAT:
{{
  "results": [
    {base_json_struct},
    ... (repeat {count} times)
  ]
}}"""

        payload = {
            "model": self.config.optimizer_model,
            "messages": [{"role": "system", "content": sys_prompt}, {"role": "user", "content": raw_action}],
            "max_tokens": 4000 if count > 1 else 2500, 
            "temperature": 0.8,
            "response_format": {"type": "json_object"} 
        }

        async with aiohttp.ClientSession() as session:
            try:
                timeout_val = self.config.optimizer_timeout * (1.5 if count > 1 else 1.0)
                logger.info(f"🧠 [副脑] 正在重构 {count} 组极致画质提示词 (模型: {self.config.optimizer_model})")
                
                async with session.post(endpoint, headers=headers, json=payload, timeout=timeout_val) as resp:
                    resp.raise_for_status()
                    data = await resp.json()
                    
                    if "choices" in data and len(data["choices"]) > 0:
                        raw_content = data["choices"][0]["message"]["content"].strip()
                        
                        start_idx = raw_content.find('{')
                        end_idx = raw_content.rfind('}')
                        clean_json_str = raw_content[start_idx:end_idx+1] if (start_idx != -1 and end_idx != -1 and end_idx >= start_idx) else raw_content
                            
                        clean_json_str = clean_json_str.replace('\n', ' ').replace('\r', '')
                        clean_json_str = re.sub(r',\s*}', '}', clean_json_str)
                        clean_json_str = re.sub(r',\s*]', ']', clean_json_str)
                        
                        items = []
                        try:
                            prompt_data = json.loads(clean_json_str)
                            if count == 1:
                                items = [prompt_data]
                            else:
                                items = prompt_data.get("results", [])
                                if not items and isinstance(prompt_data, list):
                                    items = prompt_data
                        except Exception as e:
                            logger.warning(f"⚠️ [副脑] 原生 JSON 解析失败, 启动无敌抢救模式... 错误: {e}")
                            fallback_item = {}
                            keys = ["subject_appearance", "clothing_and_accessories", "pose_and_action", "environment_and_scene", "lighting_and_mood", "technical_specs"]
                            
                            search_text = raw_content
                            for key in keys:
                                idx = search_text.find(f'"{key}"')
                                if idx == -1: continue
                                colon_idx = search_text.find(':', idx)
                                if colon_idx == -1: continue
                                quote_idx = search_text.find('"', colon_idx)
                                if quote_idx == -1: continue
                                
                                next_key_idx = len(search_text)
                                for k in keys:
                                    if k == key: continue
                                    k_idx = search_text.find(f'"{k}"', quote_idx)
                                    if k_idx != -1 and k_idx < next_key_idx:
                                        next_key_idx = k_idx
                                        
                                raw_val = search_text[quote_idx+1:next_key_idx]
                                raw_val = raw_val.strip().rstrip('}').rstrip(']').rstrip(',').strip().rstrip('"')
                                raw_val = raw_val.replace('"', "'").replace('\n', ' ')
                                if raw_val:
                                    fallback_item[key] = raw_val
                            
                            if fallback_item:
                                items = [fallback_item]
                                logger.info(f"🚑 [副脑] 抢救成功！已强行提取 {len(fallback_item)} 个字段。")
                            else:
                                raise ValueError("抢救模式未能提取到任何有效字段")

                        # 🚀 极致画质修复：将 JSON 扁平化为纯自然语言，消除底层模型的语法干扰
                        results = []
                        anti_collage = "1girl, solo, single image, one single frame, complete and unified scene, NO grid, NO collage, NO split screen, NO character sheet, NO multiple views, NO comic panels"
                        
                        for item in items:
                            if isinstance(item, dict):
                                parts = []
                                # 顺序很重要：主体 -> 服装 -> 动作 -> 环境 -> 光影 -> 镜头参数
                                for k in ["subject_appearance", "clothing_and_accessories", "pose_and_action", "environment_and_scene", "lighting_and_mood", "technical_specs"]:
                                    val = item.get(k, "")
                                    if val and isinstance(val, str):
                                        parts.append(val.strip())
                                        
                                # 融合成完美的一整段大师级提示词
                                master_prompt = f"{anti_collage}, " + ", ".join(parts)
                                # 清理多余空格
                                master_prompt = re.sub(r'\s+', ' ', master_prompt)
                                results.append(master_prompt)
                            
                        while len(results) < count:
                            results.append(results[0] if results else raw_action)
                            
                        logger.info(f"✨ [副脑] 成功提取并转化 {len(results[:count])} 组极致画质提示词！")
                        return results[:count]
                        
            except Exception as e:
                logger.warning(f"⚠️ [副脑降级] ({str(e)})")
                return [raw_action] * count
                
        return [raw_action] * count
