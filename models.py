"""
AstrBot 万象画卷插件 v3.1 - 数据模型
新增功能：WebUI 用户白名单权限解析
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
    allowed_users: List[str] # 🚀 新增：允许的QQ号列表

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
        
        raw_image = config_dict.get("persona_ref_image", "")
        ref_path = ""
        
        if isinstance(raw_image, list) and len(raw_image) > 0:
            raw_image = raw_image[0]
            
        if isinstance(raw_image, dict):
            ref_path = raw_image.get("path") or raw_image.get("url") or raw_image.get("file") or ""
        elif isinstance(raw_image, str):
            ref_path = raw_image.strip()
            
        if ref_path and not ref_path.startswith("http") and not os.path.isabs(ref_path):
            plugin_data_dir = os.path.join(os.getcwd(), "data", "plugin_data", "astrbot_plugin_omnidraw")
            target_path = os.path.abspath(os.path.join(plugin_data_dir, ref_path))
            
            if not os.path.exists(target_path):
                fallback_path = os.path.abspath(os.path.join(os.getcwd(), "data", ref_path))
                if os.path.exists(fallback_path):
                    target_path = fallback_path
                    
            ref_path = target_path
            
        chains = {
            "text2img": [p.strip() for p in config_dict.get("chain_text2img", "node_1").split(",") if p.strip()],
            "selfie": [p.strip() for p in config_dict.get("chain_selfie", "node_1").split(",") if p.strip()]
        }

        # ==========================================
        # 🚀 权限核心：解析 WebUI 传来的白名单
        # ==========================================
        raw_users = config_dict.get("allowed_users", "")
        if isinstance(raw_users, str):
            # 支持用户在 WebUI 里用逗号分割多个 QQ 号
            allowed_users = [u.strip() for u in raw_users.replace("，", ",").split(",") if u.strip()]
        elif isinstance(raw_users, list):
            allowed_users = [str(u).strip() for u in raw_users]
        else:
            allowed_users = []

        return cls(
            providers=providers,
            chains=chains,
            persona_name=config_dict.get("persona_name", "默认助理"),
            persona_base_prompt=config_dict.get("persona_base_prompt", ""),
            persona_ref_image=ref_path,
            allowed_users=allowed_users
        )

    def get_provider(self, provider_id: str) -> ProviderConfig:
        return next((p for p in self.providers if p.id == provider_id), None)
