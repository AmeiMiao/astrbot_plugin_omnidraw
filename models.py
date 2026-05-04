"""
AstrBot 万象画卷插件 v3.1 - 数据模型
采用极简安全循环，完美兼容全新的中文 UI 标签与历史遗留英文标签。
支持多模态参考图数组，并内置 Base64 物理落地引擎。
"""
import os
import base64
import uuid
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
    persona_ref_image: str          # 兼容旧版的单图字符串
    persona_ref_images: List[str]   # 真实使用的多图数组
    allowed_users: List[str]
    optimizer_style: str
    optimizer_custom_prompt: str

    @classmethod
    def from_dict(cls, config_dict: Dict[str, Any], data_dir: str) -> "PluginConfig":
        providers = []
        for p in config_dict.get("providers", []):
            model_raw = str(p.get("模型名称", p.get("model", "")))
            available_models = [m.strip() for m in model_raw.replace("，", ",").split(",") if m.strip()]
            api_keys = [k.strip() for k in str(p.get("API密钥", p.get("api_keys", ""))).split("\n") if k.strip()]
            providers.append(ProviderConfig(
                id=str(p.get("节点ID", p.get("id", "node_1"))),
                api_type=str(p.get("接口模式", p.get("api_type", "openai_image"))),
                base_url=str(p.get("接口地址 (需含/v1)", p.get("base_url", "https://api.openai.com/v1"))),
                api_keys=api_keys,
                model=available_models[0] if available_models else "",
                timeout=float(p.get("超时时间(秒)", p.get("timeout", 60.0))),
                available_models=available_models
            ))
            
        video_providers = []
        for p in config_dict.get("video_providers", []):
            model_raw = str(p.get("模型名称", p.get("model", "")))
            available_models = [m.strip() for m in model_raw.replace("，", ",").split(",") if m.strip()]
            api_keys = [k.strip() for k in str(p.get("API密钥", p.get("api_keys", ""))).split("\n") if k.strip()]
            video_providers.append(ProviderConfig(
                id=str(p.get("节点ID", p.get("id", "video_node_1"))),
                api_type=str(p.get("接口模式", p.get("api_type", "async_task"))),
                base_url=str(p.get("接口地址 (需含/v1或/v2)", p.get("接口地址 (需含/v1)", p.get("base_url", "https://api.example.com/v1")))),
                api_keys=api_keys,
                model=available_models[0] if available_models else "",
                timeout=float(p.get("超时时间(秒)", p.get("timeout", 300.0))),
                available_models=available_models
            ))

        presets_dict = {}
        for p in config_dict.get("presets", []):
            if isinstance(p, str):
                separator = "：" if "：" in p else ":"
                if separator in p:
                    parts = p.split(separator, 1)
                    if len(parts) == 2:
                        cmd, prompt = parts[0].strip(), parts[1].strip()
                        if cmd and prompt:
                            if cmd.startswith("/"): cmd = cmd[1:]
                            presets_dict[cmd] = prompt

        persona_conf = config_dict.get("persona_config", {})
        opt_conf = config_dict.get("optimizer_config", {})
        router_conf = config_dict.get("router_config", {})
        perm_conf = config_dict.get("permission_config", {})

        # ==========================================
        # 🚀 核心修复：Base64 物理落地引擎
        # ==========================================
        raw_images = persona_conf.get("persona_ref_image", [])
        if isinstance(raw_images, str):
            raw_images = [raw_images] if raw_images.strip() else []
        elif not isinstance(raw_images, list):
            raw_images = []

        processed_ref_paths = []
        save_dir = os.path.abspath(os.path.join(data_dir, "persona_refs"))
        os.makedirs(save_dir, exist_ok=True)

        for img_path in raw_images:
            if isinstance(img_path, dict):
                img_path = img_path.get("path") or img_path.get("url") or img_path.get("file") or ""
            if not isinstance(img_path, str) or not img_path.strip():
                continue
                
            img_path = img_path.strip()
            
            # 💡 拦截 Base64 并将其保存为本地实体图片
            if img_path.startswith("data:image"):
                try:
                    header, b64_data = img_path.split(",", 1)
                    ext = "png"
                    if "jpeg" in header or "jpg" in header: ext = "jpg"
                    elif "webp" in header: ext = "webp"
                    
                    file_name = f"ref_{uuid.uuid4().hex[:8]}.{ext}"
                    file_path = os.path.join(save_dir, file_name)
                    
                    with open(file_path, "wb") as f:
                        f.write(base64.b64decode(b64_data))
                        
                    processed_ref_paths.append(file_path) # 将物理绝对路径传给核心组件
                except Exception as e:
                    print(f"[万象画卷] 图片 Base64 解码保存失败: {e}")
            
            # 如果已经是网络图片或绝对路径，直接保留
            elif img_path.startswith("http") or os.path.isabs(img_path):
                processed_ref_paths.append(img_path)
            else:
                target_path = os.path.abspath(os.path.join(data_dir, img_path))
                if os.path.exists(target_path):
                    processed_ref_paths.append(target_path)
                else:
                    processed_ref_paths.append(os.path.abspath(os.path.join(data_dir, img_path)))

        chains = {"text2img": [], "selfie": [], "video": [], "optimizer": []}
        for item in str(router_conf.get("chain_text2img", "node_1")).split(","):
            if item.strip(): chains["text2img"].append(item.strip())
        for item in str(router_conf.get("chain_selfie", "node_1")).split(","):
            if item.strip(): chains["selfie"].append(item.strip())
        for item in str(router_conf.get("chain_video", "video_node_1")).split(","):
            if item.strip(): chains["video"].append(item.strip())
        for item in str(opt_conf.get("chain_optimizer", "node_1")).split(","):
            if item.strip(): chains["optimizer"].append(item.strip())

        raw_users = perm_conf.get("allowed_users", "")
        allowed_users = [u.strip() for u in str(raw_users).replace("，", ",").split(",") if u.strip()]

        return cls(
            providers=providers,
            video_providers=video_providers,
            chains=chains,
            presets=presets_dict,
            enable_optimizer=bool(opt_conf.get("enable_optimizer", True)),
            optimizer_model=str(opt_conf.get("optimizer_model", "gpt-4o-mini")),
            optimizer_timeout=float(opt_conf.get("optimizer_timeout", 15.0)),
            max_batch_count=int(opt_conf.get("max_batch_count", 0)),
            persona_name=str(persona_conf.get("persona_name", "默认助理")),
            persona_base_prompt=str(persona_conf.get("persona_base_prompt", "")),
            persona_ref_image=processed_ref_paths[0] if processed_ref_paths else "", 
            persona_ref_images=processed_ref_paths, 
            allowed_users=allowed_users,
            optimizer_style=str(opt_conf.get("optimizer_style", "手机日常原生感")),
            optimizer_custom_prompt=str(opt_conf.get("optimizer_custom_prompt", ""))
        )

    def get_provider(self, provider_id: str) -> Optional[ProviderConfig]:
        for p in self.providers:
            if p.id == provider_id: return p
        return None
        
    def get_video_provider(self, provider_id: str) -> Optional[ProviderConfig]:
        for p in self.video_providers:
            if p.id == provider_id: return p
        return None
