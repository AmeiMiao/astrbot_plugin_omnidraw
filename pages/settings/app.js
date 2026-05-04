const bridge = window.AstrBotPluginPage;

let state = {
    permission_config: {}, persona_config: { persona_ref_image: [] }, optimizer_config: {}, router_config: {},
    presets: [], providers: [], video_providers: [], verbose_report: false
};

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerText = message;
    if(container) container.appendChild(toast);
    setTimeout(() => toast.remove(), 2800);
}

function renderSelectors() {
    const renderTo = (containerId, sourceList, inputId) => {
        const container = document.getElementById(containerId);
        const hiddenInput = document.getElementById(inputId);
        if(!container || !hiddenInput) return;
        const currentVal = hiddenInput.value;
        container.innerHTML = sourceList.map(node => {
            const nodeId = node.id;
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
    (state.persona_config.persona_ref_image || []).forEach((url, idx) => {
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
                <div class="form-group"><label>接口地址 (需含/v1)</label><input type="text" class="input-glass" value="${p.base_url}" data-sync="prov-url" data-index="${i}"></div>
                <div class="form-group full-width">
                    <label>算力模型池</label>
                    <div class="chip-group" style="margin-bottom: 8px;">
                        ${(p.available_models || []).map((m, mIdx) => `
                            <div class="api-chip ${p.model === m ? 'active' : ''}" data-sync="prov-model-select" data-index="${i}" data-val="${m}">
                                ${m} <span class="chip-del" data-action="del-prov-model" data-index="${i}" data-midx="${mIdx}">×</span>
                            </div>
                        `).join('')}
                    </div>
                    <div style="display:flex; gap:10px;">
                        <input type="text" class="input-glass" id="new-model-img-${i}" placeholder="添加模型名称" style="flex:1;">
                        <button data-action="add-prov-model" data-index="${i}" class="btn-glass-secondary">添加模型</button>
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
                        <div class="api-chip ${p.api_type==='async_task'?'active':''}" data-sync="vid-api" data-index="${i}" data-val="async_task">异步轮询</div>
                        <div class="api-chip ${p.api_type==='openai_sync'?'active':''}" data-sync="vid-api" data-index="${i}" data-val="openai_sync">同步阻塞</div>
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
                        <input type="text" class="input-glass" id="new-model-vid-${i}" placeholder="输入视频模型名称" style="flex:1;">
                        <button data-action="add-vid-model" data-index="${i}" class="btn-glass-secondary">添加模型</button>
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
            <input type="text" class="input-glass" style="width: 140px; border:none; background:transparent; font-weight:bold;" placeholder="指令名" value="${p.name}" data-sync="p-n" data-index="${i}">
            <span style="color:var(--text-muted);">→</span>
            <input type="text" class="input-glass" style="flex:1; border:none; background:transparent;" placeholder="描述" value="${p.prompt}" data-sync="p-p" data-index="${i}">
            <button data-action="del-preset" data-index="${i}" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; font-size:18px;">×</button>
        </div>
    `).join('');
}

async function init() {
    const context = await bridge.ready();
    const rawConfig = await bridge.apiGet("get_config") || {};
    
    const perm = rawConfig.permission_config || {};
    const pers = rawConfig.persona_config || {};
    const opt = rawConfig.optimizer_config || {};
    const router = rawConfig.router_config || {};

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

    state.router_config.chain_text2img = router.chain_text2img || "node_1";
    state.router_config.chain_selfie = router.chain_selfie || "node_1";
    state.router_config.chain_video = router.chain_video || "video_node_1";

    state.presets = (rawConfig.presets || []).map(p => typeof p === 'string' ? { name: p.split(':')[0], prompt: p.split(':')[1] } : p);
    
    const parseList = (list) => (list || []).map(p => {
        let avail = p.available_models || [];
        if(avail.length === 0) {
            const mRaw = p.model || '';
            avail = mRaw.split(',').map(s=>s.trim()).filter(Boolean);
        }
        return {
            id: p.id || '', api_type: p.api_type || '', base_url: p.base_url || '',
            model: p.model || (avail[0] || ""), available_models: avail,
            timeout: p.timeout || 60, api_keys: Array.isArray(p.api_keys) ? p.api_keys.join('\n') : (p.api_keys || '')
        };
    });
    state.providers = parseList(rawConfig.providers);
    state.video_providers = parseList(rawConfig.video_providers);
    state.verbose_report = rawConfig.verbose_report || false;

    document.getElementById("perm_allowed_users").value = state.permission_config.allowed_users;
    document.getElementById("persona_name").value = state.persona_config.persona_name;
    document.getElementById("persona_prompt").value = state.persona_config.persona_base_prompt;
    document.getElementById("route_img").value = state.router_config.chain_text2img;
    document.getElementById("route_selfie").value = state.router_config.chain_selfie;
    document.getElementById("route_video").value = state.router_config.chain_video;
    document.getElementById("opt_enable").checked = state.optimizer_config.enable_optimizer;
    document.getElementById("opt_style").value = state.optimizer_config.optimizer_style;
    document.getElementById("opt_chain").value = state.optimizer_config.chain_optimizer;
    document.getElementById("opt_model").value = state.optimizer_config.optimizer_model;
    document.getElementById("opt_timeout").value = state.optimizer_config.optimizer_timeout;
    document.getElementById("opt_batch").value = state.optimizer_config.max_batch_count;
    document.getElementById("verbose_report").checked = state.verbose_report;

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
        const navItem = e.target.closest('.nav-item');
        if (navItem) {
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            navItem.classList.add('active');
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            document.getElementById(navItem.dataset.target).classList.add('active');
            return;
        }

        const chip = e.target.closest('.selector-chip');
        if (chip) {
            const inputId = chip.dataset.input;
            document.getElementById(inputId).value = chip.dataset.id;
            document.querySelectorAll(`.selector-chip[data-input="${inputId}"]`).forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
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

        if (e.target.closest('#persona-upload-trigger')) fileInput.click();

        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const act = btn.getAttribute('data-action');
        const idx = parseInt(btn.getAttribute('data-index'), 10);

        if (act === 'save-config') saveConfig(btn);
        if (act === 'add-preset') { state.presets.push({name:"", prompt:""}); renderPresets(); }
        if (act === 'del-preset') { state.presets.splice(idx, 1); renderPresets(); }
        if (act === 'add-provider') { state.providers.push({id:`node_${state.providers.length+1}`, api_type:"openai_image", base_url:"", model:"", available_models:[], api_keys:"", timeout:60}); renderProviders(); renderSelectors(); }
        if (act === 'del-provider') { 
            const el = document.getElementById('providers-container').children[idx];
            el.classList.add('node-exit');
            setTimeout(() => { state.providers.splice(idx, 1); renderProviders(); renderSelectors(); }, 300);
        }
        if (act === 'add-video-provider') { state.video_providers.push({id:`v_node_${state.video_providers.length+1}`, api_type:"async_task", base_url:"", model:"", available_models:[], api_keys:"", timeout:300}); renderVideoProviders(); renderSelectors(); }
        if (act === 'del-video-provider') {
            const el = document.getElementById('video-providers-container').children[idx];
            el.classList.add('node-exit');
            setTimeout(() => { state.video_providers.splice(idx, 1); renderVideoProviders(); renderSelectors(); }, 300);
        }

        if (act === 'add-prov-model') {
            const val = document.getElementById(`new-model-img-${idx}`).value.trim();
            if(val) { state.providers[idx].available_models.push(val); if(!state.providers[idx].model) state.providers[idx].model = val; renderProviders(); }
        }
        if (act === 'add-vid-model') {
            const val = document.getElementById(`new-model-vid-${idx}`).value.trim();
            if(val) { state.video_providers[idx].available_models.push(val); if(!state.video_providers[idx].model) state.video_providers[idx].model = val; renderVideoProviders(); }
        }
        if (act === 'del-prov-model') { e.stopPropagation(); state.providers[idx].available_models.splice(parseInt(btn.dataset.midx, 10), 1); renderProviders(); }
        if (act === 'del-vid-model') { e.stopPropagation(); state.video_providers[idx].available_models.splice(parseInt(btn.dataset.midx, 10), 1); renderVideoProviders(); }
        if (act === 'del-persona-img') { state.persona_config.persona_ref_image.splice(idx, 1); renderPersonaImages(); }
    });

    fileInput.addEventListener('change', function(e) {
        Array.from(e.target.files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (evt) => { state.persona_config.persona_ref_image.push(evt.target.result); renderPersonaImages(); };
            reader.readAsDataURL(file);
        });
        fileInput.value = '';
    });

    // 🌟 修复重点：标识符必须和渲染函数中的 data-sync 完全一致！
    document.body.addEventListener('input', (e) => {
        const input = e.target;
        const s = input.dataset.sync;
        const i = parseInt(input.dataset.index, 10);
        if (!s) return;
        const v = input.value;
        if (s === 'p-n') state.presets[i].name = v;
        if (s === 'p-p') state.presets[i].prompt = v;
        // 👇 这里对齐了 prov- 和 vid- 前缀
        if (s === 'prov-id') { state.providers[i].id = v; renderSelectors(); }
        if (s === 'prov-url') state.providers[i].base_url = v;
        if (s === 'prov-time') state.providers[i].timeout = v;
        if (s === 'prov-keys') state.providers[i].api_keys = v;
        if (s === 'vid-id') { state.video_providers[i].id = v; renderSelectors(); }
        if (s === 'vid-url') state.video_providers[i].base_url = v;
        if (s === 'vid-time') state.video_providers[i].timeout = v;
        if (s === 'vid-keys') state.video_providers[i].api_keys = v;
    });
}

function readBasicFields() {
    const val = (id) => document.getElementById(id).value;
    state.permission_config.allowed_users = val("perm_allowed_users");
    state.persona_config.persona_name = val("persona_name");
    state.persona_config.persona_base_prompt = val("persona_prompt");
    state.optimizer_config.enable_optimizer = document.getElementById("opt_enable").checked;
    state.optimizer_config.optimizer_style = val("opt_style");
    state.optimizer_config.chain_optimizer = document.getElementById("opt_chain").value;
    state.optimizer_config.optimizer_model = val("opt_model");
    state.optimizer_config.optimizer_timeout = parseFloat(val("opt_timeout"));
    state.optimizer_config.max_batch_count = parseInt(val("opt_batch"));
    state.verbose_report = document.getElementById("verbose_report").checked;
    state.router_config.chain_text2img = val("route_img");
    state.router_config.chain_selfie = val("route_selfie");
    state.router_config.chain_video = val("route_video");
}

async function saveConfig(btn) {
    btn.disabled = true;
    const oldText = btn.innerHTML;
    btn.innerHTML = `<span class="spinner">↻</span> 部署中...`;
    
    try {
        readBasicFields();
        const payload = { ...state, presets: state.presets.filter(p=>p.name).map(p=>`${p.name}:${p.prompt}`) };
        const res = await bridge.apiPost("save_config", payload);
        if (res.success) showToast("部署成功！");
        else showToast("部署异常", "error");
    } catch(e) { showToast("脚本错误", "error"); }
    btn.disabled = false;
    btn.innerHTML = oldText;
}
init();
