"""
AstrBot 万象画卷插件 v1.7.0 - 数据模型
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
    ref_image_name: str = "" # 改为 name，接收文件名

@dataclass
class PluginConfig:
    providers: List[ProviderConfig] = field(default_factory=list)
    chains: Dict[str, List[str]] = field(default_factory=dict)
    personas: List[PersonaConfig] = field(default_factory=list)
    ref_images_pool: List[str] = field(default_factory=list) # 新增：接收全局图库的绝对路径列表

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
        
        # 提取 WebUI 上传后生成的绝对路径列表
        pool = config_dict.get("ref_images_pool", [])
        if not isinstance(pool, list):
            pool = []

        return cls(providers=providers, chains=chains, personas=personas, ref_images_pool=pool)

    def get_provider(self, provider_id: str) -> Optional[ProviderConfig]:
        return next((p for p in self.providers if p.id == provider_id), None)
