"""
AstrBot 万象画卷插件 v1.1.0 - 数据模型
"""
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any

@dataclass
class ProviderConfig:
    id: str
    api_type: str
    base_url: str
    api_keys: List[str] = field(default_factory=list) # 升级为列表
    model: str = ""

@dataclass
class PersonaConfig:
    name: str
    base_prompt: str = ""
    ref_image_url: Optional[str] = None

@dataclass
class PluginConfig:
    providers: List[ProviderConfig] = field(default_factory=list)
    chains: Dict[str, List[str]] = field(default_factory=dict)
    personas: List[PersonaConfig] = field(default_factory=list)

    @classmethod
    def from_dict(cls, config_dict: Dict[str, Any]) -> "PluginConfig":
        providers_data = config_dict.get("providers", [])
        providers = []
        for p in providers_data:
            # 将多行文本密钥转为列表
            raw_keys = p.get("api_keys", "")
            key_list = [k.strip() for k in raw_keys.split("\n") if k.strip()]
            
            providers.append(ProviderConfig(
                id=p.get("id", ""),
                api_type=p.get("api_type", "openai_image"),
                base_url=p.get("base_url", ""),
                api_keys=key_list,
                model=p.get("model", "")
            ))

        chains = {
            "text2img": [p.strip() for p in config_dict.get("chain_text2img", "").split(",") if p.strip()],
            "selfie": [p.strip() for p in config_dict.get("chain_selfie", "").split(",") if p.strip()]
        }

        personas_data = config_dict.get("personas", [])
        personas = [PersonaConfig(name=p.get("name", ""), base_prompt=p.get("base_prompt", ""), 
                                  ref_image_url=p.get("ref_image_url")) for p in personas_data]

        return cls(providers=providers, chains=chains, personas=personas)

    def get_provider(self, provider_id: str) -> Optional[ProviderConfig]:
        return next((p for p in self.providers if p.id == provider_id), None)
