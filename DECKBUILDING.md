# Deckbuilding — tipos, facções, líderes e custos

Documento de design alinhado ao código (`src/game/types.ts`, `public/data/cards.json`).

---

## Tipo da carta (`cardType`)

| Tipo | JSON | No jogo hoje |
|------|------|----------------|
| **Tropa** | `"troop"` | Convoca na base, move, combate |
| **Feitiço** | `"spell"` | Lança em tropa (Encore, Pele, etc.) |
| **Equipamento** | `"equipment"` | *Em breve* — não entra no baralho ainda |
| **Artefato** | `"artifact"` | *Em breve* |
| **Líder** | `"leader"` | Fora das 50 cartas; define o deck |

Campo legado `cardKind` (`troop` | `spell`) ainda é aceito; na carga vira `cardType`.

---

## Facção (`faction`)

Todas as cartas piloto usam **`neutra`**. Facções nomeadas (ex.: clãs, reinos) serão adicionadas depois para sinergias de deck.

---

## Líder

- Carta **fora do baralho** (`leaderId` no deckbuilder).
- Fica ao lado do campo; **não** entra na mão nem no deck de 50.
- Cada Líder tem **`leaderMaxHp`** (estratégia: tanque, agressivo, controle…).
- **`leaderAbility`**: texto da habilidade (implementação de batalha futura).
- **`leaderFormIds`**: formas evoluídas (ver abaixo) — só preparado no JSON.

### Evolução do Líder (futuro)

Exemplo Noah:

1. **Noah — o básico** (`noah-lider-base`) — início da partida  
2. **Noah, o vampiro inverno** — evolução por sacrifício de Corrupção  
3. **Noah, o Delta da Empatia** — outra linha evolutiva  

*Ainda não implementado no protótipo.*

Carta reservada no catálogo: `noah-lider-base` (não está no `starterDeck`).

---

## Capitã (`cardRole: "captain"`)

- Só **tropas** podem ser capitãs (feitiços não têm capitã).
- **Máximo 1 cópia** por baralho.
- Só entra no deck se o **`requiredLeaderId`** bater com o Líder escolhido.  
  Ex.: capitã da Sarah + Líder Noah → permitido no deckbuilder; com outro Líder → inválido.

*Nenhuma capitã piloto no JSON ainda — regras em `src/game/deck-rules.ts`.*

---

## Custo em Essência

### Custo simples

`cost: 2` → equivale a `essenceCost: { "exhaust": 2 }`  
Exaurte 2 fichas no Espaço de Essência (viram 90°).

### Custo avançado (progressão de poder)

```json
"cost": 4,
"essenceCost": {
  "exhaust": 3,
  "sacrifice": 1
}
```

1. Exaurte **3** essências (podem ser as que ainda estavam prontas).  
2. **Sacrifique 1** delas → vai para **`essenceDiscard`** (descarte de Essência), **não** para o descarte normal de cartas.  
3. Assim, efeitos que devolvem cartas do descarte **não** recuperam essência sacrificada.

O sacrifício pode ser uma das fichas **recém-exauridas**.

---

## Validação de baralho

`validateDeck({ leaderId, cardIds }, catalog)` em `src/game/deck-rules.ts`:

- Mínimo de **40** cartas (sem máximo)  
- Máx. **4** cópias por carta (1 para capitãs)  
- Líder não pode estar no baralho jogável  
- Capitã exige Líder compatível  

O `starterDeck` é validado ao carregar `cards.json` (avisos no console se algo quebrar).

---

## Próximos passos sugeridos

1. UI de deckbuilder (Líder + 50 cartas + validação)  
2. Cartas capitã + líderes jogáveis com HP/ability  
3. `equipment` / `artifact`  
4. Evolução de Líder gastando Corrupção  
5. Facções além de `neutra`

---

Ver também: [`CARTAS.md`](CARTAS.md) · [`GDD.md`](GDD.md)
