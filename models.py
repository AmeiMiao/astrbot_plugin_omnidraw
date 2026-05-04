"""
AstrBot 万象画卷插件 v3.1 - 数据模型
"""
import os
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional

@dataclass
class ProviderConfig:
    id: str
    api_type: str
    base_url: str
    api_keys: List[str]
    model: str  
    timeout: float
    available_models: List[str] = field(default_factory=list) 

@dataclass
class PluginConfig:
    providers: List[ProviderConfig]
    video_providers: List[ProviderConfig]
    chains: Dict[str, List[str]]
    presets: Dict[str, str]       
    enable_optimizer: bool        
    optimizer_model: str  
    optimizer_timeout: float  
    max_batch_count: int      
    persona_name: str
    persona_base_prompt: str
    persona_ref_image: List[str]   # 🔴 已修正为单数
    allowed_users: List[str]
    optimizer_style: str
    optimizer_custom_prompt: str
    verbose_report: bool

    @classmethod
    def from_dict(cls, config_dict: Dict[str, Any], data_dir: str) -> "PluginConfig":
        providers = []
        for p in config_dict.get("providers", []):
            avail = p.get("available_models", [])
            model = p.get("model", "")
            if not model and avail: model = avail[0]
            
            # 💡 关键：兼容前端发来的 api_keys (可能是字符串也可能是列表)
            keys_raw = p.get("api_keys", "")
            api_keys = [k.strip() for k in str(keys_raw).split("\n") if k.strip()] if isinstance(keys_raw, str) else keys_raw

            providers.append(ProviderConfig(
                id=str(p.get("id", "node_1")),
                api_type=str(p.get("api_type", "openai_image")),
                base_url=str(p.get("base_url", "")),
                api_keys=api_keys,
                model=model,
                timeout=float(p.get("timeout", 60.0)),
                available_models=avail
            ))
            
        video_providers = []
        for p in config_dict.get("video_providers", []):
            avail = p.get("available_models", [])
            model = p.get("model", "")
            if not model and avail: model = avail[0]
            
            keys_raw = p.get("api_keys", "")
            api_keys = [k.strip() for k in str(keys_raw).split("\n") if k.strip()] if isinstance(keys_raw, str) else keys_raw

            video_providers.append(ProviderConfig(
                id=str(p.get("id", "video_node_1")),
                api_type=str(p.get("api_type", "async_task")),
                base_url=str(p.get("base_url", "")),
                api_keys=api_keys,
                model=model,
                timeout=float(p.get("timeout", 300.0)),
                available_models=avail
            ))

        presets_dict = {}
        for p in config_dict.get("presets", []):
            if isinstance(p, str) and ":" in p:
                parts = p.split(":", 1)
                presets_dict[parts[0].strip()] = parts[1].strip()

        persona_conf = config_dict.get("persona_config", {})
        opt_conf = config_dict.get("optimizer_config", {})
        router_conf = config_dict.get("router_config", {})
        perm_conf = config_dict.get("permission_config", {})

        return cls(
            providers=providers,
            video_providers=video_providers,
            chains={
                "text2img": [router_conf.get("chain_text2img", "node_1")],
                "selfie": [router_conf.get("chain_selfie", "node_1")],
                "video": [router_conf.get("chain_video", "video_node_1")],
                "optimizer": [opt_conf.get("chain_optimizer", "node_1")]
            },
            presets=presets_dict,
            enable_optimizer=bool(opt_conf.get("enable_optimizer", True)),
            optimizer_model=str(opt_conf.get("optimizer_model", "gpt-4o-mini")),
            optimizer_timeout=float(opt_conf.get("optimizer_timeout", 15.0)),
            max_batch_count=int(opt_conf.get("max_batch_count", 0)),
            persona_name=str(persona_conf.get("persona_name", "默认助理")),
            persona_base_prompt=str(persona_conf.get("persona_base_prompt", "")),
            persona_ref_image=persona_conf.get("persona_ref_image", []), # 🔴 已修正为单数，左右对齐
            allowed_users=[u.strip() for u in str(perm_conf.get("allowed_users", "")).split(",") if u.strip()],
            optimizer_style=str(opt_conf.get("optimizer_style", "手机日常原生感")),
            optimizer_custom_prompt=str(opt_conf.get("optimizer_custom_prompt", "")),
            verbose_report=bool(config_dict.get("verbose_report", False))
        )

    def get_provider(self, provider_id: str) -> Optional[ProviderConfig]:
        for p in self.providers:
            if p.id == provider_id: return p
        return None
        
    def get_video_provider(self, provider_id: str) -> Optional[ProviderConfig]:
        for p in self.video_providers:
            if p.id == provider_id: return p
        return None
