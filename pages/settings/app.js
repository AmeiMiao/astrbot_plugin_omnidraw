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
        wrapper.innerHTML = `<img src="${url}" class="image-preview" /><button class="btn-del-img" data-action="del-persona-img" data-index="${idx}">×</button>`;
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

function setupEventDelegation() {
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

    document.body.addEventListener('input', (e) => {
        const input = e.target;
        if (!input.hasAttribute('data-sync')) return;
        const s = input.getAttribute('data-sync');
        const i = parseInt(input.getAttribute('data-index'), 10);
        const v = input.value;
        
        // 👇 核心修复：对齐 data-sync 标识符
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
        if (input.getAttribute('data-sync') === 'prov-id' || input.getAttribute('data-sync') === 'vid-id') renderSelectors();
    });
}

async function saveConfig(btn) {
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = `<span class="spinner">↻</span> 部署中...`;
    readBasicFields();
    try {
        const res = await bridge.apiPost("save_config", { ...state, presets: state.presets.filter(p=>p.name).map(p=>`${p.name}:${p.prompt}`) });
        if (res.success) showToast("部署成功！");
        else showToast("部署异常", "error");
    } catch(e) { showToast("网络错误", "error"); }
    setTimeout(() => { btn.disabled = false; btn.innerHTML = originalText; }, 800);
}

init();
