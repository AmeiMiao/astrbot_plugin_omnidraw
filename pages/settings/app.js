const bridge = window.AstrBotPluginPage;

let state = {
    permission_config: {}, persona_config: { persona_ref_image: [] }, optimizer_config: {}, router_config: {},
    presets: [], providers: [], video_providers: [], verbose_report: false
};

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if(!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${type === 'success' ? '✓' : '✕'}</span> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 2800);
}

function renderSelectors() {
    const renderTo = (containerId, sourceList, inputId) => {
        const container = document.getElementById(containerId);
        const hiddenInput = document.getElementById(inputId);
        if(!container || !hiddenInput) return;
        const currentVal = hiddenInput.value;
        container.innerHTML = sourceList.map(node => {
            const nodeId = node.id || node['节点ID'];
            if(!nodeId) return '';
            return `<div class="selector-chip ${nodeId === currentVal ? 'active' : ''}" data-id="${nodeId}" data-input="${inputId}">${nodeId}</div>`;
        }).join('') || '<span class="empty-hint">请先在「算力集群」中配置节点 ID</span>';
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
    const images = state.persona_config.persona_ref_image || [];
    images.forEach((url, idx) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'image-preview-wrapper';
        wrapper.style.position = 'relative';
        wrapper.innerHTML = `<img src="${url}" class="image-preview" /><button class="btn-del-img" data-action="del-persona-img" data-index="${idx}">×</button>`;
        container.insertBefore(wrapper, trigger);
    });
}

function renderProviders() {
    const container = document.getElementById("providers-container");
    if(!container) return;
    container.innerHTML = state.providers.map((p, i) => `
        <div class="glass-card" style="padding: 24px; margin-bottom: 16px;">
            <div class="card-header" style="margin-bottom: 16px; border-bottom: 1px solid rgba(0,0,0,0.05); padding-bottom: 12px;">
                <input type="text" class="input-minimal" value="${p.id}" data-sync="prov-id" data-index="${i}" placeholder="输入节点 ID">
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
}

function renderVideoProviders() {
    const container = document.getElementById("video-providers-container");
    if(!container) return;
    container.innerHTML = state.video_providers.map((p, i) => `
        <div class="glass-card" style="padding: 24px; margin-bottom: 16px;">
            <div class="card-header" style="margin-bottom: 16px; border-bottom: 1px solid rgba(0,0,0,0.05); padding-bottom: 12px;">
                <input type="text" class="input-minimal" value="${p.id}" data-sync="vid-id" data-index="${i}" placeholder="视频节点 ID">
                <button data-action="del-video-provider" data-index="${i}" style="background:transparent; border:none; color:var(--danger); font-weight:bold; cursor:pointer;">移除</button>
            </div>
            <div class="grid-2-col">
                <div class="form-group"><label>调用协议</label><select class="input-glass" data-sync="vid-api" data-index="${i}"><option value="async_task" ${p.api_type==='async_task'?'selected':''}>异步轮询</option><option value="openai_sync" ${p.api_type==='openai_sync'?'selected':''}>同步阻塞</option></select></div>
                <div class="form-group"><label>接口地址</label><input type="text" class="input-glass" value="${p.base_url}" data-sync="vid-url" data-index="${i}"></div>
                <div class="form-group"><label>模型名称</label><input type="text" class="input-glass" value="${p.model}" data-sync="vid-model" data-index="${i}"></div>
                <div class="form-group"><label>请求超时</label><input type="number" class="input-glass" value="${p.timeout}" data-sync="vid-time" data-index="${i}"></div>
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
            <input type="text" class="input-minimal" style="width: 140px;" placeholder="指令名" value="${p.name}" data-sync="preset-name" data-index="${i}">
            <span style="color:var(--text-muted); font-weight: bold;">→</span>
            <input type="text" class="input-minimal" style="flex:1;" placeholder="参数" value="${p.prompt}" data-sync="preset-prompt" data-index="${i}">
            <button data-action="del-preset" data-index="${i}" style="background:transparent; border:none; cursor:pointer;">×</button>
        </div>
    `).join('');
}

async function init() {
    const context = await bridge.ready();
    const raw = await bridge.apiGet("get_config") || {};
    
    // 初始化 state，防止 Null 报错
    const perm = raw.permission_config || {};
    const pers = raw.persona_config || {};
    const opt = raw.optimizer_config || {};
    const route = raw.router_config || {};

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
    state.router_config.chain_text2img = route.chain_text2img || "node_1";
    state.router_config.chain_selfie = route.chain_selfie || "node_1";
    state.router_config.chain_video = route.chain_video || "video_node_1";
    state.verbose_report = raw.verbose_report || false;

    state.presets = (raw.presets || []).map(p => typeof p === 'string' ? { name: p.split(':')[0], prompt: p.split(':')[1] } : p);
    state.providers = (raw.providers || []).map(p => ({
        id: p.id || '', api_type: p.api_type || 'openai_image', base_url: p.base_url || '',
        model: p.model || '', timeout: p.timeout || 60, api_keys: Array.isArray(p.api_keys) ? p.api_keys.join('\n') : (p.api_keys || '')
    }));
    state.video_providers = (raw.video_providers || []).map(p => ({
        id: p.id || '', api_type: p.api_type || 'async_task', base_url: p.base_url || '',
        model: p.model || '', timeout: p.timeout || 300, api_keys: Array.isArray(p.api_keys) ? p.api_keys.join('\n') : (p.api_keys || '')
    }));

    // 安全回显 (Null 保护)
    const el = (id) => document.getElementById(id);
    if(el("perm_allowed_users")) el("perm_allowed_users").value = state.permission_config.allowed_users;
    if(el("persona_name")) el("persona_name").value = state.persona_config.persona_name;
    if(el("persona_prompt")) el("persona_prompt").value = state.persona_config.persona_base_prompt;
    if(el("route_img")) el("route_img").value = state.router_config.chain_text2img;
    if(el("route_selfie")) el("route_selfie").value = state.router_config.chain_selfie;
    if(el("route_video")) el("route_video").value = state.router_config.chain_video;
    if(el("opt_enable")) el("opt_enable").checked = state.optimizer_config.enable_optimizer;
    if(el("opt_style")) el("opt_style").value = state.optimizer_config.optimizer_style;
    if(el("opt_chain")) el("opt_chain").value = state.optimizer_config.chain_optimizer;
    if(el("opt_model")) el("opt_model").value = state.optimizer_config.optimizer_model;
    if(el("opt_timeout")) el("opt_timeout").value = state.optimizer_config.optimizer_timeout;
    if(el("opt_batch")) el("opt_batch").value = state.optimizer_config.max_batch_count;
    if(el("opt_custom")) el("opt_custom").value = state.optimizer_config.optimizer_custom_prompt;
    if(el("verbose_report")) el("verbose_report").checked = state.verbose_report;

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

    // 💡 修复重点：标识符映射对齐
    document.body.addEventListener('input', (e) => {
        const input = e.target;
        const s = input.dataset.sync;
        const i = parseInt(input.dataset.index, 10);
        if (!s) return;
        const v = input.value;
        if (s === 'preset-name') state.presets[i].name = v;
        if (s === 'preset-prompt') state.presets[i].prompt = v;
        if (s === 'prov-id') { state.providers[i].id = v; renderSelectors(); }
        if (s === 'prov-api') state.providers[i].api_type = v;
        if (s === 'prov-url') state.providers[i].base_url = v;
        if (s === 'prov-model') state.providers[i].model = v;
        if (s === 'prov-time') state.providers[i].timeout = v;
        if (s === 'prov-keys') state.providers[i].api_keys = v;
        if (s === 'vid-id') { state.video_providers[i].id = v; renderSelectors(); }
        if (s === 'vid-api') state.video_providers[i].api_type = v;
        if (s === 'vid-url') state.video_providers[i].base_url = v;
        if (s === 'vid-model') state.video_providers[i].model = v;
        if (s === 'vid-time') state.video_providers[i].timeout = v;
        if (s === 'vid-keys') state.video_providers[i].api_keys = v;
    });
}

async function saveConfig(btn) {
    btn.disabled = true;
    const oldText = btn.innerHTML;
    btn.innerHTML = `部署中...`;
    
    try {
        const val = (id) => document.getElementById(id) ? document.getElementById(id).value : "";
        const check = (id) => document.getElementById(id) ? document.getElementById(id).checked : false;

        state.permission_config.allowed_users = val("perm_allowed_users");
        state.persona_config.persona_name = val("persona_name");
        state.persona_config.persona_base_prompt = val("persona_prompt");
        state.optimizer_config.enable_optimizer = check("opt_enable");
        state.optimizer_config.optimizer_style = val("opt_style");
        state.optimizer_config.chain_optimizer = val("opt_chain");
        state.optimizer_config.optimizer_model = val("opt_model");
        state.optimizer_config.optimizer_timeout = parseFloat(val("opt_timeout")) || 15;
        state.optimizer_config.max_batch_count = parseInt(val("opt_batch")) || 0;
        state.optimizer_config.optimizer_custom_prompt = val("opt_custom");
        state.verbose_report = check("verbose_report");

        state.router_config.chain_text2img = val("route_img");
        state.router_config.chain_selfie = val("route_selfie");
        state.router_config.chain_video = val("route_video");

        const payload = {
            ...state,
            presets: state.presets.filter(p=>p.name).map(p=>`${p.name}:${p.prompt}`)
        };

        const res = await bridge.apiPost("save_config", payload);
        if (res.success) showToast("部署成功！");
        else showToast("保存异常", "error");
    } catch(e) { showToast("脚本错误", "error"); }
    btn.disabled = false;
    btn.innerHTML = oldText;
}
init();
