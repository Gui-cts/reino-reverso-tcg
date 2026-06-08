/**
 * Novidades exibidas no menu — adicione uma entrada no topo a cada commit de feature/fix relevante.
 */
export type ChangelogEntry = {
  /** ISO date YYYY-MM-DD */
  date: string;
  title: string;
  summary: string;
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-05-19",
    title: "Decks base 50 cartas",
    summary:
      "Noah e Klaus com 50 cartas cada no preset; Klaus com 4× Contramagia como núcleo do controle arcano.",
  },
  {
    date: "2026-05-19",
    title: "Capitãs, assinaturas e decks",
    summary:
      "Sarah + Canino (Noah), Angelica + Monteiro (Klaus); decks base rebalanceados; Caldeirão Padrão (alvo na base); Resistência ao Vácuo no RR.",
  },
  {
    date: "2026-05-19",
    title: "Movimento de tropas — feedback",
    summary:
      "Ao não conseguir enviar tropa da base, o jogo explica o motivo (exausta, arena dominada, não é sua vez, feitiço pendente). Clique na tropa exausta para ver a dica.",
  },
  {
    date: "2026-05-19",
    title: "CPU no RR — golpe defensor",
    summary: "Corrigido travamento no golpe do defensor com Klaus Portador — Summoner não bloqueia mais o loop da CPU no combate.",
  },
  {
    date: "2026-05-19",
    title: "Klaus Portador e Susej",
    summary: "Summoner: sacrifique tropa aliada → fichas 1/1 na base (X = maior ATK/VIT; não ocupam vaga). Susej 6/6 com Aterrisagem — board wipe (5 Essência + 2 Corrupção).",
  },
  {
    date: "2026-05-19",
    title: "Escolha pós-fase",
    summary: "Corrigido bloqueio das opções Essência/Corrupção/Reciclar na transição MN → Abismo (feitiço pendente não trava mais).",
  },
  {
    date: "2026-05-19",
    title: "Testes e polish",
    summary: "Vitest (permissões, feitiços, combate); CPU mais esperta na Contramagia; banner de feitiço pendente, toasts e tutorial no menu.",
  },
  {
    date: "2026-05-19",
    title: "Feitiço pendente",
    summary: "Enquanto um feitiço da CPU aguarda resposta, só Contramagia ou Passar ficam disponíveis — o resto do jogo fica bloqueado.",
  },
  {
    date: "2026-05-19",
    title: "CPU no golpe de combate",
    summary: "Corrigido travamento no Golpe 1 — CPU prioriza ataques, encerra o golpe sem alvos legais e recupera o loop se uma ação falhar.",
  },
  {
    date: "2026-05-19",
    title: "Menu com abas",
    summary: "Navegação superior: Jogar, Decks, Testes e Conta; painel de novidades à direita.",
  },
  {
    date: "2026-05-19",
    title: "Contas de teste",
    summary: "Login só com nick (sem senha); deck personalizado salvo no Redis — até 5 contas.",
  },
  {
    date: "2026-05-19",
    title: "Online com baralhos",
    summary: "Quem cria e quem entra na sala escolhem preset Noah/Klaus ou deck personalizado.",
  },
  {
    date: "2026-05-19",
    title: "Artefatos e equipamentos",
    summary: "Cartas mostram o efeito no corpo; sem ataque/vida nos frames.",
  },
  {
    date: "2026-05-19",
    title: "Mini-cartas no deckbuilder",
    summary: "Corrigido texto apagado (custo, nome e descrição) nas grades do editor.",
  },
  {
    date: "2026-05-19",
    title: "Deckbuilder — layout",
    summary: "Grid alinhado, áreas de scroll dedicadas e busca sem sobrepor botões.",
  },
  {
    date: "2026-05-19",
    title: "Deckbuilder — catálogo",
    summary: "Filtros por tipo com ícones, busca por nome e preview ao passar o mouse.",
  },
  {
    date: "2026-05-18",
    title: "Deckbuilder piloto",
    summary: "Presets Noah/Klaus, deck custom com auto-save e integração com partida local.",
  },
  {
    date: "2026-05-18",
    title: "1v1 online",
    summary: "Salas com código, sincronização de partida e visão oculta da mão do oponente.",
  },
];

export function formatChangelogDate(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}
