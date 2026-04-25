"""
AstrBot 万象画卷插件 v1.8.0 - 数据模型 (终极自动同步版)
"""
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any
import os
import shutil
from astrbot.api import logger

# 动态计算绝对路径，实现防弹级定位
PLUGIN_DIR = os.path.dirname(os.path.abspath(__file__))
LOCAL_IMAGE_DIR = os.path.join(PLUGIN_DIR, "images")
# 往上推两层，找到 AstrBot 的 data 目录
DATA_DIR = os.path.dirname(os.path.dirname(PLUGIN_DIR)) 
ROOT_DIR = os.path.dirname(DATA_DIR)

# 确保我们的专属图库目录永远存在
os.makedirs(LOCAL_IMAGE_DIR, exist_ok=True)

@dataclass
class ProviderConfig:
    id: str
    api_type: str
    base_url: str
    api_keys: List[str] = field(default_factory=list)
    model: str = ""
    timeout: float = 60.0

@dataclass
class PersonaConfig:
    name: str
    base_prompt: str = ""
    ref_image_name: str = "" 

@dataclass
class PluginConfig:
    providers: List[ProviderConfig] = field(default_factory=list)
    chains: Dict[str, List[str]] = field(default_factory=dict)
    personas: List[PersonaConfig] = field(default_factory=list)
    ref_images_pool: List[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, config_dict: Dict[str, Any]) -> "PluginConfig":
        providers_data = config_dict.get("providers", [])
        providers = [
            ProviderConfig(
                id=p.get("id", ""),
                api_type=p.get("api_type", "openai_image"),
                base_url=p.get("base_url", ""),
                api_keys=[k.strip() for k in p.get("api_keys", "").split("\n") if k.strip()],
                model=p.get("model", ""),
                timeout=float(p.get("timeout", 60.0))
            )
            for p in providers_data if p.get("id")
        ]

        chains = {
            "text2img": [p.strip() for p in config_dict.get("chain_text2img", "main_node").split(",") if p.strip()],
            "selfie": [p.strip() for p in config_dict.get("chain_selfie", "main_node").split(",") if p.strip()]
        }

        personas_data = config_dict.get("personas", [])
        personas = [
            PersonaConfig(
                name=p.get("name", ""),
                base_prompt=p.get("base_prompt", ""),
                ref_image_name=p.get("ref_image_name", "")
            )
            for p in personas_data if p.get("name")
        ]
        
        # ==========================================
        # 🚀 核心黑科技：WebUI 图库自动同步到本地
        # ==========================================
        raw_pool = config_dict.get("ref_images_pool", [])
        pool = []
        if isinstance(raw_pool, str) and raw_pool.strip():
            raw_pool = [raw_pool.strip()]
            
        if isinstance(raw_pool, list):
            for item in raw_pool:
                path = item if isinstance(item, str) else (item.get("path") or item.get("url") or item.get("file"))
                if not path:
                    continue
                    
                # 暴力穷举所有可能被框架隐藏的真实路径
                possible_paths = [
                    os.path.join(DATA_DIR, path),
                    os.path.join(ROOT_DIR, path),
                    os.path.join(os.getcwd(), path),
                    os.path.join(os.getcwd(), "data", path)
                ]
                
                file_synced = False
                for pp in possible_paths:
                    if os.path.exists(pp):
                        # 找到了真实文件！立刻复制到我们的专属 `images` 目录
                        filename = os.path.basename(pp)
                        local_dest = os.path.join(LOCAL_IMAGE_DIR, filename)
                        
                        if not os.path.exists(local_dest):
                            try:
                                shutil.copy2(pp, local_dest)
                                logger.info(f"📥 [自动搬运] 成功将 WebUI 图片提取到本地专属图库: {filename}")
                            except Exception as e:
                                logger.error(f"❌ 同步图片失败: {e}")
                        
                        # 把我们本地的绝对路径存入配置
                        pool.append(local_dest)
                        file_synced = True
                        break
                        
                if not file_synced:
                    pool.append(str(path))

        return cls(providers=providers, chains=chains, personas=personas, ref_images_pool=pool)

    def get_provider(self, provider_id: str) -> Optional[ProviderConfig]:
        return next((p for p in self.providers if p.id == provider_id), None)
