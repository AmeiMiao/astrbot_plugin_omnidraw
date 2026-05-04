# 📦 万象画卷 (Omni-Draw) 插件 v1.1.1 - 核心架构重构与修复日志

## 🎨 一、 视觉与前端交互 (UI/UX)
* **✨ 核心视觉完整复原**：毛玻璃侧边栏以及平滑的卡片进出场动画。
* **🖱️ 交互组件精细化**：
  * 将“接口模式”与“模型池”下拉框还原为美观、简洁的**小芯片 (API-Chip)** 选择器。
  * 修复了点击模型标签上的 `×` 无法删除模型的 Bug（将事件拦截器从严格匹配 `<button>` 升级为全局 `[data-action]` 属性拦截，成功囊括 `<span>` 元素）。
* **🛡️ 详细汇报模式 (Verbose)**：在全局配置中加入了“调试模式”开关，开启后画图前会输出完整的提示词和参考图识别结果。

## 💾 二、 数据流转与绝对持久化 (Persistence)
* **🚀 解决“配置保存刷新后消失”**：
  * **前端双保险采集**：修复了 `app.js` 中 `data-sync` 标识符映射错位（`prov-id` vs `node-id`）导致的漏采问题。同时引入**“DOM 强力快照”机制**，在点击保存的瞬间强制打包所有非空输入框，防止界面重绘导致的数据重置。
  * **硬核物理落盘**：后端 `main.py` 新增专属持久化链路，越过 AstrBot 框架不自动保存 WebUI 数据的限制。强制将配置硬编码写入 `data/plugin_data/astrbot_plugin_omnidraw/omnidraw_persist_config.json`，确保插件重启、重载数据**永不丢失**。

## 🖼️ 三、 多模态参考图与存储管理 (Storage)
* **🧹 僵尸文件粉碎机制**：重写了 `models.py` 中的参考图保存逻辑。从原先的“只增不减”升级为**智能闭环管理**。现在后端会自动比对前端留存的图片与本地文件夹，并在保存时自动物理删除已被用户在 WebUI 中点 `×` 移除的废弃老图，避免硬盘空间无限膨胀。
* **📁 精准路径锁定**：修复了框架默认保存路径的偏移，强制将所有人设参考图死死锁定在 `data/plugin_data/astrbot_plugin_omnidraw/persona_refs`。

## 🐛 四、 极客级架构冲突修复 (Bug Fixes)
* **🔀 双线兼容架构 (Double-Track)**：
  * **修复了致命报错** `'list' object has no attribute 'startswith'` 与 `has no attribute 'persona_ref_image'`。
  * **原理**：底层旧代码（如 `persona_manager.py`）需要字符串形式的图片路径，而新版多模态前端需要列表形式。在数据模型中首创“双字段派发”，同时吐出 `persona_ref_image` (单数字符串) 和 `persona_ref_images` (复数列表)，在不修改底层代码的前提下完美平息了前后端数据类型冲突。
* **🧠 大模型参数唤醒**：全面恢复了 `main.py` 中 `@llm_tool` 的参数列表与 Docstring 注释。确保了 `action`、`count`、`aspect_ratio`、`size` 等高阶透传参数能够被大模型正确识别、解析并调度。
