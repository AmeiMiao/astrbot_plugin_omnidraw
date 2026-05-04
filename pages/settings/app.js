const bridge = window.AstrBotPluginPage;

let state = {
    permission_config: {}, persona_config: { persona_ref_image: [] }, optimizer_config: {}, router_config: {},
    presets: [], providers: [], video_providers: [], verbose_report: false // 💡 新增状态
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
    
    let rawImage = deepFind(pers, ["persona_ref_image"]);
    if (typeof rawImage === 'string' && rawImage.trim() !== '') state.persona_config.persona_ref_image = [rawImage];
    else if (Array.isArray(rawImage)) state.persona_config.persona_ref_image = rawImage;
    else state.persona_config.persona_ref_image = [];

    state.optimizer_config.enable_optimizer = deepFind(opt, ["enable_optimizer"], true);
    state.optimizer_config.optimizer_style = deepFind(opt, ["optimizer_style"], "手机日常原生感");
    state.optimizer_config.chain_optimizer = deepFind(opt, ["chain_optimizer"], "node_1");
    state.optimizer_config.optimizer_model = deepFind(opt, ["optimizer_model"], "gpt-4o-mini");
    state.optimizer_config.optimizer_timeout = parseFloat(deepFind(opt, ["optimizer_timeout"], 15));
    state.optimizer_config.max_batch_count = parseInt(deepFind(opt, ["max_batch_count"], 0));
    state.optimizer_config.optimizer_custom_prompt = deepFind(opt, ["optimizer_custom_prompt"]);

    state.presets = (rawConfig.presets || []).map(p => typeof p === 'string' ? { name: p.split(':')[0], prompt: p.split(':')[1] } : p);
    state.providers = (rawConfig.providers || []).map(p => ({
        id: p.id || p['节点ID'] || '', api_type: p.api_type || p['接口模式'] || 'openai_image',
        base_url: p.base_url || p['接口地址 (需含/v1)'] || '', model: p.model || p['模型名称'] || '',
        timeout: p.timeout || p['超时时间(秒)'] || 60, api_keys: Array.isArray(p.api_keys) ? p.api_keys.join('\n') : (p.api_keys || p['API密钥'] || '')
    }));
    state.video_providers = (rawConfig.video_providers || []).map(p => ({
        id: p.id || p['节点ID'] || '', api_type: p.api_type || p['接口模式'] || 'async_task',
        base_url: p.base_url || p['接口地址 (需含/v1或/v2)'] || p['接口地址 (需含/v1)'] || '',
        model: p.model || p['模型名称'] || '', timeout: p.timeout || p['超时时间(秒)'] || 300,
        api_keys: Array.isArray(p.api_keys) ? p.api_keys.join('\n') : (p.api_keys || p['API密钥'] || '')
    }));

    // 💡 提取 Verbose 开关状态
    state.verbose_report = rawConfig.verbose_report || false;

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
    document.getElementById("verbose_report").checked = state.verbose_report; // 💡 绑定 UI
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
    state.verbose_report = document.getElementById("verbose_report").checked; // 💡 读取 UI
}

function renderPresets() {
    const html = state.presets.map((p, i) => `
        <div class="list-item">
            <input type="text" class="input-modern preset-name" style="width: 140px; border:none; background:transparent;" placeholder="快捷指令名" value="${p.name}" data-sync="preset-name" data-index="${i}">
            <span style="color:var(--text-muted); font-weight: bold; margin: 0 10px;">→</span>
            <input type="text" class="input-modern preset-prompt" style="flex:1; border:none; background:transparent;" placeholder="底层的英文描述与参数" value="${p.prompt}" data-sync="preset-prompt" data-index="${i}">
            <button data-action="del-preset" data-index="${i}" class="btn-text-danger" style="padding: 4px; font-size:16px;">×</button>
        </div>
    `).join('');
    document.getElementById("presets-container").innerHTML = html || '<div class="empty-tip">尚未配置快捷指令</div>';
}

function renderProviders() {
    const html = state.providers.map((p, i) => `
        <div class="list-card">
            <div class="list-card-header">
                <input type="text" class="input-minimal" placeholder="输入节点 ID" value="${p.id}" data-sync="prov-id" data-index="${i}">
                <button data-action="del-provider" data-index="${i}" class="btn-text-danger">移除</button>
            </div>
            <div class="grid-2-col">
                <div class="form-group"><label>接口模式</label>
                    <div class="chip-group">
                        <div class="api-chip ${p.api_type==='openai_image'?'active':''}" data-sync="prov-api" data-index="${i}" data-val="openai_image">openai_image</div>
                        <div class="api-chip ${p.api_type==='openai_chat'?'active':''}" data-sync="prov-api" data-index="${i}" data-val="openai_chat">openai_chat</div>
                    </div>
                </div>
                <div class="form-group"><label>接口地址 (需含/v1)</label><input type="text" class="input-modern" value="${p.base_url}" data-sync="prov-url" data-index="${i}"></div>
                <div class="form-group"><label>模型名称</label><input type="text" class="input-modern" value="${p.model}" data-sync="prov-model" data-index="${i}"></div>
                <div class="form-group"><label>请求超时</label><input type="number" class="input-modern" value="${p.timeout}" data-sync="prov-time" data-index="${i}"></div>
                <div class="form-group full-width"><label>API Keys</label><textarea class="input-modern" rows="1" data-sync="prov-keys" data-index="${i}">${p.api_keys}</textarea></div>
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
                <button data-action="del-video-provider" data-index="${i}" class="btn-text-danger">移除</button>
            </div>
            <div class="grid-2-col">
                <div class="form-group"><label>调用协议</label>
                    <div class="chip-group">
                        <div class="api-chip ${(p.api_type||'').includes('async_task')?'active':''}" data-sync="vid-api" data-index="${i}" data-val="async_task">异步轮询 (推荐)</div>
                        <div class="api-chip ${(p.api_type||'').includes('openai_sync')?'active':''}" data-sync="vid-api" data-index="${i}" data-val="openai_sync">同步阻塞返回</div>
                        <div class="api-chip ${(p.api_type||'').includes('openai_chat')?'active':''}" data-sync="vid-api" data-index="${i}" data-val="openai_chat">对话接口伪装</div>
                    </div>
                </div>
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
    const fileInput = document.getElementById('hidden-file-input');
    
    const animateAdd = (containerId) => {
        setTimeout(() => {
            const container = document.getElementById(containerId);
            const el = container.lastElementChild;
            if(el) {
                el.classList.add('node-enter');
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 10);
    };

    const animateDel = (containerId, stateArray, index, renderFn, callback) => {
        const container = document.getElementById(containerId);
        const el = container.children[index];
        if (el) {
            el.classList.add('node-exit');
            setTimeout(() => {
                stateArray.splice(index, 1);
                renderFn();
                if(callback) callback();
            }, 300);
        }
    };

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

        const apiChip = e.target.closest('.api-chip');
        if (apiChip) {
            const sync = apiChip.getAttribute('data-sync');
            const idx = parseInt(apiChip.getAttribute('data-index'), 10);
            const val = apiChip.getAttribute('data-val');
            
            if (sync === 'prov-api') {
                state.providers[idx].api_type = val;
                renderProviders();
            } else if (sync === 'vid-api') {
                state.video_providers[idx].api_type = val;
                renderVideoProviders();
            }
            return;
        }

        if (e.target.closest('#persona-upload-trigger')) {
            fileInput.click();
        }

        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const act = btn.getAttribute('data-action');
        const idx = parseInt(btn.getAttribute('data-index'), 10);

        if (act === 'save-config') saveConfig(btn);
        
        if (act === 'add-preset') { 
            state.presets.push({name:"", prompt:""}); 
            renderPresets(); animateAdd('presets-container'); 
        }
        if (act === 'del-preset') { 
            animateDel('presets-container', state.presets, idx, renderPresets); 
        }
        
        if (act === 'add-provider') { 
            state.providers.push({id:`node_${state.providers.length+1}`, api_type:"openai_image", base_url:"", model:"", api_keys:"", timeout:60}); 
            renderProviders(); renderSelectors(); animateAdd('providers-container'); 
        }
        if (act === 'del-provider') { 
            animateDel('providers-container', state.providers, idx, renderProviders, renderSelectors); 
        }
        
        if (act === 'add-video-provider') { 
            state.video_providers.push({id:`v_node_${state.video_providers.length+1}`, api_type:"async_task", base_url:"", model:"", api_keys:"", timeout:300}); 
            renderVideoProviders(); renderSelectors(); animateAdd('video-providers-container'); 
        }
        if (act === 'del-video-provider') { 
            animateDel('video-providers-container', state.video_providers, idx, renderVideoProviders, renderSelectors); 
        }
        
        if (act === 'del-persona-img') {
            animateDel('persona-upload-container', state.persona_config.persona_ref_image, idx, renderPersonaImages);
        }
    });

    fileInput.addEventListener('change', function(e) {
        const files = Array.from(e.target.files);
        if (!files.length) return;
        let loadedCount = 0;
        if (!state.persona_config.persona_ref_image) state.persona_config.persona_ref_image = [];
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = function(evt) {
                state.persona_config.persona_ref_image.push(evt.target.result);
                loadedCount++;
                if (loadedCount === files.length) {
                    renderPersonaImages();
                    showToast(`成功提取 ${files.length} 张图片`);
                }
            };
            reader.readAsDataURL(file);
        });
        fileInput.value = '';
    });

    document.body.addEventListener('input', (e) => {
        const input = e.target;
        if (!input.hasAttribute('data-sync')) return;
        const s = input.getAttribute('data-sync');
        const i = parseInt(input.getAttribute('data-index'), 10);
        const v = input.value;
        if (s === 'p-n') state.presets[i].name = v;
        if (s === 'p-p') state.presets[i].prompt = v;
        if (s === 'node-id') { state.providers[i].id = v; }
        if (s === 'node-url') state.providers[i].base_url = v;
        if (s === 'node-model') state.providers[i].model = v;
        if (s === 'node-time') state.providers[i].timeout = v;
        if (s === 'node-keys') state.providers[i].api_keys = v;
        if (s === 'v-id') { state.video_providers[i].id = v; }
        if (s === 'v-url') state.video_providers[i].base_url = v;
        if (s === 'v-model') state.video_providers[i].model = v;
        if (s === 'v-time') state.video_providers[i].timeout = v;
        if (s === 'v-keys') state.video_providers[i].api_keys = v;
    });

    document.body.addEventListener('change', (e) => {
        const input = e.target;
        if (!input.hasAttribute('data-sync')) return;
        const s = input.getAttribute('data-sync');
        if (s === 'node-id' || s === 'v-id') renderSelectors();
    });
}

async function saveConfig(btn) {
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = `<span class="spinner">↻</span> 部署中...`;
    readBasicFields();

    const payload = {
        ...state,
        presets: state.presets.filter(p=>p.name).map(p=>`${p.name}:${p.prompt}`),
        verbose_report: state.verbose_report // 💡 将详细汇报开关状态发给后端
    };

    try {
        const res = await bridge.apiPost("save_config", payload);
        if (res.success) showToast("部署成功，已生效！");
        else showToast("部署异常", "error");
    } catch(e) { showToast("网络错误", "error"); }
    
    setTimeout(() => { btn.disabled = false; btn.innerHTML = originalText; }, 800);
}

init();
