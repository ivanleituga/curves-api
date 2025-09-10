// CONFIGURAÇÃO E ESTADO

const CONFIG = {
  API_URL: '/api/generate-profile',
  DEBUG_MODE: true
};

const state = {
  isLoading: false,
  lastParams: null,
  currentImageUrl: null,
  errors: []
};

// ELEMENTOS DO DOM

const elements = {
  // Form
  form: document.getElementById('profileForm'),
  wellInput: document.getElementById('wellInput'),
  hasLitoInput: document.getElementById('hasLitoInput'),
  
  // Buttons
  generateBtn: document.getElementById('generateBtn'),
  btnText: document.getElementById('btnText'),
  btnLoader: document.getElementById('btnLoader'),
  downloadBtn: document.getElementById('downloadBtn'),
  fullscreenBtn: document.getElementById('fullscreenBtn'),
  toggleDebug: document.getElementById('toggleDebug'),
  clearDebug: document.getElementById('clearDebug'),
  
  // Display areas
  imageContainer: document.getElementById('imageContainer'),
  vizTitle: document.getElementById('vizTitle'),
  errorContainer: document.getElementById('errorContainer'),
  errorText: document.getElementById('errorText'),
  
  // Status
  statusText: document.getElementById('statusText'),
  lastUpdate: document.getElementById('lastUpdate'),
  
  // Debug
  debugPanel: document.getElementById('debugPanel'),
  debugContent: document.getElementById('debugContent')
};

// FUNÇÕES AUXILIARES

// Logger para debug
function log(label, data = null) {
  if (!CONFIG.DEBUG_MODE) return;
  
  const timestamp = new Date().toLocaleTimeString('pt-BR');
  const message = data ? 
    `[${timestamp}] ${label}: ${JSON.stringify(data, null, 2)}` :
    `[${timestamp}] ${label}`;
  
  console.log(label, data);
  
  if (elements.debugContent) {
    elements.debugContent.textContent = message + '\n' + elements.debugContent.textContent;
  }
}

// Atualizar status
function updateStatus(message, type = 'info') {
  const colors = {
    info: '#6b7280',
    success: '#10b981',
    error: '#ef4444',
    warning: '#f59e0b'
  };
  
  elements.statusText.textContent = message;
  elements.statusText.style.color = colors[type] || colors.info;
  
  if (type === 'success') {
    elements.lastUpdate.textContent = new Date().toLocaleString('pt-BR');
  }
}

// Mostrar erro
function showError(message) {
  elements.errorContainer.classList.remove('hidden');
  elements.errorText.textContent = message;
  updateStatus('Erro', 'error');
  log('ERRO', message);
}

// Limpar erro
function clearError() {
  elements.errorContainer.classList.add('hidden');
  elements.errorText.textContent = '';
}

// FUNÇÕES DE FORMULÁRIO

// Obter parâmetros do formulário
function getFormParams() {
  const well = elements.wellInput.value.trim();
  const hasLito = elements.hasLitoInput.checked;
  
  // Obter curvas selecionadas
  const curves = [];
  document.querySelectorAll('input[name="curves"]:checked').forEach(checkbox => {
    curves.push(checkbox.value);
  });
  
  return { well, curves, hasLito };
}

// Validar parâmetros
function validateParams(params) {
  clearError();
  
  if (!params.well) {
    showError('Por favor, informe o nome do poço');
    return false;
  }
  
  if (params.curves.length === 0) {
    showError('Por favor, selecione pelo menos uma curva');
    return false;
  }
  
  return true;
}

// FUNÇÕES DE UI

// Mostrar loading
function showLoading() {
  state.isLoading = true;
  elements.generateBtn.disabled = true;
  elements.btnText.classList.add('hidden');
  elements.btnLoader.classList.remove('hidden');
  
  const loadingHTML = `
    <div class="loading-overlay">
      <div class="loading-content">
        <div class="loading-spinner"></div>
        <p>Gerando perfil composto...</p>
        <p style="font-size: 0.75rem; margin-top: 0.5rem; color: #6b7280;">
          Processando dados...
        </p>
      </div>
    </div>
  `;
  
  elements.imageContainer.innerHTML = loadingHTML;
  updateStatus('Processando...', 'info');
}

// Esconder loading
function hideLoading() {
  state.isLoading = false;
  elements.generateBtn.disabled = false;
  elements.btnText.classList.remove('hidden');
  elements.btnLoader.classList.add('hidden');
}

// Exibir imagem
function displayImage(imageUrl, params) {
  elements.imageContainer.innerHTML = `
    <img src="${imageUrl}" 
         alt="Perfil Composto - ${params.well}"
         style="max-width: 100%; height: auto;">
  `;
  
  elements.vizTitle.textContent = `Perfil: ${params.well}`;
  elements.downloadBtn.disabled = false;
  elements.fullscreenBtn.disabled = false;
  
  state.currentImageUrl = imageUrl;
  updateStatus('Perfil gerado com sucesso', 'success');
  
  log('Perfil exibido', { well: params.well, curves: params.curves });
}

// FUNÇÃO PRINCIPAL - GERAR PERFIL

async function generateProfile(e) {
  if (e) e.preventDefault();
  
  // Obter e validar parâmetros
  const params = getFormParams();
  log('Parâmetros coletados', params);
  
  if (!validateParams(params)) {
    return;
  }
  
  // Salvar parâmetros
  state.lastParams = params;
  
  // Mostrar loading
  showLoading();
  
  try {
    // Fazer requisição
    log('Enviando requisição', { url: CONFIG.API_URL, params });
    
    const response = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });
    
    log('Resposta recebida', { 
      status: response.status, 
      statusText: response.statusText 
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }
    
    // Converter resposta para blob
    const blob = await response.blob();
    log('Blob recebido', { 
      size: `${(blob.size / 1024).toFixed(2)} KB`,
      type: blob.type 
    });
    
    // Criar URL para a imagem
    const imageUrl = URL.createObjectURL(blob);
    
    // Exibir imagem
    displayImage(imageUrl, params);
    
  } catch (error) {
    console.error('Erro ao gerar perfil:', error);
    showError(error.message || 'Erro ao gerar o perfil. Tente novamente.');
  } finally {
    hideLoading();
  }
}

// FUNÇÕES DE AÇÃO

// Download da imagem
function downloadImage() {
  if (!state.currentImageUrl || !state.lastParams) return;
  
  const link = document.createElement('a');
  link.href = state.currentImageUrl;
  link.download = `perfil_${state.lastParams.well}_${Date.now()}.svg`;
  link.click();
  
  log('Download iniciado', { well: state.lastParams.well });
}

// Tela cheia
function toggleFullscreen() {
  const img = elements.imageContainer.querySelector('img');
  if (!img) return;
  
  if (img.requestFullscreen) {
    img.requestFullscreen();
  } else if (img.webkitRequestFullscreen) {
    img.webkitRequestFullscreen();
  } else if (img.msRequestFullscreen) {
    img.msRequestFullscreen();
  }
  
  log('Tela cheia ativada');
}

// Toggle debug panel
function toggleDebug() {
  elements.debugPanel.classList.toggle('hidden');
}

// Limpar debug
function clearDebug() {
  elements.debugContent.textContent = '';
  log('Debug limpo');
}

// EVENT LISTENERS

// Form submit
elements.form.addEventListener('submit', generateProfile);

// Botões
elements.downloadBtn.addEventListener('click', downloadImage);
elements.fullscreenBtn.addEventListener('click', toggleFullscreen);
elements.toggleDebug.addEventListener('click', toggleDebug);
elements.clearDebug.addEventListener('click', clearDebug);

// Validação em tempo real
elements.wellInput.addEventListener('input', () => {
  if (elements.wellInput.value.trim()) {
    clearError();
  }
});

// Atalhos de teclado
document.addEventListener('keydown', (e) => {
  // Ctrl/Cmd + Enter para gerar
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !state.isLoading) {
    generateProfile();
  }
  
  // Ctrl/Cmd + D para debug
  if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
    e.preventDefault();
    toggleDebug();
  }
});

// INICIALIZAÇÃO

document.addEventListener('DOMContentLoaded', () => {
  updateStatus('Pronto', 'info');
  log('Aplicação inicializada', {
    api: CONFIG.API_URL,
    debug: CONFIG.DEBUG_MODE
  });
  
  // Teste de conectividade
  fetch('/api/health')
    .then(res => res.json())
    .then(data => {
      log('API Health Check', data);
      updateStatus('API Conectada', 'success');
    })
    .catch(err => {
      log('API Health Check Falhou', err.message);
      updateStatus('API Offline', 'warning');
    });
});

// EXPORTAR PARA DEBUGGING GLOBAL

window.CurvesAPI = {
  state,
  CONFIG,
  generateProfile,
  getFormParams,
  log
};