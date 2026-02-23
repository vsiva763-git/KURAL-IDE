const state = {
  currentProject: "",
  architectModel: "gemini",
  builderModel: "openrouter",
  isAutoMode: false,
  isPaused: false,
  conversationHistory: [],
  taskList: [],
  currentTaskIndex: 0,
  sessionHealth: { architectAccuracy: 1, builderSuccess: 1 },
  isWaitingForApproval: false,
};

const API_BASE = (() => {
  const { protocol, hostname, host, origin, port } = window.location;

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:5000";
  }

  if (port === "5000" || host.includes("-5000.")) {
    return origin;
  }

  if (host.includes("-3000.")) {
    return origin.replace("-3000.", "-5000.");
  }

  return `${protocol}//${hostname}:5000`;
})();

const elements = {
  architectChat: document.getElementById("architect-chat"),
  builderChat: document.getElementById("builder-chat"),
  taskList: document.getElementById("task-list"),
  ideaInput: document.getElementById("idea-input"),
  startBtn: document.getElementById("start-btn"),
  pauseBtn: document.getElementById("pause-btn"),
  autoBtn: document.getElementById("auto-btn"),
  architectSend: document.getElementById("architect-send"),
  builderSend: document.getElementById("builder-send"),
  architectInput: document.getElementById("architect-input"),
  builderInput: document.getElementById("builder-input"),
  architectModel: document.getElementById("architect-model"),
  builderModel: document.getElementById("builder-model"),
  planModal: document.getElementById("plan-modal"),
  decisionPanel: document.getElementById("decision-panel"),
  planEditor: document.getElementById("plan-editor"),
  approveBtn: document.getElementById("approve-btn"),
  closeModal: document.getElementById("close-modal"),
  addTaskBtn: document.getElementById("add-task-btn"),
  removeTaskBtn: document.getElementById("remove-task-btn"),
  feedbackBtn: document.getElementById("feedback-btn"),
  finishBtn: document.getElementById("finish-btn"),
  addFeatureBtn: document.getElementById("add-feature-btn"),
  fixSomethingBtn: document.getElementById("fix-something-btn"),
  continueBtn: document.getElementById("continue-btn"),
  toast: document.getElementById("toast"),
  architectStatus: document.getElementById("architect-status"),
  builderStatus: document.getElementById("builder-status"),
  architectCount: document.getElementById("architect-count"),
  builderCount: document.getElementById("builder-count"),
  projectName: document.getElementById("project-name"),
  sessionHealth: document.getElementById("session-health"),
  modeIndicator: document.getElementById("mode-indicator"),
  newProjectBtn: document.getElementById("new-project-btn"),
  saveSessionBtn: document.getElementById("save-session-btn"),
  flowStatus: document.getElementById("flow-status"),
  flowIcon: document.getElementById("flow-icon"),
  flowText: document.getElementById("flow-text"),
  flowArrow: document.getElementById("flow-arrow"),
};

let editorInstance = null;

const FLOW_STAGES = {
  ready: { icon: "💡", text: "Ready", arrow: "" },
  architect_thinking: { icon: "🧠", text: "Architect Thinking", arrow: "⬇" },
  plan_ready: { icon: "📋", text: "Plan Ready", arrow: "►" },
  awaiting_approval: { icon: "✋", text: "Awaiting Your Approval", arrow: "" },
  plan_approved: { icon: "✅", text: "Approved! Sending to Builder", arrow: "►" },
  builder_working: { icon: "⚙️", text: "Builder Writing Code", arrow: "⬇" },
  builder_done: { icon: "✅", text: "Task Complete", arrow: "◄" },
  architect_reviewing: { icon: "🔍", text: "Architect Reviewing", arrow: "◄" },
  awaiting_user_decision: { icon: "🤔", text: "Waiting for your decision", arrow: "" },
  all_done: { icon: "🎉", text: "Project Complete!", arrow: "" },
  error: { icon: "⚠️", text: "Error — Check Messages", arrow: "" },
};

const MESSAGE_LABELS = {
  architect: "🧠 ARCHITECT",
  builder: "⚙️ BUILDER",
  user: "👤 YOU",
  system: "📡 SYSTEM",
};

function updateFlowStatus(stage, taskInfo = "") {
  const selected = FLOW_STAGES[stage] || FLOW_STAGES.ready;
  elements.flowIcon.textContent = selected.icon;
  elements.flowText.textContent = taskInfo ? `${selected.text} — ${taskInfo}` : selected.text;
  elements.flowArrow.textContent = selected.arrow;

  const panel = elements.flowStatus;
  panel.className = "flow-status";
  if (stage.startsWith("architect")) panel.classList.add("architect-active");
  if (stage.startsWith("builder")) panel.classList.add("builder-active");
  if (stage === "plan_approved") panel.classList.add("sending");
  if (stage === "architect_reviewing") panel.classList.add("reviewing");
}

function showToast(message, persistent = false) {
  elements.toast.textContent = message;
  elements.toast.classList.remove("hidden");
  if (!persistent) {
    setTimeout(() => elements.toast.classList.add("hidden"), 2200);
  }
}

function setStatus(panel, status) {
  const target = panel === "architect" ? elements.architectStatus : elements.builderStatus;
  target.textContent = status;
}

function addMessage(container, content, type) {
  const wrapper = document.createElement("div");
  wrapper.className = `message-wrapper ${type}`;

  const label = document.createElement("div");
  label.className = "message-label";
  label.textContent = MESSAGE_LABELS[type] || type.toUpperCase();

  const message = document.createElement("div");
  message.className = `message ${type}`;
  message.textContent = content;

  wrapper.appendChild(label);
  wrapper.appendChild(message);
  container.appendChild(wrapper);
  container.scrollTop = container.scrollHeight;
}

function addSystemMessage(content) {
  addMessage(elements.architectChat, content, "system");
  addMessage(elements.builderChat, content, "system");
  updateMessageCount();
}

function updateMessageCount() {
  const architectCount = elements.architectChat.children.length;
  const builderCount = elements.builderChat.children.length;
  elements.architectCount.textContent = architectCount;
  elements.builderCount.textContent = builderCount;
}

function updateTaskList(planText) {
  const tasks = planText
    .split("\n")
    .filter((line) => /^\s*\**\s*task\s*\d+\s*:/i.test(line.trim()));
  state.taskList = tasks.map((task) => ({
    title: task.replace(/^\s*\**\s*task\s*\d+\s*:\**\s*/i, "").trim(),
    status: "pending",
  }));
  renderTaskList();
}

function renderTaskList() {
  elements.taskList.innerHTML = "";
  state.taskList.forEach((task) => {
    const item = document.createElement("li");
    const label = document.createElement("span");
    const dot = document.createElement("span");
    label.textContent = task.title || "Untitled task";
    dot.className = `status-dot ${task.status}`;
    item.appendChild(label);
    item.appendChild(dot);
    elements.taskList.appendChild(item);
  });
}

function updateTaskStatus(index, status) {
  if (!state.taskList[index]) {
    return;
  }
  state.taskList[index].status = status;
  renderTaskList();
}

function toggleModal(show) {
  elements.planModal.classList.toggle("hidden", !show);
  state.isWaitingForApproval = show;
}

function addTaskLine() {
  const lines = elements.planEditor.value.split("\n");
  const taskCount = lines.filter((line) => line.toLowerCase().startsWith("task")).length;
  lines.push(`Task ${taskCount + 1}: `);
  elements.planEditor.value = lines.join("\n");
}

function showProjectDecisionPanel() {
  elements.decisionPanel.classList.remove("hidden");
}

function hideProjectDecisionPanel() {
  elements.decisionPanel.classList.add("hidden");
}

function removeTaskLine() {
  const lines = elements.planEditor.value.split("\n");
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].toLowerCase().startsWith("task")) {
      lines.splice(i, 1);
      break;
    }
  }
  elements.planEditor.value = lines.join("\n");
}

function calculateSessionHealth() {
  const architectAccuracy = state.sessionHealth.architectAccuracy;
  const builderSuccess = state.sessionHealth.builderSuccess;
  const score = Math.round(((architectAccuracy + builderSuccess) / 2) * 100);
  elements.sessionHealth.textContent = `Health ${score}%`;
  return score;
}

function detectLanguage(code, hint) {
  if (hint) {
    return hint;
  }
  if (code.includes("<html") || code.includes("<!DOCTYPE")) {
    return "html";
  }
  if (code.includes("body") && code.includes("{") && code.includes("}")) {
    return "css";
  }
  return "javascript";
}

function updateEditor(language, code) {
  if (!editorInstance) {
    return;
  }
  monaco.editor.setModelLanguage(editorInstance.getModel(), language);
  editorInstance.setValue(code);
  if (language === "html") {
    updatePreview(code);
  }
}

function updatePreview(code) {
  const preview = document.getElementById("preview");
  preview.srcdoc = code;
}

function extractCodeBlocks(text) {
  const regex = /```(\w+)?\n([\s\S]*?)```/g;
  const blocks = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    blocks.push({ language: match[1] || "", code: match[2] });
  }
  return blocks;
}

function selectBestCodeBlock(blocks) {
  const htmlBlock = blocks.find((block) => (block.language || "").toLowerCase() === "html");
  if (htmlBlock) {
    return htmlBlock;
  }

  const javascriptBlock = blocks.find((block) => {
    const language = (block.language || "").toLowerCase();
    return language === "javascript" || language === "js";
  });
  if (javascriptBlock) {
    return javascriptBlock;
  }

  const cssBlock = blocks.find((block) => (block.language || "").toLowerCase() === "css");
  if (cssBlock) {
    return cssBlock;
  }

  return blocks.reduce((largest, current) =>
    (current.code || "").length > (largest.code || "").length ? current : largest
  );
}

function composePreviewDocument(blocks) {
  const htmlBlock = blocks.find((block) => (block.language || "").toLowerCase() === "html");
  if (!htmlBlock) {
    return null;
  }

  const css = blocks
    .filter((block) => (block.language || "").toLowerCase() === "css")
    .map((block) => block.code.trim())
    .join("\n\n");

  const js = blocks
    .filter((block) => {
      const language = (block.language || "").toLowerCase();
      return language === "javascript" || language === "js";
    })
    .map((block) => block.code.trim())
    .join("\n\n");

  let html = htmlBlock.code.trim();

  if (css) {
    const styleTag = `<style>\n${css}\n</style>`;
    html = html.includes("</head>")
      ? html.replace("</head>", `${styleTag}\n</head>`)
      : `${styleTag}\n${html}`;
  }

  if (js) {
    const scriptTag = `<script>\n${js}\n</script>`;
    html = html.includes("</body>")
      ? html.replace("</body>", `${scriptTag}\n</body>`)
      : `${html}\n${scriptTag}`;
  }

  return html;
}

async function callApi(path, payload) {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const rawBody = await response.text();
      let message = `Request failed (${response.status})`;
      try {
        const parsed = JSON.parse(rawBody);
        message = parsed.error || message;
      } catch (_parseError) {
        if (response.status === 401 || response.status === 403) {
          message = "Codespaces auth required for backend port. Open the 5000 port URL in your browser and allow access.";
        }
      }
      throw new Error(message);
    }
    return response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown request error";
    throw new Error(`Backend request failed at ${API_BASE || "current host"}: ${message}`);
  }
}

async function callArchitect(message) {
  const safeMessage = (message || "").trim();
  if (!safeMessage) {
    throw new Error("Architect message is empty.");
  }
  setStatus("architect", "Thinking...");
  const data = await callApi("/api/architect", {
    message: safeMessage,
    history: state.conversationHistory,
  });
  state.conversationHistory = data.history;
  const modelName = data.model_used || "gemini";
  elements.architectStatus.textContent = data.fallback_used ? `Auto: ${modelName}` : modelName;
  if (data.fallback_used) showToast(`Architect switched to ${modelName} automatically`);
  setStatus("architect", "Idle");
  return data.response;
}

async function callBuilder(message) {
  const safeMessage = (message || "").trim();
  if (!safeMessage) {
    throw new Error("Builder task instruction is empty.");
  }
  setStatus("builder", "Thinking...");
  const data = await callApi("/api/builder", {
    message: safeMessage,
    history: state.conversationHistory,
  });
  state.conversationHistory = data.history;
  const modelName = data.model_used || "openrouter";
  elements.builderStatus.textContent = data.fallback_used ? `Auto: ${modelName}` : modelName;
  if (data.fallback_used) showToast(`Builder switched to ${modelName} automatically`);
  setStatus("builder", "Idle");
  return data;
}

async function startProject(idea) {
  state.currentProject = idea;
  elements.projectName.textContent = idea;
  state.isPaused = false;
  state.currentTaskIndex = 0;
  state.conversationHistory = [];
  elements.architectChat.innerHTML = "";
  elements.builderChat.innerHTML = "";
  addMessage(elements.architectChat, idea, "user");
  updateMessageCount();

  updateFlowStatus("architect_thinking");
  const plan = await callArchitect(idea);
  updateFlowStatus("plan_ready");
  addMessage(elements.architectChat, plan, "architect");
  updateMessageCount();
  updateTaskList(plan);
  elements.planEditor.value = plan;
  toggleModal(true);
  updateFlowStatus("awaiting_approval");
}

async function runTaskLoop(approvedPlan) {
  toggleModal(false);
  hideProjectDecisionPanel();
  if (!approvedPlan) return;
  updateFlowStatus("plan_approved");
  updateTaskList(approvedPlan);
  state.currentTaskIndex = 0;

  async function runNextTask(index) {
    if (state.isPaused) return;
    if (index >= state.taskList.length) {
      updateFlowStatus("all_done");
      showToast("🎉 Project complete!");
      return;
    }

    updateTaskStatus(index, "in-progress");
    const taskInstruction = (state.taskList[index].title || "").trim()
      || `Implement task ${index + 1} from the approved plan.`;

    try {
      updateFlowStatus("builder_working", `Task ${index + 1} of ${state.taskList.length}`);
      const builderResponse = await callBuilder(taskInstruction);
      updateFlowStatus("builder_done", `Task ${index + 1} complete`);
      addMessage(elements.builderChat, builderResponse.response, "builder");
      updateMessageCount();
      handleBuilderResponse(builderResponse);
      updateTaskStatus(index, "completed");
      state.currentTaskIndex = index + 1;

      updateFlowStatus("architect_reviewing");
      const architectReviewInput = (builderResponse.response || "").trim()
        || `Task ${index + 1} completed. Review output and provide the next task.`;
      const nextPlan = await callArchitect(architectReviewInput);
      addMessage(elements.architectChat, nextPlan, "architect");
      updateMessageCount();

      if (nextPlan.includes("AWAITING USER DECISION")) {
        updateFlowStatus("awaiting_user_decision");
        showProjectDecisionPanel();
        return;
      }

      if (state.currentTaskIndex >= state.taskList.length) {
        elements.planEditor.value = nextPlan;
        toggleModal(true);
        updateFlowStatus("awaiting_approval");
        return;
      }

      if (state.isAutoMode) {
        elements.planEditor.value = nextPlan;
        await runNextTask(index + 1);
      } else {
        elements.planEditor.value = nextPlan;
        toggleModal(true);
        updateFlowStatus("awaiting_approval");
      }
    } catch (error) {
      updateFlowStatus("error");
      showToast(error.message, true);
    }
  }

  await runNextTask(0);
}

function handleBuilderResponse(builderData) {
  const blocks = builderData.codeBlocks?.length
    ? builderData.codeBlocks
    : extractCodeBlocks(builderData.response);
  if (!blocks.length) {
    updateEditor("plaintext", builderData.response?.trim() || "No code output received.");
    showToast("Builder returned no fenced code block; showing raw output in editor.");
    return;
  }

  const selected = selectBestCodeBlock(blocks);
  const language = detectLanguage(selected.code, selected.language);
  updateEditor(language, selected.code.trim());

  const previewDoc = composePreviewDocument(blocks);
  if (previewDoc) {
    updatePreview(previewDoc);
  }

  if (blocks.length > 1) {
    showToast(`Applied ${blocks.length} code blocks. Editor showing ${language}.`);
  }
}

function toggleAutoMode() {
  state.isAutoMode = !state.isAutoMode;
  elements.autoBtn.classList.toggle("active", state.isAutoMode);
  elements.modeIndicator.textContent = state.isAutoMode ? "Auto Mode" : "Manual Mode";
}

async function handleUserIntervention(panel, message) {
  addMessage(panel === "architect" ? elements.architectChat : elements.builderChat, message, "user");
  updateMessageCount();
  const data = await callApi("/api/user-intervention", {
    panel,
    message,
    history: state.conversationHistory,
  });
  state.conversationHistory = data.history;
  if (data.model_used) {
    const modelLabel = document.querySelector(`#${panel}-model option[value="${data.model_used}"]`);
    const modelName = modelLabel ? modelLabel.textContent : data.model_used;
    setStatus(panel, data.fallback_used ? `⚡ ${modelName} (auto)` : `✅ ${modelName}`);
  }
  const target = panel === "architect" ? elements.architectChat : elements.builderChat;
  addMessage(target, data.response, panel);
  updateMessageCount();
}

function initMonaco() {
  window.require.config({
    paths: {
      vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs",
    },
  });
  window.require(["vs/editor/editor.main"], () => {
    editorInstance = monaco.editor.create(document.getElementById("editor"), {
      value: "// Builder output will appear here",
      language: "javascript",
      theme: "vs-dark",
      minimap: { enabled: false },
      fontFamily: "JetBrains Mono",
      fontSize: 14,
      automaticLayout: true,
    });
  });
}

initMonaco();

// Event handlers

elements.startBtn.addEventListener("click", async () => {
  const idea = elements.ideaInput.value.trim();
  if (!idea) {
    return;
  }
  try {
    await startProject(idea);
  } catch (error) {
    updateFlowStatus("error");
    showToast(error.message, true);
  }
});

elements.pauseBtn.addEventListener("click", () => {
  state.isPaused = !state.isPaused;
  elements.pauseBtn.classList.toggle("active", state.isPaused);
});

elements.autoBtn.addEventListener("click", () => {
  toggleAutoMode();
});

elements.approveBtn.addEventListener("click", async () => {
  if (state.isPaused) {
    return;
  }
  const approvedPlan = elements.planEditor.value.trim();
  try {
    await runTaskLoop(approvedPlan);
  } catch (error) {
    updateFlowStatus("error");
    showToast(error.message, true);
  }
});

elements.closeModal.addEventListener("click", () => toggleModal(false));

elements.addTaskBtn.addEventListener("click", addTaskLine);

elements.removeTaskBtn.addEventListener("click", removeTaskLine);

elements.feedbackBtn.addEventListener("click", async () => {
  try {
    const currentPlan = elements.planEditor.value.trim();
    if (!currentPlan) {
      showToast("Plan editor is empty.", true);
      return;
    }
    updateFlowStatus("architect_thinking");
    const response = await callArchitect(currentPlan);
    updateFlowStatus("plan_ready");
    elements.planEditor.value = response;
    showToast("Architect feedback added.");
  } catch (error) {
    updateFlowStatus("error");
    showToast(error.message, true);
  }
});

elements.architectSend.addEventListener("click", async () => {
  const message = elements.architectInput.value.trim();
  if (!message) {
    return;
  }
  elements.architectInput.value = "";
  await handleUserIntervention("architect", message);
});

elements.builderSend.addEventListener("click", async () => {
  const message = elements.builderInput.value.trim();
  if (!message) {
    return;
  }
  elements.builderInput.value = "";
  await handleUserIntervention("builder", message);
});

elements.architectModel.addEventListener("change", async (event) => {
  state.architectModel = event.target.value;
  await callApi("/api/switch-model", { panel: "architect", model: state.architectModel });
  showToast(`Architect model: ${state.architectModel}`);
});

elements.builderModel.addEventListener("change", async (event) => {
  state.builderModel = event.target.value;
  await callApi("/api/switch-model", { panel: "builder", model: state.builderModel });
  showToast(`Builder model: ${state.builderModel}`);
});

elements.newProjectBtn?.addEventListener("click", () => {
  state.conversationHistory = [];
  elements.architectChat.innerHTML = "";
  elements.builderChat.innerHTML = "";
  elements.taskList.innerHTML = "";
  elements.projectName.textContent = "No active project";
  hideProjectDecisionPanel();
  elements.ideaInput.placeholder = "Describe your project idea...";
  updateFlowStatus("ready");
  showToast("Session cleared.");
});

elements.finishBtn?.addEventListener("click", () => {
  hideProjectDecisionPanel();
  updateFlowStatus("all_done");
  showToast("🎉 Project marked complete!");
  addMessage(elements.architectChat, "Project complete. Well done!", "architect");
  updateMessageCount();
});

elements.addFeatureBtn?.addEventListener("click", () => {
  hideProjectDecisionPanel();
  elements.ideaInput.value = "";
  elements.ideaInput.placeholder = "Describe the new feature...";
  elements.ideaInput.focus();
  updateFlowStatus("ready", "Describe your next feature");
  showToast("Describe your new feature below");
});

elements.fixSomethingBtn?.addEventListener("click", () => {
  hideProjectDecisionPanel();
  elements.ideaInput.value = "";
  elements.ideaInput.placeholder = "What needs fixing or improving?";
  elements.ideaInput.focus();
  updateFlowStatus("ready", "Describe what to fix");
  showToast("Describe what to fix below");
});

elements.continueBtn?.addEventListener("click", async () => {
  hideProjectDecisionPanel();
  try {
    updateFlowStatus("architect_thinking");
    const nextPlan = await callArchitect(
      "Continue building the project. What should we add next?"
    );
    addMessage(elements.architectChat, nextPlan, "architect");
    updateMessageCount();
    elements.planEditor.value = nextPlan;
    toggleModal(true);
    updateFlowStatus("awaiting_approval");
  } catch (error) {
    updateFlowStatus("error");
    showToast(error.message, true);
  }
});

elements.saveSessionBtn?.addEventListener("click", () => {
  localStorage.setItem("kuralHistory", JSON.stringify(state.conversationHistory));
  showToast("Session saved to localStorage.");
});

calculateSessionHealth();
updateFlowStatus("ready", "Enter your project idea below");
