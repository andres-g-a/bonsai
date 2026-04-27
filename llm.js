window.LLM = (function () {

  function getConfig() {
    const cfg = window.APP_CONFIG || {};
    const localKey = localStorage.getItem('GEMINI_API_KEY');
    const localModel = localStorage.getItem('GEMINI_MODEL');
    return {
      apiKey: (localKey || cfg.GEMINI_API_KEY || '').trim(),
      model: (localModel || cfg.GEMINI_MODEL || 'gemini-2.0-flash').trim()
    };
  }

  function setApiKey(key) {
    if (key && key.trim()) localStorage.setItem('GEMINI_API_KEY', key.trim());
    else localStorage.removeItem('GEMINI_API_KEY');
  }

  function setModel(model) {
    if (model && model.trim()) localStorage.setItem('GEMINI_MODEL', model.trim());
  }

  function isConfigured() {
    return !!getConfig().apiKey;
  }

  function buildSystemPrompt(objective, existingTags) {
    const tagsList = existingTags.length ? existingTags.map(t => '`' + t + '`').join(', ') : '(none yet)';
    return [
      'You are an assistant helping the user achieve the OBJECTIVE below. Reply in the same language as the user.',
      '',
      'OBJECTIVE: "' + objective + '"',
      '',
      'For every turn, output ONLY a JSON object with these fields:',
      '- answer: your reply to the user (helpful, concise).',
      '- tag: short kebab-case topic identifier. REUSE one of the existing tags when the topic matches. Existing tags: ' + tagsList + '. Only invent a new tag if none fit.',
      '- is_tangent: true if your answer introduces a topic that is NOT strictly required for the objective; false if it advances the objective.',
      '- relevance_to_objective: number 0..1. The objective answered directly = 1.0; a pure tangent = ~0.1; partially related = 0.4-0.7.',
      '- continues_from: optional id (e.g. "n3") if your answer returns to an earlier topic in the conversation; otherwise null.',
      '',
      'Be honest about is_tangent and relevance — the user prunes the graph based on these. Do not inflate relevance.'
    ].join('\n');
  }

  function buildHistory(activeNodes) {
    const out = [];
    for (const n of activeNodes) {
      out.push({ role: 'user', parts: [{ text: n.content_user }] });
      out.push({
        role: 'model',
        parts: [{
          text: JSON.stringify({
            answer: n.content_assistant,
            tag: n.tag,
            is_tangent: !n.is_main_path,
            relevance_to_objective: n.relevance,
            continues_from: null
          })
        }]
      });
    }
    return out;
  }

  async function tagAndAnswer({ objective, activeNodes, userMessage, existingTags }) {
    const cfg = getConfig();
    if (!cfg.apiKey) {
      throw new Error('No API key configured. Open Settings (⚙) to add one.');
    }

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(cfg.model) + ':generateContent?key=' + encodeURIComponent(cfg.apiKey);

    const contents = buildHistory(activeNodes);
    contents.push({ role: 'user', parts: [{ text: userMessage }] });

    const body = {
      contents,
      systemInstruction: { parts: [{ text: buildSystemPrompt(objective, existingTags) }] },
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            answer: { type: 'STRING' },
            tag: { type: 'STRING' },
            is_tangent: { type: 'BOOLEAN' },
            relevance_to_objective: { type: 'NUMBER' },
            continues_from: { type: 'STRING', nullable: true }
          },
          required: ['answer', 'tag', 'is_tangent', 'relevance_to_objective']
        },
        temperature: 0.7
      }
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      let err = '';
      try { err = await resp.text(); } catch (_) {}
      throw new Error('Gemini API ' + resp.status + ': ' + err.slice(0, 300));
    }

    const data = await resp.json();
    const text = data && data.candidates && data.candidates[0] &&
      data.candidates[0].content && data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;

    if (!text) {
      throw new Error('Gemini returned no content. Raw: ' + JSON.stringify(data).slice(0, 300));
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new Error('Invalid JSON from Gemini: ' + text.slice(0, 200));
    }

    if (typeof parsed.relevance_to_objective !== 'number') parsed.relevance_to_objective = 0.5;
    parsed.relevance_to_objective = Math.max(0, Math.min(1, parsed.relevance_to_objective));
    if (!parsed.tag) parsed.tag = 'untagged';
    parsed.tag = String(parsed.tag).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
    parsed.is_tangent = !!parsed.is_tangent;
    if (parsed.continues_from === undefined) parsed.continues_from = null;

    return parsed;
  }

  return { getConfig, setApiKey, setModel, isConfigured, tagAndAnswer };
})();
