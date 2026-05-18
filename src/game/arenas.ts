import type { ArenaDefinition, ArenaEffectId, WorldPhase } from "./types";

/** Arenas jogáveis na fase Mundo Normal (inclui neutra). */
export const MUNDO_NORMAL_ARENAS: ArenaDefinition[] = [
  {
    id: "ruas-sao-paulo",
    name: "Ruas de São Paulo",
    neutral: true,
    phase: "mundo-normal",
    effect: "none",
    conquestPointsToDominate: 2,
    pickedBy: null,
  },
  {
    id: "bar-do-jao",
    name: "Bar do João",
    neutral: false,
    phase: "mundo-normal",
    effect: "no-magic",
    conquestPointsToDominate: 2,
    pickedBy: null,
  },
  {
    id: "estacao-da-luz",
    name: "Estação da Luz",
    neutral: false,
    phase: "mundo-normal",
    effect: "gargoyle-fill",
    conquestPointsToDominate: 2,
    pickedBy: null,
  },
  {
    id: "colegio-aurelio",
    name: "Colégio Aurélio de Camargo",
    neutral: false,
    phase: "mundo-normal",
    effect: "susej-on-dominate",
    conquestPointsToDominate: 2,
    pickedBy: null,
  },
  {
    id: "ringue-colecionador",
    name: "Ringue do Colecionador",
    neutral: false,
    phase: "mundo-normal",
    effect: "random-buff-on-combat",
    conquestPointsToDominate: 2,
    pickedBy: null,
  },
  {
    id: "mansao-omegas",
    name: "Mansão dos Omegas",
    neutral: false,
    phase: "mundo-normal",
    effect: "draw-two-on-dominate",
    conquestPointsToDominate: 2,
    pickedBy: null,
  },
  {
    id: "sanatorio-augustinho",
    name: "Sanatório São Augustinho",
    neutral: false,
    phase: "mundo-normal",
    effect: "ping-after-strike",
    conquestPointsToDominate: 2,
    pickedBy: null,
  },
  {
    id: "templo-sombras",
    name: "Templo das Sombras",
    neutral: false,
    phase: "mundo-normal",
    effect: "conquest-3-corruption",
    conquestPointsToDominate: 3,
    pickedBy: null,
  },
];

/** Reservado para fases futuras. */
export const ABISMO_ARENAS: ArenaDefinition[] = [];
export const REINO_REVERSO_ARENAS: ArenaDefinition[] = [];

export function arenasForPhase(phase: WorldPhase): ArenaDefinition[] {
  switch (phase) {
    case "mundo-normal":
      return MUNDO_NORMAL_ARENAS;
    case "abismo":
      return ABISMO_ARENAS;
    case "reino-reverso":
      return REINO_REVERSO_ARENAS;
  }
}

export function getArenaDefById(
  pool: ArenaDefinition[],
  id: string,
): ArenaDefinition | undefined {
  return pool.find((a) => a.id === id);
}

const EFFECT_LABELS: Record<ArenaEffectId, string> = {
  none: "Sem efeito",
  "no-magic": "Magias não podem ser usadas nesta arena",
  "gargoyle-fill": "Ao declarar combate: preenche vazios com Gárgulas 1/1",
  "susej-on-dominate": "Ao dominar: embaralha Susej no seu baralho (em breve)",
  "random-buff-on-combat": "Ao declarar combate: uma tropa aleatória +1/+1 permanente",
  "draw-two-on-dominate": "Ao dominar: compra 2 cartas",
  "ping-after-strike": "Após cada golpe de ataque: 1 de dano em todas as tropas na arena",
  "conquest-3-corruption": "Conquista com 3 pontos; ao dominar: +1 Corrupção",
};

export function describeArenaEffect(effect: ArenaEffectId): string {
  return EFFECT_LABELS[effect] ?? "";
}
