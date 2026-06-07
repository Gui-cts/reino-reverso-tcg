# Deckbuilding — tipos, facções, líderes e custos

Documento de design alinhado ao código (`src/game/types.ts`, `public/data/cards.json`).

---

## Tipo da carta (`cardType`)

| Tipo | JSON | No jogo hoje |
|------|------|----------------|
| **Tropa** | `"troop"` | Convoca na base, move, combate |
| **Feitiço** | `"spell"` | Lança da mão (Encore, Pele, Omega, etc.) |
| **Equipamento** | `"equipment"` | *Em breve* — não entra no baralho ainda |
| **Artefato** | `"artifact"` | Jogável na base; efeito piloto: sacrificar tropa → +1 Corrupção |
| **Líder** | `"leader"` | Fora do baralho; define o deck e habilidades ativas |

Campo legado `cardKind` (`troop` | `spell`) ainda é aceito; na carga vira `cardType`.

---

## Facção (`faction`)

Cartas piloto incluem **`neutra`** e **`delta`** (facção do Noah e cartas associadas).  
Regra de deck: cartas de facção exigem Líder da mesma facção (`validateDeck` em `src/game/deck-rules.ts`).

---

## Líder

- Carta **fora do baralho** (`leaderId` no deckbuilder / menu do jogo).
- Fica ao lado do campo; **não** entra na mão nem no deck de 50.
- Cada Líder tem **`leaderMaxHp`** (Noah piloto: **10 HP**).
- **`leaderAbilityId`**: habilidade ativa implementada (Escudo, Cria do Inverno, Empatia, Melodia Arcana).
- **`leaderFormIds`**: formas evoluídas disponíveis na mão para evoluir.

### Evolução do Líder

Na **fase principal** (sem combate), gastar **5 Corrupção** e ter a carta da forma na mão → evoluir.

Formas do Noah (piloto):

1. **Noah — o pugilista** (`noah-lider-base`) — início  
2. **Noah — o vampiro inverno** — Cria do Inverno + vampirismo  
3. **Noah — o Delta da Empatia** — Empatia (Protetor + Escudo)

*Nota:* o protótipo exige a carta da forma na mão para evoluir (não só pagar Corrupção).

---

## Corrupção

| Fase | Teto |
|------|------|
| Mundo Normal | **5** |
| Abismo | **10** |
| Reino Reverso | sem limite |

Cartas e efeitos podem exigir Corrupção (`corruptionCost` no JSON). Evolução de Líder custa **5**.

---

## Capitã (`cardRole: "captain"`)

- Só **tropas** podem ser capitãs (feitiços não têm capitã).
- **Máximo 1 cópia** por baralho.
- Só entra no deck se o **`requiredLeaderId`** bater com o Líder escolhido.

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
- Cartas de facção exigem Líder da mesma facção  

O `starterDeck` é validado ao carregar `cards.json` (avisos no console se algo quebrar).

---

## Modos de jogo (referência)

| Modo | Deck |
|------|------|
| vs CPU / hotseat | `starterDeck` + Líder escolhido no menu |
| 1v1 online | Cada jogador escolhe Líder ao criar/entrar na sala |

---

## Próximos passos sugeridos

1. UI de deckbuilder (Líder + 40+ cartas + validação visual)  
2. Cartas capitã piloto  
3. Equipamentos (`equipment`)  
4. Mais Líderes e facções além de Delta  
5. Deck codes / importação exportação

---

Ver também: [`CARTAS.md`](CARTAS.md) · [`GDD.md`](GDD.md)
