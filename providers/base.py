"""
AstrBot 万象画卷插件 v1.1.0 - Provider 基类
"""
import aiohttp
from abc import ABC, abstractmethod
from typing import Any
from ..models import ProviderConfig

class BaseProvider(ABC):
    # 使用类变量或实例变量存储每个节点的轮询位置
    _key_indices: Dict[str, int] = {}

    def __init__(self, config: ProviderConfig, session: aiohttp.ClientSession):
        self.config = config
        self.session = session
        if self.config.id not in BaseProvider._key_indices:
            BaseProvider._key_indices[self.config.id] = 0

    def get_current_key(self) -> str:
        """获取当前轮询到的密钥并指向下一个"""
        if not self.config.api_keys:
            return ""
        
        idx = BaseProvider._key_indices[self.config.id]
        key = self.config.api_keys[idx % len(self.config.api_keys)]
        
        # 指向下一个
        BaseProvider._key_indices[self.config.id] = (idx + 1) % len(self.config.api_keys)
        return key

    @abstractmethod
    async def generate_image(self, prompt: str, **kwargs: Any) -> str:
        pass
