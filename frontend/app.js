const state = {
  currentProject: "",
  architectModel: "gemini",
  builderModel: "gemini",
  isAutoMode: false,
  isPaused: false,
  conversationHistory: [],
  taskList: [],
  currentTaskIndex: 0,
  sessionHealth: { architectAccuracy: 1, builderSuccess: 1 },
  isWaitingForApproval: false,
};

const API_BASE = (() => {
  if (window.location.port === "5000") {
    return "";
  }
  const host = window.location.host;
  let apiHost = host.replace(/:\d+$/, ":5000");
  if (host.includes("-3000.")) {
    apiHost = host.replace("-3000.", "-5000.");
  }
  return `${window.location.protocol}//${apiHost}`;
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
  planEditor: document.getElementById("plan-editor"),
  approveBtn: document.getElementById("approve-btn"),
  closeModal: document.getElementById("close-modal"),
  addTaskBtn: document.getElementById("add-task-btn"),
  removeTaskBtn: document.getElementById("remove-task-btn"),
  feedbackBtn: document.getElementById("feedback-btn"),
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
};

let editorInstance = null;

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
  const message = document.createElement("div");
  message.className = `message ${type}`;
  message.textContent = content;
  container.appendChild(message);
  container.scrollTop = container.scrollHeight;
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
    .filter((line) => line.trim().toLowerCase().startsWith("task"));
  state.taskList = tasks.map((task) => ({
    title: task.replace(/^task\s*\d+:/i, "").trim(),
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

async function callApi(path, payload) {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Request failed");
    }
    return response.json();
  } catch (error) {
    throw new Error(
      `Failed to fetch backend at ${API_BASE || "current host"}. Is the server running?`
    );
  }
}

async function callArchitect(message) {
  setStatus("architect", "Thinking");
  const data = await callApi("/api/architect", {
    message,
    history: state.conversationHistory,
  });
  state.conversationHistory = data.history;
  setStatus("architect", "Idle");
  return data.response;
}

async function callBuilder(message) {
  setStatus("builder", "Thinking");
  const data = await callApi("/api/builder", {
    message,
    history: state.conversationHistory,
  });
  state.conversationHistory = data.history;
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

  const plan = await callArchitect(idea);
  addMessage(elements.architectChat, plan, "architect");
  updateMessageCount();
  updateTaskList(plan);
  elements.planEditor.value = plan;
  toggleModal(true);
}

async function runTaskLoop(approvedPlan) {
  toggleModal(false);
  if (!approvedPlan) {
    return;
  }
  updateTaskList(approvedPlan);
  state.currentTaskIndex = 0;
  for (let i = 0; i < state.taskList.length; i += 1) {
    if (state.isPaused) {
      break;
    }
    updateTaskStatus(i, "in-progress");
    const taskInstruction = state.taskList[i].title;
    const builderResponse = await callBuilder(taskInstruction);
    addMessage(elements.builderChat, builderResponse.response, "builder");
    updateMessageCount();
    handleBuilderResponse(builderResponse);
    updateTaskStatus(i, "completed");

    if (!state.isAutoMode) {
      const nextTask = await callArchitect(builderResponse.response);
      addMessage(elements.architectChat, nextTask, "architect");
      updateMessageCount();
      elements.planEditor.value = nextTask;
      toggleModal(true);
      return;
    }

    const nextTask = await callArchitect(builderResponse.response);
    addMessage(elements.architectChat, nextTask, "architect");
    updateMessageCount();
  }
}

function handleBuilderResponse(builderData) {
  const blocks = builderData.codeBlocks?.length
    ? builderData.codeBlocks
    : extractCodeBlocks(builderData.response);
  if (!blocks.length) {
    return;
  }
  const selected = blocks[0];
  const language = detectLanguage(selected.code, selected.language);
  updateEditor(language, selected.code.trim());
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
    showToast(error.message, true);
  }
});

elements.closeModal.addEventListener("click", () => toggleModal(false));

elements.addTaskBtn.addEventListener("click", addTaskLine);

elements.removeTaskBtn.addEventListener("click", removeTaskLine);

elements.feedbackBtn.addEventListener("click", async () => {
  try {
    const response = await callArchitect(elements.planEditor.value.trim());
    elements.planEditor.value = response;
    showToast("Architect feedback added.");
  } catch (error) {
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
  showToast("Session cleared.");
});

elements.saveSessionBtn?.addEventListener("click", () => {
  localStorage.setItem("kuralHistory", JSON.stringify(state.conversationHistory));
  showToast("Session saved to localStorage.");
});

calculateSessionHealth();
