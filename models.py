"""
AstrBot 万象画卷插件 v1.7.1 - 数据模型 (终极图库兼容版)
"""
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any
import os

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
        
        # 【核心修复】：防弹级提取 WebUI 上传组件的数据
        raw_pool = config_dict.get("ref_images_pool", [])
        pool = []
        if isinstance(raw_pool, str) and raw_pool.strip():
            # 兼容：如果 AstrBot 传过来的是一个单纯的路径字符串
            pool = [raw_pool.strip()]
        elif isinstance(raw_pool, list):
            for item in raw_pool:
                if isinstance(item, str):
                    pool.append(item)
                elif isinstance(item, dict):
                    # 兼容：如果 AstrBot 传过来的是一个字典列表 [{"path": "..."}]
                    path = item.get("path") or item.get("url") or item.get("file")
                    if path:
                        pool.append(str(path))

        return cls(providers=providers, chains=chains, personas=personas, ref_images_pool=pool)

    def get_provider(self, provider_id: str) -> Optional[ProviderConfig]:
        return next((p for p in self.providers if p.id == provider_id), None)
