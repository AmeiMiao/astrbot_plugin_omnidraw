const bridge = window.AstrBotPluginPage;

let state = {
    permission_config: {}, persona_config: {}, optimizer_config: {}, router_config: {},
    presets: [], providers: [], video_providers: []
};

// 丝滑弹窗系统
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-text">${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('toast-fadeout'), 2500);
    setTimeout(() => toast.remove(), 2800);
}

// 深度数据打捞 (确保旧数据100%找回)
const deepFind = (obj, keys, def = "") => {
    if (!obj) return def;
    for (const key of keys) {
        if (obj[key] !== undefined) return obj[key];
    }
    return def;
};

async function init() {
    const context = await bridge.ready();
    const rawConfig = await bridge.apiGet("get_config") || {};
    
    const perm = rawConfig.permission_config || rawConfig;
    const pers = rawConfig.persona_config || rawConfig;
    const opt = rawConfig.optimizer_config || rawConfig;
    const route = rawConfig.router_config || rawConfig;

    state.permission_config.allowed_users = deepFind(perm, ["allowed_users"]);
    
    state.router_config.chain_text2img = deepFind(route, ["chain_text2img"], "node_1");
    state.router_config.chain_selfie = deepFind(route, ["chain_selfie"], "node_1");
    state.router_config.chain_video = deepFind(route, ["chain_video"], "video_node_1");

    state.persona_config.persona_name = deepFind(pers, ["persona_name"], "默认助理");
    state.persona_config.persona_base_prompt = deepFind(pers, ["persona_base_prompt"]);
    state.persona_config.persona_ref_image = deepFind(pers, ["persona_ref_image"]);

    state.optimizer_config.enable_optimizer = deepFind(opt, ["enable_optimizer"], true);
    state.optimizer_config.optimizer_style = deepFind(opt, ["optimizer_style"], "手机日常原生感");
    state.optimizer_config.chain_optimizer = deepFind(opt, ["chain_optimizer"], "node_1");
    state.optimizer_config.optimizer_model = deepFind(opt, ["optimizer_model"], "gpt-4o-mini");
    state.optimizer_config.optimizer_timeout = parseFloat(deepFind(opt, ["optimizer_timeout"], 15));
    state.optimizer_config.max_batch_count = parseInt(deepFind(opt, ["max_batch_count"], 0));
    state.optimizer_config.optimizer_custom_prompt = deepFind(opt, ["optimizer_custom_prompt"]);
    
    const rawPresets = rawConfig.presets || [];
    state.presets = rawPresets.map(p => {
        if(typeof p === 'string') {
            const parts = p.split(/:(.+)/);
            return { name: parts[0] || "", prompt: parts[1] || "" };
        }
        return p;
    });

    state.providers = (rawConfig.providers || []).map(p => ({
        id: p.id || p['节点ID'] || '',
        api_type: p.api_type || p['接口模式'] || 'openai_image',
        base_url: p.base_url || p['接口地址 (需含/v1)'] || 'https://api.openai.com/v1',
        model: p.model || p['模型名称'] || '',
        timeout: p.timeout || p['超时时间(秒)'] || 60,
        api_keys: Array.isArray(p.api_keys) ? p.api_keys.join('\n') : (p.api_keys || p['API密钥'] || '')
    }));

    state.video_providers = (rawConfig.video_providers || []).map(p => ({
        id: p.id || p['节点ID'] || '',
        api_type: p.api_type || p['接口模式'] || 'async_task (异步排队轮询/videos/generations)',
        base_url: p.base_url || p['接口地址 (需含/v1或/v2)'] || p['接口地址 (需含/v1)'] || '',
        model: p.model || p['模型名称'] || '',
        timeout: p.timeout || p['超时时间(秒)'] || 300,
        api_keys: Array.isArray(p.api_keys) ? p.api_keys.join('\n') : (p.api_keys || p['API密钥'] || '')
    }));

    bindBasicFields();
    renderPresets();
    renderProviders();
    renderVideoProviders();
    setupEventDelegation();
}

function bindBasicFields() {
    document.getElementById("perm_allowed_users").value = state.permission_config.allowed_users;
    document.getElementById("route_img").value = state.router_config.chain_text2img;
    document.getElementById("route_selfie").value = state.router_config.chain_selfie;
    document.getElementById("route_video").value = state.router_config.chain_video;
    document.getElementById("persona_name").value = state.persona_config.persona_name;
    document.getElementById("persona_prompt").value = state.persona_config.persona_base_prompt;
    document.getElementById("persona_ref").value = state.persona_config.persona_ref_image;
    document.getElementById("opt_enable").checked = state.optimizer_config.enable_optimizer;
    document.getElementById("opt_style").value = state.optimizer_config.optimizer_style;
    document.getElementById("opt_chain").value = state.optimizer_config.chain_optimizer;
    document.getElementById("opt_model").value = state.optimizer_config.optimizer_model;
    document.getElementById("opt_timeout").value = state.optimizer_config.optimizer_timeout;
    document.getElementById("opt_batch").value = state.optimizer_config.max_batch_count;
    document.getElementById("opt_custom").value = state.optimizer_config.optimizer_custom_prompt;
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

function renderPresets() {
    const html = state.presets.map((p, i) => `
        <div class="list-item">
            <input type="text" class="input-modern preset-name" placeholder="预设指令名" value="${p.name}" data-sync="preset-name" data-index="${i}">
            <span class="divider-text">映射为</span>
            <input type="text" class="input-modern preset-prompt" placeholder="对应的底层提示词" value="${p.prompt}" data-sync="preset-prompt" data-index="${i}">
            <button data-action="del-preset" data-index="${i}" class="btn-icon">×</button>
        </div>
    `).join('');
    document.getElementById("presets-container").innerHTML = html || '<div class="empty-tip">暂无预设指令</div>';
}

function renderProviders() {
    const html = state.providers.map((p, i) => `
        <div class="list-card">
            <div class="list-card-header">
                <div class="node-title">
                    <span class="node-badge">Image Node ${i+1}</span>
                    <input type="text" class="input-modern input-minimal" placeholder="节点ID" value="${p.id}" data-sync="prov-id" data-index="${i}">
                </div>
                <button data-action="del-provider" data-index="${i}" class="btn-text">移除</button>
            </div>
            <div class="grid-2-col">
                <div class="form-group">
                    <label>接口模式</label>
                    <select class="input-modern select-modern" data-sync="prov-api" data-index="${i}">
                        <option value="openai_image" ${p.api_type==='openai_image'?'selected':''}>openai_image (标准生图)</option>
                        <option value="openai_chat" ${p.api_type==='openai_chat'?'selected':''}>openai_chat (对话透传)</option>
                    </select>
                </div>
                <div class="form-group"><label>接口地址 (需含/v1)</label><input type="text" class="input-modern" value="${p.base_url}" data-sync="prov-url" data-index="${i}"></div>
                <div class="form-group"><label>可用模型 (逗号分隔)</label><input type="text" class="input-modern" value="${p.model}" data-sync="prov-model" data-index="${i}"></div>
                <div class="form-group"><label>请求超时限制</label><input type="number" class="input-modern" value="${p.timeout}" data-sync="prov-time" data-index="${i}"></div>
                <div class="form-group full-width"><label>API Keys (支持多行负载均衡)</label><textarea class="input-modern" rows="2" data-sync="prov-keys" data-index="${i}">${p.api_keys}</textarea></div>
            </div>
        </div>
    `).join('');
    document.getElementById("providers-container").innerHTML = html || '<div class="empty-tip">未配置生图节点</div>';
}

function renderVideoProviders() {
    const html = state.video_providers.map((p, i) => `
        <div class="list-card">
            <div class="list-card-header">
                <div class="node-title">
                    <span class="node-badge">Video Node ${i+1}</span>
                    <input type="text" class="input-modern input-minimal" placeholder="节点ID" value="${p.id}" data-sync="vid-id" data-index="${i}">
                </div>
                <button data-action="del-video-provider" data-index="${i}" class="btn-text">移除</button>
            </div>
            <div class="grid-2-col">
                <div class="form-group">
                    <label>通信协议</label>
                    <select class="input-modern select-modern" data-sync="vid-api" data-index="${i}">
                        <option value="async_task (异步排队轮询/videos/generations)" ${p.api_type.includes('async_task')?'selected':''}>异步排队轮询</option>
                        <option value="openai_sync (同步阻塞直返)" ${p.api_type.includes('openai_sync')?'selected':''}>同步阻塞返回</option>
                        <option value="openai_chat (对话伪装视频/chat/completions)" ${p.api_type.includes('openai_chat')?'selected':''}>对话伪装协议</option>
                    </select>
                </div>
                <div class="form-group"><label>接口地址</label><input type="text" class="input-modern" value="${p.base_url}" data-sync="vid-url" data-index="${i}"></div>
                <div class="form-group"><label>模型名称</label><input type="text" class="input-modern" value="${p.model}" data-sync="vid-model" data-index="${i}"></div>
                <div class="form-group"><label>请求超时</label><input type="number" class="input-modern" value="${p.timeout}" data-sync="vid-time" data-index="${i}"></div>
                <div class="form-group full-width"><label>API Keys</label><textarea class="input-modern" rows="2" data-sync="vid-keys" data-index="${i}">${p.api_keys}</textarea></div>
            </div>
        </div>
    `).join('');
    document.getElementById("video-providers-container").innerHTML = html || '<div class="empty-tip">未配置视频节点</div>';
}

function setupEventDelegation() {
    // 丝滑 Tab 切换
    document.body.addEventListener('click', (e) => {
        const navItem = e.target.closest('.nav-item');
        if (navItem) {
            const targetId = navItem.getAttribute('data-target');
            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
            navItem.classList.add('active');
            
            document.querySelectorAll('.tab-pane').forEach(pane => {
                pane.classList.remove('active');
                setTimeout(() => { if (!pane.classList.contains('active')) pane.style.display = 'none'; }, 200);
            });
            
            const targetPane = document.getElementById(targetId);
            targetPane.style.display = 'block';
            // 触发布局重绘以启动过渡动画
            void targetPane.offsetWidth;
            targetPane.classList.add('active');
            return;
        }

        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const action = btn.getAttribute('data-action');
        const idx = parseInt(btn.getAttribute('data-index'), 10);

        if (action === 'save-config') saveConfig(btn);
        if (action === 'add-preset') { state.presets.push({name:"", prompt:""}); renderPresets(); }
        if (action === 'del-preset') { state.presets.splice(idx, 1); renderPresets(); }
        if (action === 'add-provider') { state.providers.push({id:`node_${state.providers.length+1}`, api_type:"openai_image", base_url:"https://api.openai.com/v1", model:"", api_keys:"", timeout:60}); renderProviders(); }
        if (action === 'del-provider') { state.providers.splice(idx, 1); renderProviders(); }
        if (action === 'add-video-provider') { state.video_providers.push({id:`video_node_${state.video_providers.length+1}`, api_type:"async_task (异步排队轮询/videos/generations)", base_url:"https://api.example.com/v1", model:"", api_keys:"", timeout:300}); renderVideoProviders(); }
        if (action === 'del-video-provider') { state.video_providers.splice(idx, 1); renderVideoProviders(); }
    });

    // 状态绑定
    document.body.addEventListener('input', (e) => {
        const input = e.target;
        if (!input.hasAttribute('data-sync')) return;
        const sync = input.getAttribute('data-sync');
        const idx = parseInt(input.getAttribute('data-index'), 10);
        const val = input.value;

        if (sync === 'preset-name') state.presets[idx].name = val;
        if (sync === 'preset-prompt') state.presets[idx].prompt = val;
        if (sync === 'prov-id') state.providers[idx].id = val;
        if (sync === 'prov-api') state.providers[idx].api_type = val;
        if (sync === 'prov-url') state.providers[idx].base_url = val;
        if (sync === 'prov-model') state.providers[idx].model = val;
        if (sync === 'prov-time') state.providers[idx].timeout = val;
        if (sync === 'prov-keys') state.providers[idx].api_keys = val;
        if (sync === 'vid-id') state.video_providers[idx].id = val;
        if (sync === 'vid-api') state.video_providers[idx].api_type = val;
        if (sync === 'vid-url') state.video_providers[idx].base_url = val;
        if (sync === 'vid-model') state.video_providers[idx].model = val;
        if (sync === 'vid-time') state.video_providers[idx].timeout = val;
        if (sync === 'vid-keys') state.video_providers[idx].api_keys = val;
    });
}

async function saveConfig(btn) {
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = `保存中...`;

    readBasicFields();
    const formattedPresets = state.presets.filter(p => p.name && p.prompt).map(p => `${p.name}:${p.prompt}`);

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
            showToast("设置已保存并生效", "success");
        } else {
            showToast("保存失败，请检查数据", "error");
        }
    } catch (e) {
        showToast("网络异常", "error");
    }

    setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }, 800);
}

init();
