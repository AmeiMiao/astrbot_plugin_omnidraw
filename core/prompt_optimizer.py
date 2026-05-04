"""
提示词副脑优化器 (Prompt Optimizer) - 动态多风格引擎版
功能：支持从 WebUI 读取用户设定的风格，动态切换预设参数，并包含自定义注入模式。
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

        # ==========================================
        # 🚀 核心大招：动态风格插槽系统 (Dynamic Style Engine)
        # 从配置中安全读取用户的选择，默认兜底为手机日常
        # ==========================================
        style_choice = getattr(self.config, "optimizer_style", "手机日常原生感")
        custom_prompt = getattr(self.config, "optimizer_custom_prompt", "").strip()

        # 四大黄金预设矩阵
        STYLE_PRESETS = {
            "手机日常原生感": {
                "role": "an expert in authentic, amateur smartphone photography",
                "subject": "exact age, ethnicity, everyday casual look, unretouched skin, natural pores, subtle real-world flaws, normal daily makeup, candid expression",
                "clothing": "casual everyday clothing, realistic fabric textures, messy or natural drape, no overly styled outfits",
                "environment": "real-world everyday location, authentic daily life setting, slight background clutter, realistic unarranged environment",
                "lighting": "natural ambient light, uneven room lighting, authentic everyday atmosphere, NO studio lights, flat natural lighting or direct phone flash",
                "camera": "Shot on iPhone 15 front camera, 24mm wide angle, deep depth of field (background is clear), everything in focus, candid snap, amateur photography, unedited, raw realistic colors, NO professional color grading, realistic mobile phone photo"
            },
            "电影级光影大片": {
                "role": "an Elite Cinematographer and Master Prompt Engineer for Midjourney/DALL-E 3",
                "subject": "EXTREME DETAIL: exact age, ethnicity, hyper-realistic skin texture, visible pores, peach fuzz, subsurface scattering, flawless anatomy",
                "clothing": "high-end styling, specific fabrics (e.g., thick knit, worn denim, translucent silk), micro-textures, wrinkles, realistic physical drape",
                "environment": "specific real-world location, cinematic set design, rich background elements, atmospheric effects (dust, haze, fog), dramatic depth",
                "lighting": "PHOTOGRAPHIC LIGHTING: specific setups (e.g., Rembrandt, cinematic chiaroscuro, volumetric sunlight, rim light), global illumination, perfect shadows",
                "camera": "CAMERA SPECS: Hasselblad H6D or ARRI Alexa, 85mm f/1.2, shallow depth of field, beautiful bokeh, 8k, raw photo, color graded, ultra-sharp focus"
            },
            "日系插画大师": {
                "role": "a Master Anime Illustrator and Visual Novel Background Artist",
                "subject": "masterpiece, best quality, beautiful detailed anime eyes, delicate facial features, expressive emotions, cel shading, high-quality anime character",
                "clothing": "detailed anime outfit, dynamic clothing folds, vibrant colors, stylish design, intricate details",
                "environment": "Makoto Shinkai style background, anime visual novel background, highly detailed scenery, beautiful clouds, breathtaking anime landscape",
                "lighting": "anime aesthetic lighting, Tyndall effect, glowing highlights, soft and vibrant anime shading, vivid colors, cinematic anime lighting",
                "camera": "2D illustration, flat shading, pixiv fanbox style, trending on artstation, official art, highres, 4k"
            },
            "3D 潮玩盲盒": {
                "role": "an Expert 3D Modeler and Product Photographer",
                "subject": "chibi proportions, cute face, pop mart blind box toy style, kawaii, big expressive eyes, detailed 3D model, flawless smooth surface",
                "clothing": "cute fashionable outfit, plastic or resin material texture, glossy finish, vibrant pastel colors, toy details",
                "environment": "clean studio background, minimalist setting, solid pastel color backdrop, product photography stage",
                "lighting": "clean studio lighting, soft box, rim light, ambient occlusion, bright and cheerful lighting, studio reflections",
                "camera": "3D render, Octane Render, Unreal Engine 5, tilt-shift lens, macro photography, 8k resolution, ray tracing, highly detailed 3D figure"
            }
        }

        # 动态组装：如果选择了自定义模式且填写了内容，则强行覆盖要求
        if style_choice == "自定义模式" and custom_prompt:
            style_data = {
                "role": f"an AI Prompt Expert specializing in this exact style: {custom_prompt}",
                "subject": f"[{custom_prompt}] Focus on character appearance, facial details, and matching this style exactly",
                "clothing": f"[{custom_prompt}] Appropriate clothing, textures, and details matching the custom style",
                "environment": f"[{custom_prompt}] Background and setting matching the custom style",
                "lighting": f"[{custom_prompt}] Lighting and mood matching the custom style",
                "camera": f"[{custom_prompt}] Rendering style, camera specs, or art medium matching the custom style"
            }
        else:
            # 否则去字典里拿，如果异常则兜底为手机日常
            style_data = STYLE_PRESETS.get(style_choice, STYLE_PRESETS["手机日常原生感"])

        # 将动态数据注入 JSON 骨架插槽
        base_json_struct = f"""{{
  "subject_appearance": "{style_data['subject']}",
  "clothing_and_accessories": "{style_data['clothing']}",
  "pose_and_action": "CRITICAL: EXACTLY ONE specific pose. NEVER use words like various or multiple. Ensure natural interaction.",
  "environment_and_scene": "{style_data['environment']}",
  "lighting_and_mood": "{style_data['lighting']}",
  "technical_specs": "{style_data['camera']}"
}}"""

        if count == 1:
            sys_prompt = f"""You are {style_data['role']}.
Output ONLY ONE valid JSON object based on the user's action.
CRITICAL RULES:
1. Output MUST be a valid JSON object. ALL keys and values MUST be strings.
2. Escape any inner double quotes with a backslash (\\").
3. ABSOLUTELY NO collages, grids, or multiple views. Describe exactly ONE single frozen moment.
4. STYLE ADHERENCE: Strictly follow the aesthetics, materials, and lighting described in the output format.
OUTPUT FORMAT (Use these exact keys):
{base_json_struct}"""
        else:
            sys_prompt = f"""You are {style_data['role']}.
Generate EXACTLY {count} distinct variations of the user's action.
CRITICAL RULES:
1. Output MUST be a valid JSON object containing a "results" array.
2. Escape any inner double quotes with a backslash (\\").
3. ANTI-COLLAGE RULE: Each JSON object represents ONE SINGLE IMAGE. Pick exactly ONE specific pose and ONE camera angle per object!
4. STYLE ADHERENCE: Strictly follow the aesthetics, materials, and lighting described in the output format.

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
                logger.info(f"🧠 [副脑] 正在以【{style_choice}】风格重构提示词 (模型: {self.config.optimizer_model})")
                
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

                        # 🚀 降维打击：将提取出的数据平铺为大师级自然语言流
                        results = []
                        anti_collage = "1girl, solo, single image, one single frame, NO grid, NO collage, NO split screen"
                        
                        for item in items:
                            if isinstance(item, dict):
                                parts = []
                                for k in ["subject_appearance", "clothing_and_accessories", "pose_and_action", "environment_and_scene", "lighting_and_mood", "technical_specs"]:
                                    val = item.get(k, "")
                                    if val and isinstance(val, str):
                                        parts.append(val.strip())
                                        
                                # 融合最终长句
                                master_prompt = f"{anti_collage}, " + ", ".join(parts)
                                master_prompt = re.sub(r'\s+', ' ', master_prompt)
                                results.append(master_prompt)
                            
                        while len(results) < count:
                            results.append(results[0] if results else raw_action)
                            
                        logger.info(f"✨ [副脑] 成功重构并提取 {len(results[:count])} 组【{style_choice}】提示词！")
                        return results[:count]
                        
            except Exception as e:
                logger.warning(f"⚠️ [副脑降级] ({str(e)})")
                return [raw_action] * count
                
        return [raw_action] * count
