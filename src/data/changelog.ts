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
