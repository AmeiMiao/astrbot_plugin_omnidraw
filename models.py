"""
AstrBot 万象画卷插件 v3.1 - 数据模型
修复：兼容 WebUI file 组件返回 List 格式导致的参考图静默丢失问题
"""
import os
from dataclasses import dataclass, field
from typing import List, Dict, Any

@dataclass
class ProviderConfig:
    id: str
    api_type: str
    base_url: str
    api_keys: List[str]
    model: str
    timeout: float

@dataclass
class PluginConfig:
    providers: List[ProviderConfig]
    chains: Dict[str, List[str]]
    persona_name: str
    persona_base_prompt: str
    persona_ref_image: str

    @classmethod
    def from_dict(cls, config_dict: Dict[str, Any]) -> "PluginConfig":
        providers = [
            ProviderConfig(
                id=p.get("id", ""),
                api_type=p.get("api_type", "openai_image"),
                base_url=p.get("base_url", ""),
                api_keys=[k.strip() for k in p.get("api_keys", "").split("\n") if k.strip()],
                model=p.get("model", ""),
                timeout=float(p.get("timeout", 60.0))
            ) for p in config_dict.get("providers", [])
        ]
        
        # ==========================================
        # 🛠️ 核心修复：防弹级提取 WebUI 参考图路径
        # ==========================================
        raw_image = config_dict.get("persona_ref_image", "")
        ref_path = ""
        
        # 兼容 AstrBot 会把单文件包装成列表传过来的情况
        if isinstance(raw_image, list) and len(raw_image) > 0:
            raw_image = raw_image[0]
            
        if isinstance(raw_image, dict):
            ref_path = raw_image.get("path") or raw_image.get("url") or raw_image.get("file") or ""
        elif isinstance(raw_image, str):
            ref_path = raw_image.strip()
            
        # 修正相对路径 (AstrBot 默认将其保存在 data 目录下)
        if ref_path and not ref_path.startswith("http") and not os.path.isabs(ref_path):
            ref_path = os.path.abspath(os.path.join(os.getcwd(), "data", ref_path))
            
        chains = {
            "text2img": [p.strip() for p in config_dict.get("chain_text2img", "node_1").split(",") if p.strip()],
            "selfie": [p.strip() for p in config_dict.get("chain_selfie", "node_1").split(",") if p.strip()]
        }

        return cls(
            providers=providers,
            chains=chains,
            persona_name=config_dict.get("persona_name", "默认助理"),
            persona_base_prompt=config_dict.get("persona_base_prompt", ""),
            persona_ref_image=ref_path
        )

    def get_provider(self, provider_id: str) -> ProviderConfig:
        return next((p for p in self.providers if p.id == provider_id), None)
