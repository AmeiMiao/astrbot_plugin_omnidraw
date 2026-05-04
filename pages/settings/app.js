const bridge = window.AstrBotPluginPage;

let state = {
    permission_config: {}, persona_config: {}, optimizer_config: {}, router_config: {},
    presets: [], providers: [], video_providers: []
};

// 🟢 交互式节点选择器渲染引擎
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
        }).join('') || '<span class="empty-hint">请先在算力集群中添加节点</span>';
    };

    renderTo('sel-route-img', state.providers, 'route_img');
    renderTo('sel-route-selfie', state.providers, 'route_selfie');
    renderTo('sel-opt-chain', state.providers, 'opt_chain');
    renderTo('sel-route-video', state.video_providers, 'route_video');
}

// 🟢 弹窗与上传预览
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function updateImagePreview(url) {
    const preview = document.getElementById('persona-preview');
    if (url) {
        preview.style.backgroundImage = `url('${url}')`;
        preview.textContent = '';
    } else {
        preview.style.backgroundImage = 'none';
        preview.textContent = '无预览';
    }
}

async function init() {
    const context = await bridge.ready();
    const rawConfig = await bridge.apiGet("get_config") || {};
    
    // 配置解构映射
    const perm = rawConfig.permission_config || rawConfig;
    const pers = rawConfig.persona_config || rawConfig;
    const opt = rawConfig.optimizer_config || rawConfig;
    const route = rawConfig.router_config || rawConfig;

    state.permission_config.allowed_users = pers.allowed_users || perm.allowed_users || "";
    state.router_config.chain_text2img = route.chain_text2img || "node_1";
    state.router_config.chain_selfie = route.chain_selfie || "node_1";
    state.router_config.chain_video = route.chain_video || "video_node_1";
    state.persona_config.persona_name = pers.persona_name || "默认助理";
    state.persona_config.persona_base_prompt = pers.persona_base_prompt || "";
    state.persona_config.persona_ref_image = pers.persona_ref_image || "";
    state.optimizer_config.enable_optimizer = opt.enable_optimizer ?? true;
    state.optimizer_config.optimizer_style = opt.optimizer_style || "手机日常原生感";
    state.optimizer_config.chain_optimizer = opt.chain_optimizer || "node_1";
    state.optimizer_config.optimizer_model = opt.optimizer_model || "gpt-4o-mini";
    state.optimizer_config.optimizer_timeout = opt.optimizer_timeout || 15;
    state.optimizer_config.max_batch_count = opt.max_batch_count || 0;
    state.optimizer_config.optimizer_custom_prompt = opt.optimizer_custom_prompt || "";

    state.presets = (rawConfig.presets || []).map(p => typeof p === 'string' ? { name: p.split(':')[0], prompt: p.split(':')[1] } : p);
    state.providers = rawConfig.providers || [];
    state.video_providers = rawConfig.video_providers || [];

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

// 🟢 渲染列表函数（复用上一版逻辑并注入 Selector 刷新）
function renderPresets() {
    const html = state.presets.map((p, i) => `
        <div class="list-item">
            <input type="text" class="input-modern preset-name" placeholder="指令" value="${p.name}" data-sync="p-n" data-index="${i}">
            <span class="divider-text">→</span>
            <input type="text" class="input-modern preset-prompt" placeholder="描述词" value="${p.prompt}" data-sync="p-p" data-index="${i}">
            <button data-action="del-preset" data-index="${i}" class="btn-icon">×</button>
        </div>
    `).join('');
    document.getElementById("presets-container").innerHTML = html || '<div class="empty-tip">尚未定义宏</div>';
}

function renderProviders() {
    const html = state.providers.map((p, i) => `
        <div class="list-card">
            <div class="list-card-header">
                <input type="text" class="input-minimal" placeholder="NODE_ID" value="${p.id||p['节点ID']||''}" data-sync="node-id" data-index="${i}">
                <button data-action="del-provider" data-index="${i}" class="btn-text">REMOVE</button>
            </div>
            <div class="grid-2-col">
                <div class="form-group"><label>接口模式</label><select class="input-modern" data-sync="node-api" data-index="${i}"><option value="openai_image" ${(p.api_type||p['接口模式'])==='openai_image'?'selected':''}>openai_image</option><option value="openai_chat" ${(p.api_type||p['接口模式'])==='openai_chat'?'selected':''}>openai_chat</option></select></div>
                <div class="form-group"><label>接口地址</label><input type="text" class="input-modern" value="${p.base_url||p['接口地址 (需含/v1)']||''}" data-sync="node-url" data-index="${i}"></div>
                <div class="form-group full-width"><label>API_KEYS</label><textarea class="input-modern" rows="1" data-sync="node-keys" data-index="${i}">${Array.isArray(p.api_keys)?p.api_keys.join('\\n'):(p.api_keys||p['API密钥']||'')}</textarea></div>
            </div>
        </div>
    `).join('');
    document.getElementById("providers-container").innerHTML = html;
    renderSelectors(); // 集群变动，调度模块同步刷新
}

function renderVideoProviders() {
    const html = state.video_providers.map((p, i) => `
        <div class="list-card">
            <div class="list-card-header"><input type="text" class="input-minimal" placeholder="VID_NODE_ID" value="${p.id||p['节点ID']||''}" data-sync="v-id" data-index="${i}"><button data-action="del-video-provider" data-index="${i}" class="btn-text">REMOVE</button></div>
            <div class="grid-2-col">
                <div class="form-group"><label>模式</label><select class="input-modern" data-sync="v-api" data-index="${i}"><option value="async_task" ${p.api_type?.includes('async_task')?'selected':''}>异步轮询</option><option value="openai_sync" ${p.api_type?.includes('openai_sync')?'selected':''}>同步阻塞</option></select></div>
                <div class="form-group"><label>地址</label><input type="text" class="input-modern" value="${p.base_url||p['接口地址 (需含/v1或/v2)']||''}" data-sync="v-url" data-index="${i}"></div>
            </div>
        </div>
    `).join('');
    document.getElementById("video-providers-container").innerHTML = html;
    renderSelectors();
}

function setupEventDelegation() {
    document.body.addEventListener('click', async (e) => {
        // Tab 切换
        const navItem = e.target.closest('.nav-item');
        if (navItem) {
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            navItem.classList.add('active');
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            document.getElementById(navItem.getAttribute('data-target')).classList.add('active');
            return;
        }

        // 节点选择器联动
        const chip = e.target.closest('.selector-chip');
        if (chip) {
            const inputId = chip.getAttribute('data-input');
            const nodeId = chip.getAttribute('data-id');
            document.getElementById(inputId).value = nodeId;
            document.querySelectorAll(`.selector-chip[data-input="${inputId}"]`).forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            return;
        }

        // 上传逻辑
        if (e.target.closest('#persona-upload-trigger')) {
            try {
                const files = await bridge.upload();
                if (files && files.length > 0) {
                    const path = files[0].path || files[0].url;
                    document.getElementById('persona_ref').value = path;
                    updateImagePreview(path);
                    showToast("参考图已就绪");
                }
            } catch (err) { showToast("上传取消", "error"); }
        }

        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const act = btn.getAttribute('data-action');
        const idx = parseInt(btn.getAttribute('data-index'), 10);

        if (act === 'save-config') saveConfig(btn);
        if (act === 'add-preset') { state.presets.push({name:"", prompt:""}); renderPresets(); }
        if (act === 'del-preset') { state.presets.splice(idx, 1); renderPresets(); }
        if (act === 'add-provider') { state.providers.push({id:`node_${state.providers.length+1}`, api_type:"openai_image", base_url:"", api_keys:"", timeout:60}); renderProviders(); }
        if (act === 'del-provider') { state.providers.splice(idx, 1); renderProviders(); }
        if (act === 'add-video-provider') { state.video_providers.push({id:`v_node_${state.video_providers.length+1}`, api_type:"async_task", base_url:"", api_keys:"", timeout:300}); renderVideoProviders(); }
        if (act === 'del-video-provider') { state.video_providers.splice(idx, 1); renderVideoProviders(); }
    });

    document.body.addEventListener('input', (e) => {
        const input = e.target;
        if (!input.hasAttribute('data-sync')) return;
        const s = input.getAttribute('data-sync');
        const i = parseInt(input.getAttribute('data-index'), 10);
        const v = input.value;
        if (s === 'p-n') state.presets[i].name = v;
        if (s === 'p-p') state.presets[i].prompt = v;
        if (s === 'node-id') { state.providers[i].id = v; renderSelectors(); }
        if (s === 'node-api') state.providers[i].api_type = v;
        if (s === 'node-url') state.providers[i].base_url = v;
        if (s === 'node-keys') state.providers[i].api_keys = v;
        if (s === 'v-id') { state.video_providers[i].id = v; renderSelectors(); }
        if (s === 'v-url') state.video_providers[i].base_url = v;
    });
}

async function saveConfig(btn) {
    btn.disabled = true;
    btn.innerHTML = `DEPLOYING...`;
    
    // 读取固定字段
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

    const payload = {
        ...state,
        presets: state.presets.filter(p=>p.name).map(p=>`${p.name}:${p.prompt}`)
    };

    try {
        const res = await bridge.apiPost("save_config", payload);
        if (res.success) showToast("部署成功");
        else showToast("部署异常", "error");
    } catch(e) { showToast("网络错误", "error"); }
    
    setTimeout(() => { btn.disabled = false; btn.innerHTML = `DEPLOY_CHANGES`; }, 1000);
}

init();
