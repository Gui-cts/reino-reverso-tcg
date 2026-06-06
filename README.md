# Reino Reverso TCG

Protótipo jogável em navegador do card game **Reino Reverso** — fantasia/horror urbano, disputa de arenas e domínio territorial entre dois jogadores (hotseat no mesmo teclado).

Repositório: [github.com/Gui-cts/reino-reverso-tcg](https://github.com/Gui-cts/reino-reverso-tcg)

## Requisitos

- [Node.js](https://nodejs.org/) 18+

## Como rodar

```bash
npm install
npm run dev
```

Abra o endereço que o Vite mostrar (geralmente `http://localhost:5173`).

Build de produção:

```bash
npm run build
npm run preview
```

### 1v1 online (Vercel)

O modo online usa API serverless + polling. Em produção na Vercel você precisa de um **Redis** (ex.: integração Upstash no marketplace da Vercel) para as salas persistirem entre requisições.

1. Conecte um Redis/Upstash ao projeto na Vercel (variáveis `KV_REST_API_URL` e `KV_REST_API_TOKEN` são preenchidas automaticamente).
2. Faça deploy (`vercel` ou push no GitHub).
3. No menu, **Criar sala online** → copie o link e envie ao amigo.
4. O amigo abre o link ou usa **Entrar com código**.

Desenvolvimento local com API:

```bash
npm install -g vercel   # uma vez
npm run dev:online      # frontend + /api na mesma porta
```

Sem Redis, `vercel dev` ainda funciona para testar no mesmo computador (memória compartilhada no processo local).

Placeholders de arte das cartas:

```bash
node scripts/generate-card-placeholders.mjs
```

## O que o protótipo inclui

- **vs CPU** (Jogador 1): IA básica; mão da CPU oculta (verso com símbolo de olho)
- **1v1 online**: salas com código/link; mão do oponente oculta (requer Redis na Vercel)
- **Mundo Normal**: escolha de 2 arenas por jogador + neutra (Ruas de São Paulo)
- **8 arenas** com efeitos (Bar do João, Estação da Luz, Colégio Aurélio, etc.)
- Turno completo: preparação, compra, conquista, jogo, combate
- **Essência**, tropas na base/arena, combate alternado, conquista e dominação
- Vitória por **3 arenas dominadas** ou **Líder a 0 HP**
- Arrastar cartas (mão → base, tropas base ↔ arena, sacrifício ✦)
- Tropas derrotadas vão para o **descarte**

Regras detalhadas: [`GDD.md`](./GDD.md)

## Estrutura

| Pasta | Conteúdo |
|-------|----------|
| `src/game/` | Motor de regras (estado, ações, combate, conquista) |
| `src/ui/` | Interface hotseat |
| `public/data/cards.json` | Catálogo e deck inicial |
| `public/cards/` | Arte placeholder (SVG) |

## Licença

MIT — veja [LICENSE](./LICENSE).

## Roadmap

- Fases Abismo e Reino Reverso
- Magias, Corrupção gastável, carta Susej completa
- Multijogador / CPU
