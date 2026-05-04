const bridge = window.AstrBotPluginPage;

let state = {
    permission_config: {}, persona_config: {}, optimizer_config: {}, router_config: {},
    presets: [], providers: [], video_providers: []
};

// 丝滑提示框
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${type === 'success' ? '✓' : '✕'}</span> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('toast-fadeout'), 2500);
    setTimeout(() => toast.remove(), 2800);
}

// 芯片选择器渲染
function renderSelectors() {
    const renderTo = (containerId, sourceList, inputId) => {
        const container = document.getElementById(containerId);
        const hiddenInput = document.getElementById(inputId);
        const currentVal = hiddenInput.value;
        
        container.innerHTML = sourceList.map(node => {
            const nodeId = node.id || node['节点ID'];
            if(!nodeId) return '';
            const isActive = nodeId === currentVal;
            return `<div class="selector-chip ${isActive ? 'active' : ''}" data-id="${nodeId}" data-input="${inputId}">${nodeId}</div>`;
        }).join('') || '<span class="empty-hint">请先在「算力集群」中配置并填写节点 ID</span>';
    };

    renderTo('sel-route-img', state.providers, 'route_img');
    renderTo('sel-route-selfie', state.providers, 'route_selfie');
    renderTo('sel-opt-chain', state.providers, 'opt_chain');
    renderTo('sel-route-video', state.video_providers, 'route_video');
}

function updateImagePreview(url) {
    const preview = document.getElementById('persona-preview');
    if (url && url.length > 0) {
        preview.style.backgroundImage = `url('${url}')`;
        preview.textContent = '';
    } else {
        preview.style.backgroundImage = 'none';
        preview.textContent = '无预览';
    }
}

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

    state.permission_config.allowed_users = pers.allowed_users || perm.allowed_users || "";
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

    state.presets = (rawConfig.presets || []).map(p => typeof p === 'string' ? { name: p.split(':')[0], prompt: p.split(':')[1] } : p);
    
    // 💡 彻底修复映射问题
    state.providers = (rawConfig.providers || []).map(p => ({
        id: p.id || p['节点ID'] || '',
        api_type: p.api_type || p['接口模式'] || 'openai_image',
        base_url: p.base_url || p['接口地址 (需含/v1)'] || '',
        model: p.model || p['模型名称'] || '',
        timeout: p.timeout || p['超时时间(秒)'] || 60,
        api_keys: Array.isArray(p.api_keys) ? p.api_keys.join('\n') : (p.api_keys || p['API密钥'] || '')
    }));

    state.video_providers = (rawConfig.video_providers || []).map(p => ({
        id: p.id || p['节点ID'] || '',
        api_type: p.api_type || p['接口模式'] || 'async_task',
        base_url: p.base_url || p['接口地址 (需含/v1或/v2)'] || p['接口地址 (需含/v1)'] || '',
        model: p.model || p['模型名称'] || '',
        timeout: p.timeout || p['超时时间(秒)'] || 300,
        api_keys: Array.isArray(p.api_keys) ? p.api_keys.join('\n') : (p.api_keys || p['API密钥'] || '')
    }));

    bindBasicFields();
    renderSelectors();
    renderPresets();
    renderProviders();
    renderVideoProviders();
    setupEventDelegation();
    updateImagePreview(state.persona_config.persona_ref_image);
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
            <input type="text" class="input-modern preset-name" placeholder="快捷指令名" value="${p.name}" data-sync="preset-name" data-index="${i}">
            <span class="divider-text">→</span>
            <input type="text" class="input-modern preset-prompt" placeholder="对应的底层描述词" value="${p.prompt}" data-sync="preset-prompt" data-index="${i}">
            <button data-action="del-preset" data-index="${i}" class="btn-icon">×</button>
        </div>
    `).join('');
    document.getElementById("presets-container").innerHTML = html || '<div class="empty-tip">尚未配置快捷指令</div>';
}

function renderProviders() {
    const html = state.providers.map((p, i) => `
        <div class="list-card">
            <div class="list-card-header">
                <input type="text" class="input-minimal" placeholder="输入节点 ID" value="${p.id}" data-sync="prov-id" data-index="${i}">
                <button data-action="del-provider" data-index="${i}" class="btn-text">移除</button>
            </div>
            <div class="grid-2-col">
                <div class="form-group"><label>接口模式</label><select class="input-modern" data-sync="prov-api" data-index="${i}"><option value="openai_image" ${p.api_type==='openai_image'?'selected':''}>openai_image</option><option value="openai_chat" ${p.api_type==='openai_chat'?'selected':''}>openai_chat</option></select></div>
                <div class="form-group"><label>接口地址 (需含/v1)</label><input type="text" class="input-modern" value="${p.base_url}" data-sync="prov-url" data-index="${i}"></div>
                <div class="form-group"><label>模型名称</label><input type="text" class="input-modern" value="${p.model}" data-sync="prov-model" data-index="${i}"></div>
                <div class="form-group"><label>请求超时</label><input type="number" class="input-modern" value="${p.timeout}" data-sync="prov-time" data-index="${i}"></div>
                <div class="form-group full-width"><label>API Keys (多行换行负载均衡)</label><textarea class="input-modern" rows="1" data-sync="prov-keys" data-index="${i}">${p.api_keys}</textarea></div>
            </div>
        </div>
    `).join('');
    document.getElementById("providers-container").innerHTML = html;
}

function renderVideoProviders() {
    const html = state.video_providers.map((p, i) => `
        <div class="list-card">
            <div class="list-card-header">
                <input type="text" class="input-minimal" placeholder="输入视频节点 ID" value="${p.id}" data-sync="vid-id" data-index="${i}">
                <button data-action="del-video-provider" data-index="${i}" class="btn-text">移除</button>
            </div>
            <div class="grid-2-col">
                <div class="form-group"><label>调用协议</label><select class="input-modern" data-sync="vid-api" data-index="${i}">
                    <option value="async_task" ${p.api_type.includes('async_task')?'selected':''}>异步轮询 (推荐)</option>
                    <option value="openai_sync" ${p.api_type.includes('openai_sync')?'selected':''}>同步阻塞返回</option>
                    <option value="openai_chat" ${p.api_type.includes('openai_chat')?'selected':''}>对话接口伪装</option>
                </select></div>
                <div class="form-group"><label>接口地址</label><input type="text" class="input-modern" value="${p.base_url}" data-sync="vid-url" data-index="${i}"></div>
                <div class="form-group"><label>模型名称</label><input type="text" class="input-modern" value="${p.model}" data-sync="vid-model" data-index="${i}"></div>
                <div class="form-group"><label>请求超时</label><input type="number" class="input-modern" value="${p.timeout}" data-sync="vid-time" data-index="${i}"></div>
                <div class="form-group full-width"><label>API Keys</label><textarea class="input-modern" rows="1" data-sync="vid-keys" data-index="${i}">${p.api_keys}</textarea></div>
            </div>
        </div>
    `).join('');
    document.getElementById("video-providers-container").innerHTML = html;
}

function setupEventDelegation() {
    // 💡 处理原生图片解析逻辑 (解决上传失败)
    const fileInput = document.getElementById('hidden-file-input');
    
    document.body.addEventListener('click', (e) => {
        // Tab 切换逻辑
        const navItem = e.target.closest('.nav-item');
        if (navItem) {
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            navItem.classList.add('active');
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            document.getElementById(navItem.getAttribute('data-target')).classList.add('active');
            return;
        }

        // 芯片联动选择
        const chip = e.target.closest('.selector-chip');
        if (chip) {
            const inputId = chip.getAttribute('data-input');
            document.getElementById(inputId).value = chip.getAttribute('data-id');
            document.querySelectorAll(`.selector-chip[data-input="${inputId}"]`).forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            return;
        }

        // 唤起原生文件选择器
        if (e.target.closest('#persona-upload-trigger')) {
            fileInput.click();
        }

        // 按钮操作
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const act = btn.getAttribute('data-action');
        const idx = parseInt(btn.getAttribute('data-index'), 10);

        if (act === 'save-config') saveConfig(btn);
        if (act === 'add-preset') { state.presets.push({name:"", prompt:""}); renderPresets(); }
        if (act === 'del-preset') { state.presets.splice(idx, 1); renderPresets(); }
        if (act === 'add-provider') { state.providers.push({id:`node_${state.providers.length+1}`, api_type:"openai_image", base_url:"", model:"", api_keys:"", timeout:60}); renderProviders(); renderSelectors(); }
        if (act === 'del-provider') { state.providers.splice(idx, 1); renderProviders(); renderSelectors(); }
        if (act === 'add-video-provider') { state.video_providers.push({id:`v_node_${state.video_providers.length+1}`, api_type:"async_task", base_url:"", model:"", api_keys:"", timeout:300}); renderVideoProviders(); renderSelectors(); }
        if (act === 'del-video-provider') { state.video_providers.splice(idx, 1); renderVideoProviders(); renderSelectors(); }
    });

    // 解析图片 Base64
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(evt) {
                const base64Str = evt.target.result;
                document.getElementById('persona_ref').value = base64Str;
                updateImagePreview(base64Str);
                showToast("参考图已提取并转化");
            };
            reader.readAsDataURL(file);
        }
    });

    // 💡 性能优化：打字时仅同步数据，失焦 (change) 时才重绘芯片
    document.body.addEventListener('input', (e) => {
        const input = e.target;
        if (!input.hasAttribute('data-sync')) return;
        const s = input.getAttribute('data-sync');
        const i = parseInt(input.getAttribute('data-index'), 10);
        const v = input.value;
        
        if (s === 'preset-name') state.presets[i].name = v;
        if (s === 'preset-prompt') state.presets[i].prompt = v;
        if (s === 'prov-id') state.providers[i].id = v; 
        if (s === 'prov-api') state.providers[i].api_type = v;
        if (s === 'prov-url') state.providers[i].base_url = v;
        if (s === 'prov-model') state.providers[i].model = v;
        if (s === 'prov-time') state.providers[i].timeout = v;
        if (s === 'prov-keys') state.providers[i].api_keys = v;
        if (s === 'vid-id') state.video_providers[i].id = v; 
        if (s === 'vid-api') state.video_providers[i].api_type = v;
        if (s === 'vid-url') state.video_providers[i].base_url = v;
        if (s === 'vid-model') state.video_providers[i].model = v;
        if (s === 'vid-time') state.video_providers[i].timeout = v;
        if (s === 'vid-keys') state.video_providers[i].api_keys = v;
    });

    // 失去焦点时刷新芯片选择器
    document.body.addEventListener('change', (e) => {
        const input = e.target;
        if (!input.hasAttribute('data-sync')) return;
        const s = input.getAttribute('data-sync');
        if (s === 'prov-id' || s === 'vid-id') {
            renderSelectors();
        }
    });
}

async function saveConfig(btn) {
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = `<span class="spinner">↻</span> 保存并部署中...`;
    
    readBasicFields();

    const payload = {
        permission_config: state.permission_config,
        persona_config: state.persona_config,
        optimizer_config: state.optimizer_config,
        router_config: state.router_config,
        presets: state.presets.filter(p=>p.name).map(p=>`${p.name}:${p.prompt}`),
        providers: state.providers,
        video_providers: state.video_providers
    };

    try {
        const res = await bridge.apiPost("save_config", payload);
        if (res.success) showToast("部署成功，已生效！");
        else showToast("部署异常", "error");
    } catch(e) { showToast("网络错误", "error"); }
    
    setTimeout(() => { btn.disabled = false; btn.innerHTML = originalText; }, 800);
}

init();
