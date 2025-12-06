const actionButton = document.querySelector("#action-button");

async function triggerWorkflow() {
  if (!actionButton) return;

  actionButton.disabled = true;
  actionButton.setAttribute("aria-busy", "true");

  try {
    const response = await fetch("/run-workflow", { method: "POST" });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.success === false) {
      const message = data.message || data.error || data.stderr || `Erro HTTP ${response.status}`;
      console.error("Falha ao rodar add_contacts_to_workflow.js:", message);
      return;
    }

    console.log("add_contacts_to_workflow.js executado com sucesso:", data);
  } catch (error) {
    console.error("Erro ao chamar o script:", error);
  } finally {
    actionButton.disabled = false;
    actionButton.removeAttribute("aria-busy");
  }
}

if (actionButton) {
  actionButton.addEventListener("click", triggerWorkflow);
}

console.log("Projeto pronto. Edite src/main.js para começar.");
