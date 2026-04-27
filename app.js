(function () {
  // ============ Chat input ============
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('btn-send');
  const status = document.getElementById('chat-status');

  function autoResize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 140) + 'px';
  }
  input.addEventListener('input', autoResize);

  function setLoading(loading, msg) {
    sendBtn.disabled = loading;
    input.disabled = loading;
    if (loading) {
      status.textContent = msg || '⏳ Tagging response…';
      status.className = 'loading';
    } else {
      status.className = 'hidden';
      status.textContent = '';
    }
  }

  function showError(msg) {
    status.textContent = '⚠ ' + msg;
    status.className = 'error';
    setTimeout(() => {
      if (status.classList.contains('error')) {
        status.className = 'hidden';
        status.textContent = '';
      }
    }, 8000);
  }

  async function send() {
    const text = input.value.trim();
    if (!text) return;
    if (!window.LLM.isConfigured()) {
      openSettings('Add an API key first.');
      return;
    }
    setLoading(true);
    try {
      await window.GRAPH.addTurn(text);
      input.value = '';
      autoResize();
    } catch (e) {
      console.error(e);
      showError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  // ============ Settings modal ============
  const settingsModal = document.getElementById('modal-settings');
  const apiKeyInput = document.getElementById('input-api-key');
  const modelSelect = document.getElementById('select-model');
  const settingsStatus = document.getElementById('settings-status');

  function openSettings(hintMsg) {
    const cfg = window.LLM.getConfig();
    apiKeyInput.value = cfg.apiKey || '';
    modelSelect.value = cfg.model || 'gemini-2.0-flash';
    settingsStatus.textContent = hintMsg || '';
    settingsStatus.className = hintMsg ? 'form-status warn' : 'form-status';
    settingsModal.classList.remove('hidden');
    setTimeout(() => apiKeyInput.focus(), 0);
  }

  function closeSettings() {
    settingsModal.classList.add('hidden');
  }

  document.getElementById('btn-settings').addEventListener('click', () => openSettings());
  document.getElementById('btn-cancel-settings').addEventListener('click', closeSettings);
  document.getElementById('btn-save-settings').addEventListener('click', () => {
    window.LLM.setApiKey(apiKeyInput.value);
    window.LLM.setModel(modelSelect.value);
    closeSettings();
  });

  // ============ New session modal ============
  const nsModal = document.getElementById('modal-newsession');
  const objectiveInput = document.getElementById('input-objective');

  function openNewSession() {
    objectiveInput.value = '';
    nsModal.classList.remove('hidden');
    setTimeout(() => objectiveInput.focus(), 0);
  }
  function closeNewSession() {
    nsModal.classList.add('hidden');
  }

  document.getElementById('btn-new-session').addEventListener('click', openNewSession);
  document.getElementById('btn-cancel-newsession').addEventListener('click', closeNewSession);
  document.getElementById('btn-confirm-newsession').addEventListener('click', () => {
    const obj = objectiveInput.value.trim();
    if (!obj) {
      objectiveInput.focus();
      return;
    }
    window.GRAPH.startNewSession(obj);
    closeNewSession();
    setTimeout(() => input.focus(), 0);
  });

  objectiveInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-confirm-newsession').click();
  });

  // Click outside modal closes
  [settingsModal, nsModal].forEach(m => {
    m.addEventListener('click', (e) => {
      if (e.target === m) m.classList.add('hidden');
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      settingsModal.classList.add('hidden');
      nsModal.classList.add('hidden');
    }
  });

  // ============ Initial hint if no key configured ============
  if (!window.LLM.isConfigured()) {
    status.textContent = 'No API key. Click ⚙ to add one (free at aistudio.google.com), or just explore the demo graph.';
    status.className = 'info';
  }
})();
