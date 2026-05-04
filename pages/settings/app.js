const bridge = window.AstrBotPluginPage;

async function init() {
    const context = await bridge.ready();
    console.log("万象画卷 WebUI 已就绪:", context.pluginName);

    // 1. 从后端获取当前配置
    const config = await bridge.apiGet("get_config");
    
    // 2. 填充基础表单 (示例：权限部分)
    const permConf = config.permission_config || {};
    document.getElementById("allowed_users").value = permConf.allowed_users || "";
    
    const optConf = config.optimizer_config || {};
    document.getElementById("enable_optimizer").checked = optConf.enable_optimizer ?? true;

    // 3. 保存逻辑
    document.getElementById("save-btn").addEventListener("click", async () => {
        const btn = document.getElementById("save-btn");
        const msg = document.getElementById("status-msg");
        
        btn.disabled = true;
        msg.textContent = "正在保存...";

        // 构造要保存的完整数据结构，必须与 models.py/conf_schema 一一对应
        const updatedConfig = {
            ...config,
            permission_config: {
                ...config.permission_config,
                allowed_users: document.getElementById("allowed_users").value
            },
            optimizer_config: {
                ...config.optimizer_config,
                enable_optimizer: document.getElementById("enable_optimizer").checked
            }
            // ... 继续补充其他字段的映射
        };

        const result = await bridge.apiPost("save_config", updatedConfig);
        
        if (result.success) {
            msg.textContent = "✅ " + result.message;
        } else {
            msg.textContent = "❌ 保存失败";
        }
        btn.disabled = false;
    });
}

init();
