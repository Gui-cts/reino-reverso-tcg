const TUTORIAL_STEPS = [
  {
    title: "Essência",
    body: "Cartas com ✦ podem ir ao Espaço de Essência (sacrifício 1× por turno). Essência exausta paga custos; desvira na preparação.",
  },
  {
    title: "Tropas",
    body: "Jogue tropas na base (exaustas). Mova base ↔ arena para contestar. Máximo 3 por zona.",
  },
  {
    title: "Combate",
    body: "Declare combate numa arena com aliados e inimigos. Fase de magias → golpes alternados → tropas sobreviventes seguem as regras da fase.",
  },
  {
    title: "Conquista",
    body: "2 pontos de conquista dominam a arena (dano ao Líder inimigo). 3 domínios vencem o Mundo Normal; depois vêm Abismo e Reino Reverso.",
  },
  {
    title: "Feitiços",
    body: "Magias Turno só na fase principal. Combate/Rápidas reagem no combate. Feitiço pendente bloqueia outras ações até resolver ou passar.",
  },
] as const;

export function openTutorialModal(onClose?: () => void): void {
  const backdrop = document.createElement("div");
  backdrop.className = "tutorial-backdrop";

  const modal = document.createElement("div");
  modal.className = "tutorial-modal panel";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "tutorial-title");

  let step = 0;

  const title = document.createElement("h2");
  title.id = "tutorial-title";
  title.className = "tutorial-modal__title";

  const body = document.createElement("p");
  body.className = "tutorial-modal__body";

  const stepLabel = document.createElement("p");
  stepLabel.className = "tutorial-modal__step";

  const actions = document.createElement("div");
  actions.className = "tutorial-modal__actions";

  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "secondary";
  backBtn.textContent = "Anterior";

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.textContent = "Próximo";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "secondary";
  closeBtn.textContent = "Fechar";
  closeBtn.onclick = () => {
    backdrop.remove();
    onClose?.();
  };

  function paint(): void {
    const current = TUTORIAL_STEPS[step]!;
    title.textContent = current.title;
    body.textContent = current.body;
    stepLabel.textContent = `Passo ${step + 1} de ${TUTORIAL_STEPS.length}`;
    backBtn.disabled = step === 0;
    nextBtn.textContent = step === TUTORIAL_STEPS.length - 1 ? "Concluir" : "Próximo";
  }

  backBtn.onclick = () => {
    if (step > 0) {
      step--;
      paint();
    }
  };

  nextBtn.onclick = () => {
    if (step < TUTORIAL_STEPS.length - 1) {
      step++;
      paint();
    } else {
      backdrop.remove();
      onClose?.();
    }
  };

  backdrop.onclick = (e) => {
    if (e.target === backdrop) closeBtn.click();
  };

  actions.append(backBtn, nextBtn, closeBtn);
  modal.append(title, stepLabel, body, actions);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  paint();
  nextBtn.focus();
}
