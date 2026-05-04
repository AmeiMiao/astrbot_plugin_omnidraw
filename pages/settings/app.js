const bridge = window.AstrBotPluginPage;

// 全局状态管理
let state = {
    permission_config: {},
    persona_config: {},
    optimizer_config: {},
    router_config: {},
    presets: [],
    providers: [],
    video_providers: []
};

// 工具：安全获取对象属性
const getVal = (obj, key, def = "") => (obj && obj[key] !== undefined) ? obj[key] : def;

async function init() {
    const context = await bridge.ready();
    console.log("万象画卷 WebUI 就绪", context);
    
    const rawConfig = await bridge.apiGet("get_config");
    
    // 合并初始数据
    state.permission_config = rawConfig.permission_config || {};
    state.persona_config = rawConfig.persona_config || {};
    state.optimizer_config = rawConfig.optimizer_config || {};
    state.router_config = rawConfig.router_config || {};
    
    // 预设处理 (将 "名称:提示词" 拆分为对象以便UI编辑)
    const rawPresets = rawConfig.presets || [];
    state.presets = rawPresets.map(p => {
        const parts = p.split(/:(.+)/); // 仅以第一个冒号分割
        return { name: parts[0] || "", prompt: parts[1] || "" };
    });

    // 节点直接映射 (丢弃以前繁琐的中文Key，直接使用英文标准键名)
    state.providers = rawConfig.providers || [];
    state.video_providers = rawConfig.video_providers || [];

    bindBasicFields();
    renderPresets();
    renderProviders();
    renderVideoProviders();

    // 绑定保存按钮
    document.getElementById("save-btn").addEventListener("click", saveConfig);
}

function bindBasicFields() {
    // 权限
    document.getElementById("perm_allowed_users").value = getVal(state.permission_config, "allowed_users");
    
    // 路由
    document.getElementById("route_img").value = getVal(state.router_config, "chain_text2img", "node_1");
    document.getElementById("route_selfie").value = getVal(state.router_config, "chain_selfie", "node_1");
    document.getElementById("route_video").value = getVal(state.router_config, "chain_video", "video_node_1");

    // 人设
    document.getElementById("persona_name").value = getVal(state.persona_config, "persona_name", "默认助理");
    document.getElementById("persona_prompt").value = getVal(state.persona_config, "persona_base_prompt");
    document.getElementById("persona_ref").value = getVal(state.persona_config, "persona_ref_image");

    // 副脑
    document.getElementById("opt_enable").checked = getVal(state.optimizer_config, "enable_optimizer", true);
    document.getElementById("opt_style").value = getVal(state.optimizer_config, "optimizer_style", "手机日常原生感");
    document.getElementById("opt_chain").value = getVal(state.optimizer_config, "chain_optimizer", "node_1");
    document.getElementById("opt_model").value = getVal(state.optimizer_config, "optimizer_model", "gpt-4o-mini");
    document.getElementById("opt_timeout").value = getVal(state.optimizer_config, "optimizer_timeout", 15);
    document.getElementById("opt_batch").value = getVal(state.optimizer_config, "max_batch_count", 0);
    document.getElementById("opt_custom").value = getVal(state.optimizer_config, "optimizer_custom_prompt");
}

function readBasicFields() {
    state.permission_config.allowed_users = document.getElementById("perm_allowed_users").value;
    
    state.router_config.chain_text2img = document.getElementById("route_img").value;
    state.router_config.chain_selfie = document.getElementById("route_selfie").value;
    state.router_config.chain_video = document.getElementById("route_video").value;

    state.persona_config.persona_name = document.getElementById("persona_name").value;
    state.persona_config.persona_base_prompt = document.getElementById("persona_prompt").value;
    state.persona_config.persona_ref_image = document.getElementById("persona_ref").value;

    state.optimizer_config.enable_optimizer = document.getElementById("opt_enable").checked;
    state.optimizer_config.optimizer_style = document.getElementById("opt_style").value;
    state.optimizer_config.chain_optimizer = document.getElementById("opt_chain").value;
    state.optimizer_config.optimizer_model = document.getElementById("opt_model").value;
    state.optimizer_config.optimizer_timeout = parseFloat(document.getElementById("opt_timeout").value);
    state.optimizer_config.max_batch_count = parseInt(document.getElementById("opt_batch").value);
    state.optimizer_config.optimizer_custom_prompt = document.getElementById("opt_custom").value;
}

// ================== 动态渲染逻辑 ==================

// 预设
window.renderPresets = () => {
    const html = state.presets.map((p, i) => `
        <div class="dynamic-item preset-item">
            <input type="text" class="preset-name" placeholder="指令(如:手办化)" value="${p.name}" onchange="state.presets[${i}].name=this.value">
            <span class="colon">:</span>
            <input type="text" class="preset-prompt" placeholder="对应的英文提示词" value="${p.prompt}" onchange="state.presets[${i}].prompt=this.value">
            <button class="btn-danger btn-small" onclick="window.delPreset(${i})">删除</button>
        </div>
    `).join('');
    document.getElementById("presets-container").innerHTML = html || '<p class="empty-tip">暂无预设</p>';
};
window.addPreset = () => { state.presets.push({name:"", prompt:""}); window.renderPresets(); };
window.delPreset = (i) => { state.presets.splice(i, 1); window.renderPresets(); };

// 生图节点
window.renderProviders = () => {
    const html = state.providers.map((p, i) => `
        <div class="dynamic-item provider-card">
            <div class="provider-header">
                <h3>节点标识: <input type="text" class="inline-input" value="${p.id || p['节点ID'] || 'node_1'}" onchange="state.providers[${i}].id=this.value"></h3>
                <button class="btn-danger btn-small" onclick="window.delProvider(${i})">删除此节点</button>
            </div>
            <div class="grid-2-col">
                <div class="form-group">
                    <label>接口模式</label>
                    <select onchange="state.providers[${i}].api_type=this.value">
                        <option value="openai_image" ${(p.api_type||p['接口模式'])=='openai_image'?'selected':''}>openai_image (标准生图)</option>
                        <option value="openai_chat" ${(p.api_type||p['接口模式'])=='openai_chat'?'selected':''}>openai_chat (对话透传)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>接口地址 (需含/v1)</label>
                    <input type="text" value="${p.base_url || p['接口地址 (需含/v1)'] || ''}" onchange="state.providers[${i}].base_url=this.value">
                </div>
                <div class="form-group">
                    <label>模型名称 (多模型用逗号隔开)</label>
                    <input type="text" value="${p.model || p['模型名称'] || ''}" onchange="state.providers[${i}].model=this.value">
                </div>
                <div class="form-group">
                    <label>超时时间 (秒)</label>
                    <input type="number" value="${p.timeout || p['超时时间(秒)'] || 60}" onchange="state.providers[${i}].timeout=this.value">
                </div>
                <div class="form-group full-width">
                    <label>API 密钥 (支持多行负载均衡)</label>
                    <textarea rows="2" onchange="state.providers[${i}].api_keys=this.value">${Array.isArray(p.api_keys) ? p.api_keys.join('\n') : (p.api_keys || p['API密钥'] || '')}</textarea>
                </div>
            </div>
        </div>
    `).join('');
    document.getElementById("providers-container").innerHTML = html || '<p class="empty-tip">暂无生图节点</p>';
};
window.addProvider = () => { state.providers.push({id:`node_${state.providers.length+1}`, api_type:"openai_image", base_url:"https://api.openai.com/v1", model:"", api_keys:"", timeout:60}); window.renderProviders(); };
window.delProvider = (i) => { state.providers.splice(i, 1); window.renderProviders(); };

// 视频节点
window.renderVideoProviders = () => {
    const html = state.video_providers.map((p, i) => `
        <div class="dynamic-item provider-card">
            <div class="provider-header">
                <h3>节点标识: <input type="text" class="inline-input" value="${p.id || p['节点ID'] || 'video_node_1'}" onchange="state.video_providers[${i}].id=this.value"></h3>
                <button class="btn-danger btn-small" onclick="window.delVideoProvider(${i})">删除此节点</button>
            </div>
            <div class="grid-2-col">
                <div class="form-group">
                    <label>视频接口模式</label>
                    <select onchange="state.video_providers[${i}].api_type=this.value">
                        <option value="async_task (异步排队轮询/videos/generations)" ${(p.api_type||p['接口模式'])?.includes('async_task')?'selected':''}>异步排队轮询 (推荐)</option>
                        <option value="openai_sync (同步阻塞直返)" ${(p.api_type||p['接口模式'])?.includes('openai_sync')?'selected':''}>同步阻塞</option>
                        <option value="openai_chat (对话伪装视频/chat/completions)" ${(p.api_type||p['接口模式'])?.includes('openai_chat')?'selected':''}>Chat 对话伪装</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>接口地址</label>
                    <input type="text" value="${p.base_url || p['接口地址 (需含/v1或/v2)'] || p['接口地址 (需含/v1)'] || ''}" onchange="state.video_providers[${i}].base_url=this.value">
                </div>
                <div class="form-group">
                    <label>模型名称</label>
                    <input type="text" value="${p.model || p['模型名称'] || ''}" onchange="state.video_providers[${i}].model=this.value">
                </div>
                <div class="form-group">
                    <label>超时时间 (秒)</label>
                    <input type="number" value="${p.timeout || p['超时时间(秒)'] || 300}" onchange="state.video_providers[${i}].timeout=this.value">
                </div>
                <div class="form-group full-width">
                    <label>API 密钥</label>
                    <textarea rows="2" onchange="state.video_providers[${i}].api_keys=this.value">${Array.isArray(p.api_keys) ? p.api_keys.join('\n') : (p.api_keys || p['API密钥'] || '')}</textarea>
                </div>
            </div>
        </div>
    `).join('');
    document.getElementById("video-providers-container").innerHTML = html || '<p class="empty-tip">暂无视频节点</p>';
};
window.addVideoProvider = () => { state.video_providers.push({id:`video_node_${state.video_providers.length+1}`, api_type:"async_task (异步排队轮询/videos/generations)", base_url:"https://api.example.com/v1", model:"", api_keys:"", timeout:300}); window.renderVideoProviders(); };
window.delVideoProvider = (i) => { state.video_providers.splice(i, 1); window.renderVideoProviders(); };


// ================== 保存与通信 ==================
async function saveConfig() {
    const btn = document.getElementById("save-btn");
    const msg = document.getElementById("status-msg");
    
    btn.disabled = true;
    msg.textContent = "⏳ 正在热重载保存...";
    msg.className = "status-saving";

    readBasicFields();

    // 格式化 presets 数组
    const formattedPresets = state.presets
        .filter(p => p.name && p.prompt)
        .map(p => `${p.name}:${p.prompt}`);

    const payload = {
        permission_config: state.permission_config,
        persona_config: state.persona_config,
        optimizer_config: state.optimizer_config,
        router_config: state.router_config,
        presets: formattedPresets,
        providers: state.providers,
        video_providers: state.video_providers
    };

    try {
        const result = await bridge.apiPost("save_config", payload);
        if (result.success) {
            msg.textContent = "✅ 保存成功！已实时生效。";
            msg.className = "status-success";
        } else {
            msg.textContent = "❌ 保存失败，请查看日志。";
            msg.className = "status-error";
        }
    } catch (e) {
        msg.textContent = "❌ 网络错误: " + e;
        msg.className = "status-error";
    }

    setTimeout(() => {
        btn.disabled = false;
        msg.textContent = "";
        msg.className = "status-empty";
    }, 3000);
}

init();const bridge = window.AstrBotPluginPage;

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
