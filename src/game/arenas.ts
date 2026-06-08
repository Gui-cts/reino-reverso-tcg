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

/** Arenas do Abismo (pool de 4; vencedor escolhe 2, perdedor escolhe 1). */
export const ABISMO_ARENAS: ArenaDefinition[] = [
  {
    id: "armazem-colecionador",
    name: "Armazém do Colecionador",
    neutral: false,
    phase: "abismo",
    effect: "no-leave-by-move",
    conquestPointsToDominate: 2,
    pickedBy: null,
  },
  {
    id: "cidade-das-curvas",
    name: "Cidade das Curvas",
    neutral: false,
    phase: "abismo",
    effect: "random-combat-target",
    conquestPointsToDominate: 2,
    pickedBy: null,
  },
  {
    id: "prisao-conglomerado",
    name: "Prisão do Conglomerado",
    neutral: false,
    phase: "abismo",
    effect: "exile-on-death",
    conquestPointsToDominate: 2,
    pickedBy: null,
  },
  {
    id: "castelo-pedra-rubra",
    name: "Castelo de Pedra Rubra",
    neutral: false,
    phase: "abismo",
    effect: "spells-cost-less",
    conquestPointsToDominate: 2,
    pickedBy: null,
  },
];

/** Arenas do Reino Reverso (pool de 4; vencedor do Abismo escolhe 1). */
export const REINO_REVERSO_ARENAS: ArenaDefinition[] = [
  {
    id: "arena-reino-reverso",
    name: "Arena do Reino Reverso",
    neutral: true,
    phase: "reino-reverso",
    effect: "none",
    conquestPointsToDominate: 99,
    pickedBy: null,
  },
  {
    id: "vacuo-eterno",
    name: "Vácuo Eterno",
    neutral: false,
    phase: "reino-reverso",
    effect: "rr-vacuum-2",
    conquestPointsToDominate: 99,
    pickedBy: null,
  },
  {
    id: "salao-lordes",
    name: "Salão dos Lordes",
    neutral: false,
    phase: "reino-reverso",
    effect: "rr-mutual-wipe-leader-damage",
    conquestPointsToDominate: 99,
    pickedBy: null,
  },
  {
    id: "trono-negro",
    name: "Trono Negro",
    neutral: false,
    phase: "reino-reverso",
    effect: "rr-loser-only-vacuum",
    conquestPointsToDominate: 99,
    pickedBy: null,
  },
];

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
  "susej-on-dominate": "Ao dominar: embaralha Susej — o arauto da ignorância no seu baralho",
  "random-buff-on-combat": "Ao declarar combate: uma tropa aleatória +1/+1 permanente",
  "draw-two-on-dominate": "Ao dominar: compra 2 cartas",
  "ping-after-strike": "Após cada golpe de ataque: 1 de dano em todas as tropas na arena",
  "conquest-3-corruption": "Conquista com 3 pontos; ao dominar: +1 Corrupção",
  "no-leave-by-move":
    "Tropas nesta arena não podem sair pelo movimento normal (só por efeitos)",
  "random-combat-target": "Em combate aqui: alvo do ataque é aleatório",
  "exile-on-death": "Tropas que morrem nesta arena são exiladas (não vão ao descarte)",
  "spells-cost-less":
    "Magias que afetam esta arena custam 1 a menos (Essência e/ou Corrupção)",
  "rr-vacuum-2": "Vácuo: base vazia ao fim do combate = 2 de dano no Líder",
  "rr-mutual-wipe-leader-damage":
    "Se ambos zerarem a arena, cada Líder leva 1 de dano",
  "rr-loser-only-vacuum":
    "Só o perdedor do combate sofre Vácuo (base vazia ao fim do combate)",
};

export function describeArenaEffect(effect: ArenaEffectId): string {
  return EFFECT_LABELS[effect] ?? "";
}
