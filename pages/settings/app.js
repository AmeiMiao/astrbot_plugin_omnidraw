const bridge = window.AstrBotPluginPage;

let state = {
    permission_config: {}, persona_config: { persona_ref_image: [] }, optimizer_config: {}, router_config: {},
    presets: [], providers: [], video_providers: [], verbose_report: false
};

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${type === 'success' ? '✓' : '✕'}</span> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('toast-fadeout'), 2500);
    setTimeout(() => toast.remove(), 2800);
}

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

function renderPersonaImages() {
    const container = document.getElementById('persona-upload-container');
    container.querySelectorAll('.image-preview-wrapper').forEach(el => el.remove());
    const trigger = document.getElementById('persona-upload-trigger');
    const images = state.persona_config.persona_ref_image || [];
    images.forEach((url, idx) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'image-preview-wrapper';
        wrapper.innerHTML = `<img src="${url}" class="image-preview" alt="Ref" /><button class="btn-del-img" data-action="del-persona-img" data-index="${idx}">×</button>`;
        container.insertBefore(wrapper, trigger);
    });
}

const deepFind = (obj, keys, def = "") => {
    if (!obj) return def;
    for (const key of keys) { if (obj[key] !== undefined) return obj[key]; }
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
    state.persona_config.persona_ref_image = Array.isArray(deepFind(pers, ["persona_ref_image"])) ? deepFind(pers, ["persona_ref_image"]) : [];
    state.optimizer_config.enable_optimizer = deepFind(opt, ["enable_optimizer"], true);
    state.optimizer_config.optimizer_style = deepFind(opt, ["optimizer_style"], "手机日常原生感");
    state.optimizer_config.chain_optimizer = deepFind(opt, ["chain_optimizer"], "node_1");
    state.optimizer_config.optimizer_model = deepFind(opt, ["optimizer_model"], "gpt-4o-mini");
    state.optimizer_config.optimizer_timeout = parseFloat(deepFind(opt, ["optimizer_timeout"], 15));
    state.optimizer_config.max_batch_count = parseInt(deepFind(opt, ["max_batch_count"], 0));
    state.optimizer_config.optimizer_custom_prompt = deepFind(opt, ["optimizer_custom_prompt"]);
    state.verbose_report = rawConfig.verbose_report || false;

    state.presets = (rawConfig.presets || []).map(p => typeof p === 'string' ? { name: p.split(':')[0], prompt: p.split(':')[1] } : p);
    state.providers = (rawConfig.providers || []).map(p => ({
        id: p.id || p['节点ID'] || '', api_type: p.api_type || 'openai_image',
        base_url: p.base_url || '', model: p.model || '', timeout: p.timeout || 60, 
        api_keys: Array.isArray(p.api_keys) ? p.api_keys.join('\n') : (p.api_keys || '')
    }));
    state.video_providers = (rawConfig.video_providers || []).map(p => ({
        id: p.id || p['节点ID'] || '', api_type: p.api_type || 'async_task',
        base_url: p.base_url || '', model: p.model || '', timeout: p.timeout || 300,
        api_keys: Array.isArray(p.api_keys) ? p.api_keys.join('\n') : (p.api_keys || '')
    }));

    bindBasicFields();
    renderSelectors();
    renderPresets();
    renderProviders();
    renderVideoProviders();
    setupEventDelegation();
    renderPersonaImages();
}

function bindBasicFields() {
    document.getElementById("perm_allowed_users").value = state.permission_config.allowed_users;
    document.getElementById("route_img").value = state.router_config.chain_text2img;
    document.getElementById("route_selfie").value = state.router_config.chain_selfie;
    document.getElementById("route_video").value = state.router_config.chain_video;
    document.getElementById("persona_name").value = state.persona_config.persona_name;
    document.getElementById("persona_prompt").value = state.persona_config.persona_base_prompt;
    document.getElementById("opt_enable").checked = state.optimizer_config.enable_optimizer;
    document.getElementById("opt_style").value = state.optimizer_config.optimizer_style;
    document.getElementById("opt_chain").value = state.optimizer_config.chain_optimizer;
    document.getElementById("opt_model").value = state.optimizer_config.optimizer_model;
    document.getElementById("opt_timeout").value = state.optimizer_config.optimizer_timeout;
    document.getElementById("opt_batch").value = state.optimizer_config.max_batch_count;
    document.getElementById("opt_custom").value = state.optimizer_config.optimizer_custom_prompt;
    document.getElementById("verbose_report").checked = state.verbose_report;
}

function readBasicFields() {
    state.permission_config.allowed_users = document.getElementById("perm_allowed_users").value;
    state.router_config.chain_text2img = document.getElementById("route_img").value;
    state.router_config.chain_selfie = document.getElementById("route_selfie").value;
    state.router_config.chain_video = document.getElementById("route_video").value;
    state.persona_config.persona_name = document.getElementById("persona_name").value;
    state.persona_config.persona_base_prompt = document.getElementById("persona_prompt").value;
    state.optimizer_config.enable_optimizer = document.getElementById("opt_enable").checked;
    state.optimizer_config.optimizer_style = document.getElementById("opt_style").value;
    state.optimizer_config.chain_optimizer = document.getElementById("opt_chain").value;
    state.optimizer_config.optimizer_model = document.getElementById("opt_model").value;
    state.optimizer_config.optimizer_timeout = parseFloat(document.getElementById("opt_timeout").value);
    state.optimizer_config.max_batch_count = parseInt(document.getElementById("opt_batch").value);
    state.optimizer_config.optimizer_custom_prompt = document.getElementById("opt_custom").value;
    state.verbose_report = document.getElementById("verbose_report").checked;
}

function renderPresets() {
    const html = state.presets.map((p, i) => `
        <div class="list-item">
            <input type="text" class="input-glass preset-name" style="width: 140px; border:none; background:transparent;" placeholder="快捷指令名" value="${p.name}" data-sync="preset-name" data-index="${i}">
            <span style="color:var(--text-muted); font-weight: bold; margin: 0 10px;">→</span>
            <input type="text" class="input-glass preset-prompt" style="flex:1; border:none; background:transparent;" placeholder="底层的英文描述与参数" value="${p.prompt}" data-sync="preset-prompt" data-index="${i}">
            <button data-action="del-preset" data-index="${i}" class="btn-glass-secondary" style="border:none; color:var(--text-muted); font-size:16px;">×</button>
        </div>
    `).join('');
    document.getElementById("presets-container").innerHTML = html || '<div style="text-align:center; padding: 30px; color: var(--text-muted);">尚未配置快捷指令</div>';
}

function renderProviders() {
    const html = state.providers.map((p, i) => `
        <div class="glass-card" style="padding: 24px; margin-bottom: 16px;">
            <div class="card-header" style="margin-bottom: 16px; border-bottom: 1px solid rgba(0,0,0,0.05); padding-bottom: 12px;">
                <input type="text" class="input-glass" style="width: 200px; font-weight:bold; font-size: 16px; background: transparent; border:none; border-bottom: 1px solid transparent;" placeholder="输入节点 ID" value="${p.id}" data-sync="prov-id" data-index="${i}">
                <button data-action="del-provider" data-index="${i}" style="background:transparent; border:none; color:var(--danger); font-weight:bold; cursor:pointer;">移除</button>
            </div>
            <div class="grid-2-col">
                <div class="form-group"><label>接口模式</label><select class="input-glass" data-sync="prov-api" data-index="${i}"><option value="openai_image" ${p.api_type==='openai_image'?'selected':''}>openai_image</option><option value="openai_chat" ${p.api_type==='openai_chat'?'selected':''}>openai_chat</option></select></div>
                <div class="form-group"><label>接口地址 (需含/v1)</label><input type="text" class="input-glass" value="${p.base_url}" data-sync="prov-url" data-index="${i}"></div>
                <div class="form-group"><label>模型名称</label><input type="text" class="input-glass" value="${p.model}" data-sync="prov-model" data-index="${i}"></div>
                <div class="form-group"><label>请求超时</label><input type="number" class="input-glass" value="${p.timeout}" data-sync="prov-time" data-index="${i}"></div>
                <div class="form-group full-width"><label>API Keys</label><textarea class="input-glass" rows="1" data-sync="prov-keys" data-index="${i}">${p.api_keys}</textarea></div>
            </div>
        </div>
    `).join('');
    document.getElementById("providers-container").innerHTML = html;
}

function renderVideoProviders() {
    const html = state.video_providers.map((p, i) => `
        <div class="glass-card" style="padding: 24px; margin-bottom: 16px;">
            <div class="card-header" style="margin-bottom: 16px; border-bottom: 1px solid rgba(0,0,0,0.05); padding-bottom: 12px;">
                <input type="text" class="input-glass" style="width: 200px; font-weight:bold; font-size: 16px; background: transparent; border:none; border-bottom: 1px solid transparent;" placeholder="输入视频节点 ID" value="${p.id}" data-sync="vid-id" data-index="${i}">
                <button data-action="del-video-provider" data-index="${i}" style="background:transparent; border:none; color:var(--danger); font-weight:bold; cursor:pointer;">移除</button>
            </div>
            <div class="grid-2-col">
                <div class="form-group"><label>调用协议</label><select class="input-glass" data-sync="vid-api" data-index="${i}">
                    <option value="async_task" ${p.api_type.includes('async_task')?'selected':''}>异步轮询 (推荐)</option>
                    <option value="openai_sync" ${p.api_type.includes('openai_sync')?'selected':''}>同步阻塞返回</option>
                    <option value="openai_chat" ${p.api_type.includes('openai_chat')?'selected':''}>对话接口伪装</option>
                </select></div>
                <div class="form-group"><label>接口地址</label><input type="text" class="input-glass" value="${p.base_url}" data-sync="vid-url" data-index="${i}"></div>
                <div class="form-group"><label>模型名称</label><input type="text" class="input-glass" value="${p.model}" data-sync="vid-model" data-index="${i}"></div>
                <div class="form-group"><label>请求超时</label><input type="number" class="input-glass" value="${p.timeout}" data-sync="vid-time" data-index="${i}"></div>
                <div class="form-group full-width"><label>API Keys</label><textarea class="input-glass" rows="1" data-sync="vid-keys" data-index="${i}">${p.api_keys}</textarea></div>
            </div>
        </div>
    `).join('');
    document.getElementById("video-providers-container").innerHTML = html;
}

function setupEventDelegation() {
    const fileInput = document.getElementById('hidden-file-input');
    
    document.body.addEventListener('click', (e) => {
        const navItem = e.target.closest('.nav-item');
        if (navItem) {
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            navItem.classList.add('active');
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            document.getElementById(navItem.getAttribute('data-target')).classList.add('active');
            return;
        }

        const chip = e.target.closest('.selector-chip');
        if (chip) {
            const inputId = chip.getAttribute('data-input');
            document.getElementById(inputId).value = chip.getAttribute('data-id');
            document.querySelectorAll(`.selector-chip[data-input="${inputId}"]`).forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            return;
        }

        if (e.target.closest('#persona-upload-trigger')) fileInput.click();

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
        if (act === 'del-persona-img') { state.persona_config.persona_ref_image.splice(idx, 1); renderPersonaImages(); }
    });

    if(fileInput) {
        fileInput.addEventListener('change', function(e) {
            Array.from(e.target.files).forEach(file => {
                const reader = new FileReader();
                reader.onload = (evt) => { state.persona_config.persona_ref_image.push(evt.target.result); renderPersonaImages(); };
                reader.readAsDataURL(file);
            });
            fileInput.value = '';
        });
    }

    document.body.addEventListener('input', (e) => {
        const input = e.target;
        if (!input.hasAttribute('data-sync')) return;
        const s = input.getAttribute('data-sync');
        const i = parseInt(input.getAttribute('data-index'), 10);
        const v = input.value;
        
        // 👇 修复重点：标识符映射对齐
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

    document.body.addEventListener('change', (e) => {
        const input = e.target;
        if (!input.hasAttribute('data-sync')) return;
        const s = input.getAttribute('data-sync');
        if (s === 'prov-id' || s === 'vid-id') renderSelectors();
    });
}

async function saveConfig(btn) {
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = `<span class="spinner">↻</span> 部署中...`;
    readBasicFields();

    const payload = {
        ...state,
        presets: state.presets.filter(p=>p.name).map(p=>`${p.name}:${p.prompt}`)
    };

    try {
        const res = await bridge.apiPost("save_config", payload);
        if (res.success) showToast("部署成功！");
        else showToast("部署异常", "error");
    } catch(e) { showToast("网络错误", "error"); }
    
    setTimeout(() => { btn.disabled = false; btn.innerHTML = originalText; }, 800);
}

init();const bridge = window.AstrBotPluginPage;

let state = {
    permission_config: { allowed_users: "" },
    persona_config: { persona_name: "", persona_base_prompt: "", persona_ref_image: [] },
    optimizer_config: { enable_optimizer: true, optimizer_style: "手机日常原生感", chain_optimizer: "node_1", optimizer_model: "gpt-4o-mini", optimizer_timeout: 15, max_batch_count: 0, optimizer_custom_prompt: "" },
    router_config: { chain_text2img: "node_1", chain_selfie: "node_1", chain_video: "video_node_1" },
    presets: [], providers: [], video_providers: [], verbose_report: false
};

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerText = message;
    if(container) container.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

function renderSelectors() {
    const renderTo = (containerId, sourceList, inputId) => {
        const container = document.getElementById(containerId);
        const hiddenInput = document.getElementById(inputId);
        if (!container || !hiddenInput) return;
        const currentVal = hiddenInput.value;
        container.innerHTML = sourceList.map(node => {
            const nodeId = node.id;
            if(!nodeId) return '';
            return `<div class="selector-chip ${nodeId === currentVal ? 'active' : ''}" data-id="${nodeId}" data-input="${inputId}">${nodeId}</div>`;
        }).join('') || '<span class="empty-hint">请先在「算力集群」中配置并填写节点 ID</span>';
    };
    renderTo('sel-route-img', state.providers, 'route_img');
    renderTo('sel-route-selfie', state.providers, 'route_selfie');
    renderTo('sel-opt-chain', state.providers, 'opt_chain');
    renderTo('sel-route-video', state.video_providers, 'route_video');
}

function renderPersonaImages() {
    const container = document.getElementById('persona-upload-container');
    if(!container) return;
    container.querySelectorAll('.image-preview-wrapper').forEach(el => el.remove());
    const trigger = document.getElementById('persona-upload-trigger');
    (state.persona_config.persona_ref_image || []).forEach((url, idx) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'image-preview-wrapper';
        wrapper.style.position = 'relative';
        wrapper.innerHTML = `<img src="${url}" class="image-preview" /><button class="btn-del-img" data-action="del-persona-img" data-index="${idx}">×</button>`;
        container.insertBefore(wrapper, trigger);
    });
}

// 💡 重点：确保 render 函数里的 data-sync 与下面的监听器严格一致
function renderProviders() {
    const container = document.getElementById("providers-container");
    if(!container) return;
    container.innerHTML = state.providers.map((p, i) => `
        <div class="glass-card" style="padding: 24px; margin-bottom: 16px;">
            <div class="card-header" style="margin-bottom: 16px; border-bottom: 1px solid rgba(0,0,0,0.05); padding-bottom: 12px;">
                <input type="text" class="input-glass" style="width: 200px; font-weight:bold; background: transparent; border:none; border-bottom: 1px solid rgba(0,0,0,0.1);" placeholder="节点 ID" value="${p.id}" data-sync="prov-id" data-index="${i}">
                <button data-action="del-provider" data-index="${i}" style="background:transparent; border:none; color:var(--danger); font-weight:bold; cursor:pointer;">移除</button>
            </div>
            <div class="grid-2-col">
                <div class="form-group"><label>接口模式</label>
                    <div class="chip-group">
                        <div class="api-chip ${p.api_type==='openai_image'?'active':''}" data-sync="prov-api" data-index="${i}" data-val="openai_image">标准生图</div>
                        <div class="api-chip ${p.api_type==='openai_chat'?'active':''}" data-sync="prov-api" data-index="${i}" data-val="openai_chat">对话透传</div>
                    </div>
                </div>
                <div class="form-group"><label>接口地址</label><input type="text" class="input-glass" value="${p.base_url}" data-sync="prov-url" data-index="${i}"></div>
                <div class="form-group full-width">
                    <label>模型池 (点击设为默认)</label>
                    <div class="chip-group" style="margin-bottom: 8px;">
                        ${(p.available_models || []).map((m, mIdx) => `
                            <div class="api-chip ${p.model === m ? 'active' : ''}" data-sync="prov-model-select" data-index="${i}" data-val="${m}">
                                ${m} <span class="chip-del" data-action="del-prov-model" data-index="${i}" data-midx="${mIdx}">×</span>
                            </div>
                        `).join('')}
                    </div>
                    <div style="display:flex; gap:10px;">
                        <input type="text" class="input-glass" id="new-model-img-${i}" placeholder="模型名" style="flex:1;">
                        <button data-action="add-prov-model" data-index="${i}" class="btn-glass-secondary">添加</button>
                    </div>
                </div>
                <div class="form-group"><label>超时(秒)</label><input type="number" class="input-glass" value="${p.timeout}" data-sync="prov-time" data-index="${i}"></div>
                <div class="form-group full-width"><label>API Keys</label><textarea class="input-glass" rows="1" data-sync="prov-keys" data-index="${i}">${p.api_keys}</textarea></div>
            </div>
        </div>
    `).join('');
}

function renderVideoProviders() {
    const container = document.getElementById("video-providers-container");
    if(!container) return;
    container.innerHTML = state.video_providers.map((p, i) => `
        <div class="glass-card" style="padding: 24px; margin-bottom: 16px;">
            <div class="card-header" style="margin-bottom: 16px; border-bottom: 1px solid rgba(0,0,0,0.05); padding-bottom: 12px;">
                <input type="text" class="input-glass" style="width: 200px; font-weight:bold; background: transparent; border:none; border-bottom: 1px solid rgba(0,0,0,0.1);" placeholder="视频节点 ID" value="${p.id}" data-sync="vid-id" data-index="${i}">
                <button data-action="del-video-provider" data-index="${i}" style="background:transparent; border:none; color:var(--danger); font-weight:bold; cursor:pointer;">移除</button>
            </div>
            <div class="grid-2-col">
                <div class="form-group"><label>调用协议</label>
                    <div class="chip-group">
                        <div class="api-chip ${p.api_type.includes('async_task')?'active':''}" data-sync="vid-api" data-index="${i}" data-val="async_task">异步轮询</div>
                        <div class="api-chip ${p.api_type.includes('openai_sync')?'active':''}" data-sync="vid-api" data-index="${i}" data-val="openai_sync">同步阻塞</div>
                        <div class="api-chip ${p.api_type.includes('openai_chat')?'active':''}" data-sync="vid-api" data-index="${i}" data-val="openai_chat">对话伪装</div>
                    </div>
                </div>
                <div class="form-group"><label>接口地址</label><input type="text" class="input-glass" value="${p.base_url}" data-sync="vid-url" data-index="${i}"></div>
                <div class="form-group full-width">
                    <label>视频模型池</label>
                    <div class="chip-group" style="margin-bottom: 8px;">
                        ${(p.available_models || []).map((m, mIdx) => `
                            <div class="api-chip ${p.model === m ? 'active' : ''}" data-sync="vid-model-select" data-index="${i}" data-val="${m}">
                                ${m} <span class="chip-del" data-action="del-vid-model" data-index="${i}" data-midx="${mIdx}">×</span>
                            </div>
                        `).join('')}
                    </div>
                    <div style="display:flex; gap:10px;">
                        <input type="text" class="input-glass" id="new-model-vid-${i}" placeholder="模型名" style="flex:1;">
                        <button data-action="add-vid-model" data-index="${i}" class="btn-glass-secondary">添加</button>
                    </div>
                </div>
                <div class="form-group"><label>超时(秒)</label><input type="number" class="input-glass" value="${p.timeout}" data-sync="vid-time" data-index="${i}"></div>
                <div class="form-group full-width"><label>API Keys</label><textarea class="input-glass" rows="1" data-sync="vid-keys" data-index="${i}">${p.api_keys}</textarea></div>
            </div>
        </div>
    `).join('');
}

function renderPresets() {
    const container = document.getElementById("presets-container");
    if(!container) return;
    container.innerHTML = state.presets.map((p, i) => `
        <div class="list-item">
            <input type="text" class="input-glass" style="width: 140px; border:none; background:transparent; font-weight:bold;" placeholder="指令名" value="${p.name}" data-sync="preset-name" data-index="${i}">
            <span style="color:var(--text-muted);">→</span>
            <input type="text" class="input-glass" style="flex:1; border:none; background:transparent;" placeholder="描述" value="${p.prompt}" data-sync="preset-prompt" data-index="${i}">
            <button data-action="del-preset" data-index="${i}" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; font-size:18px;">×</button>
        </div>
    `).join('');
}

async function init() {
    const context = await bridge.ready();
    const raw = await bridge.apiGet("get_config") || {};
    
    const perm = raw.permission_config || {};
    const pers = raw.persona_config || {};
    const opt = raw.optimizer_config || {};
    const router = raw.router_config || {};

    state.permission_config.allowed_users = perm.allowed_users || "";
    state.persona_config.persona_name = pers.persona_name || "默认助理";
    state.persona_config.persona_base_prompt = pers.persona_base_prompt || "";
    state.persona_config.persona_ref_image = Array.isArray(pers.persona_ref_image) ? pers.persona_ref_image : [];
    
    state.optimizer_config.enable_optimizer = opt.enable_optimizer !== false;
    state.optimizer_config.optimizer_style = opt.optimizer_style || "手机日常原生感";
    state.optimizer_config.chain_optimizer = opt.chain_optimizer || "node_1";
    state.optimizer_config.optimizer_model = opt.optimizer_model || "gpt-4o-mini";
    state.optimizer_config.optimizer_timeout = opt.optimizer_timeout || 15;
    state.optimizer_config.max_batch_count = opt.max_batch_count || 0;
    state.optimizer_config.optimizer_custom_prompt = opt.optimizer_custom_prompt || "";

    state.router_config.chain_text2img = router.chain_text2img || "node_1";
    state.router_config.chain_selfie = router.chain_selfie || "node_1";
    state.router_config.chain_video = router.chain_video || "video_node_1";

    state.presets = (raw.presets || []).map(p => typeof p === 'string' ? { name: p.split(':')[0], prompt: p.split(':')[1] } : p);
    state.providers = (raw.providers || []).map(p => ({
        id: p.id || '', api_type: p.api_type || 'openai_image',
        base_url: p.base_url || '', model: p.model || '', available_models: p.available_models || [],
        timeout: p.timeout || 60, api_keys: Array.isArray(p.api_keys) ? p.api_keys.join('\n') : (p.api_keys || '')
    }));
    state.video_providers = (raw.video_providers || []).map(p => ({
        id: p.id || '', api_type: p.api_type || 'async_task',
        base_url: p.base_url || '', model: p.model || '', available_models: p.available_models || [],
        timeout: p.timeout || 300, api_keys: Array.isArray(p.api_keys) ? p.api_keys.join('\n') : (p.api_keys || '')
    }));
    state.verbose_report = raw.verbose_report || false;

    // 回显数据
    const elId = (id) => document.getElementById(id);
    if(elId("perm_allowed_users")) elId("perm_allowed_users").value = state.permission_config.allowed_users;
    if(elId("persona_name")) elId("persona_name").value = state.persona_config.persona_name;
    if(elId("persona_prompt")) elId("persona_prompt").value = state.persona_config.persona_base_prompt;
    if(elId("route_img")) elId("route_img").value = state.router_config.chain_text2img;
    if(elId("route_selfie")) elId("route_selfie").value = state.router_config.chain_selfie;
    if(elId("route_video")) elId("route_video").value = state.router_config.chain_video;
    if(elId("opt_enable")) elId("opt_enable").checked = state.optimizer_config.enable_optimizer;
    if(elId("opt_style")) elId("opt_style").value = state.optimizer_config.optimizer_style;
    if(elId("opt_chain")) elId("opt_chain").value = state.optimizer_config.chain_optimizer;
    if(elId("opt_model")) elId("opt_model").value = state.optimizer_config.optimizer_model;
    if(elId("opt_timeout")) elId("opt_timeout").value = state.optimizer_config.optimizer_timeout;
    if(elId("opt_batch")) elId("opt_batch").value = state.optimizer_config.max_batch_count;
    if(elId("opt_custom")) elId("opt_custom").value = state.optimizer_config.optimizer_custom_prompt;
    if(elId("verbose_report")) elId("verbose_report").checked = state.verbose_report;

    renderProviders();
    renderVideoProviders();
    renderPresets();
    renderPersonaImages();
    renderSelectors();
    setupEventDelegation();
}

function setupEventDelegation() {
    const fileInput = document.getElementById('hidden-file-input');
    
    document.body.addEventListener('click', (e) => {
        try {
            const navItem = e.target.closest('.nav-item');
            if (navItem) {
                document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                navItem.classList.add('active');
                document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                const target = document.getElementById(navItem.dataset.target);
                if(target) target.classList.add('active');
                return;
            }

            const chip = e.target.closest('.selector-chip');
            if (chip) {
                const inputId = chip.dataset.input;
                const hiddenInput = document.getElementById(inputId);
                if (hiddenInput) {
                    hiddenInput.value = chip.dataset.id;
                    document.querySelectorAll(`.selector-chip[data-input="${inputId}"]`).forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');
                }
                return;
            }

            const apiChip = e.target.closest('.api-chip');
            if (apiChip && !e.target.closest('.chip-del')) {
                const sync = apiChip.dataset.sync;
                const idx = parseInt(apiChip.dataset.index, 10);
                const val = apiChip.dataset.val;
                if (sync === 'prov-api') { state.providers[idx].api_type = val; renderProviders(); } 
                else if (sync === 'vid-api') { state.video_providers[idx].api_type = val; renderVideoProviders(); }
                else if (sync === 'prov-model-select') { state.providers[idx].model = val; renderProviders(); } 
                else if (sync === 'vid-model-select') { state.video_providers[idx].model = val; renderVideoProviders(); }
                return;
            }

            if (e.target.closest('#persona-upload-trigger') && fileInput) fileInput.click();

            const btn = e.target.closest('button[data-action], span[data-action]');
            if (!btn) return;
            const act = btn.getAttribute('data-action');
            const idx = parseInt(btn.getAttribute('data-index'), 10);

            if (act === 'save-config') saveConfig(btn);
            if (act === 'add-preset') { state.presets.push({name:"", prompt:""}); renderPresets(); }
            if (act === 'del-preset') { state.presets.splice(idx, 1); renderPresets(); }
            if (act === 'add-provider') { state.providers.push({id:`node_${state.providers.length+1}`, api_type:"openai_image", base_url:"", model:"", available_models:[], api_keys:"", timeout:60}); renderProviders(); renderSelectors(); }
            if (act === 'del-provider') { state.providers.splice(idx, 1); renderProviders(); renderSelectors(); }
            if (act === 'add-video-provider') { state.video_providers.push({id:`v_node_${state.video_providers.length+1}`, api_type:"async_task", base_url:"", model:"", available_models:[], api_keys:"", timeout:300}); renderVideoProviders(); renderSelectors(); }
            if (act === 'del-video-provider') { state.video_providers.splice(idx, 1); renderVideoProviders(); renderSelectors(); }
            if (act === 'del-persona-img') { state.persona_config.persona_ref_image.splice(idx, 1); renderPersonaImages(); }

            if (act === 'add-prov-model') {
                const input = document.getElementById(`new-model-img-${idx}`);
                const newM = input.value.trim();
                if(newM) { state.providers[idx].available_models.push(newM); if(!state.providers[idx].model) state.providers[idx].model = newM; renderProviders(); }
            }
            if (act === 'add-vid-model') {
                const input = document.getElementById(`new-model-vid-${idx}`);
                const newM = input.value.trim();
                if(newM) { state.video_providers[idx].available_models.push(newM); if(!state.video_providers[idx].model) state.video_providers[idx].model = newM; renderVideoProviders(); }
            }
            if (act === 'del-prov-model') { e.stopPropagation(); const midx = parseInt(btn.dataset.midx, 10); state.providers[idx].available_models.splice(midx, 1); renderProviders(); }
            if (act === 'del-vid-model') { e.stopPropagation(); const midx = parseInt(btn.dataset.midx, 10); state.video_providers[idx].available_models.splice(midx, 1); renderVideoProviders(); }
        } catch(err) { console.error(err); }
    });

    if(fileInput) {
        fileInput.addEventListener('change', function(e) {
            Array.from(e.target.files).forEach(file => {
                const reader = new FileReader();
                reader.onload = (evt) => { state.persona_config.persona_ref_image.push(evt.target.result); renderPersonaImages(); };
                reader.readAsDataURL(file);
            });
            fileInput.value = '';
        });
    }

    // 💡 修复重点：监听 data-sync 实时更新内存 state，确保保存时节点 ID/URL 不丢失
    document.body.addEventListener('input', (e) => {
        const input = e.target;
        const s = input.dataset.sync;
        const i = parseInt(input.dataset.index, 10);
        if (!s) return;
        const v = input.value;
        if (s === 'preset-name') state.presets[i].name = v;
        if (s === 'preset-prompt') state.presets[i].prompt = v;
        if (s === 'prov-id') { state.providers[i].id = v; renderSelectors(); } // 节点 ID 变化实时更新调度选择器
        if (s === 'prov-url') state.providers[i].base_url = v;
        if (s === 'prov-time') state.providers[i].timeout = v;
        if (s === 'prov-keys') state.providers[i].api_keys = v;
        if (s === 'vid-id') { state.video_providers[i].id = v; renderSelectors(); }
        if (s === 'vid-url') state.video_providers[i].base_url = v;
        if (s === 'vid-time') state.video_providers[i].timeout = v;
        if (s === 'vid-keys') state.video_providers[i].api_keys = v;
    });
}

async function saveConfig(btn) {
    btn.disabled = true;
    const oldText = btn.innerText;
    btn.innerText = "部署中...";
    
    try {
        const elVal = (id) => document.getElementById(id) ? document.getElementById(id).value : "";
        const elCheck = (id) => document.getElementById(id) ? document.getElementById(id).checked : false;

        state.permission_config.allowed_users = elVal("perm_allowed_users");
        state.persona_config.persona_name = elVal("persona_name");
        state.persona_config.persona_base_prompt = elVal("persona_prompt");
        state.optimizer_config.enable_optimizer = elCheck("opt_enable");
        state.optimizer_config.optimizer_style = elVal("opt_style");
        state.optimizer_config.chain_optimizer = elVal("opt_chain");
        state.optimizer_config.optimizer_model = elVal("opt_model");
        state.optimizer_config.optimizer_timeout = parseFloat(elVal("opt_timeout")) || 15;
        state.optimizer_config.max_batch_count = parseInt(elVal("opt_batch")) || 0;
        state.optimizer_config.optimizer_custom_prompt = elVal("opt_custom");
        state.verbose_report = elCheck("verbose_report");

        // 整理调度指向
        state.router_config.chain_text2img = elVal("route_img");
        state.router_config.chain_selfie = elVal("route_selfie");
        state.router_config.chain_video = elVal("route_video");

        const payload = {
            ...state,
            presets: state.presets.filter(p=>p.name).map(p=>`${p.name}:${p.prompt}`)
        };

        const res = await bridge.apiPost("save_config", payload);
        if (res.success) showToast("部署成功！");
        else showToast("保存失败", "error");
    } catch(e) { showToast("脚本错误", "error"); }
    btn.disabled = false;
    btn.innerText = oldText;
}
init();
