# Catálogo de cartas — Reino Reverso TCG

Referência das cartas definidas em [`public/data/cards.json`](public/data/cards.json).  
Atualizado conforme o protótipo em jogo (deck inicial: **60 cartas**).

**Metadados de deck:** tipo (`cardType`), facção (`faction`), líder, capitã e custos avançados — ver [`DECKBUILDING.md`](DECKBUILDING.md).

**Legenda:** ✦ = pode converter em Essência · **ATK|HP** = ataque | vida · **Facção** = todas as cartas jogáveis piloto são **neutra**

---

## Resumo

| Tipo | Quantidade no catálogo | No deck inicial (50) |
|------|------------------------|----------------------|
| Tropas neutras | 40 | 52 |
| Feitiços neutros | 11 | 8 |
| Token (não no deck) | 1 | — |
| Lenda / especial | 1 | — |
| Líder (fora do deck) | 1 | — |

O `starterDeck` tem **60** cartas (mínimo do jogo: 40, sem máximo). As cartas novas do catálogo estão disponíveis para testes/deckbuilder.

---

## Feitiços neutros (novos)

| Nome | Velocidade | Efeito |
|------|------------|--------|
| Compêndio do Vazio | **Turno** | Compre 2 cartas |
| Chamado das Tropas | **Turno** | Revele uma tropa do deck → mão |
| Revelação do Erudito | **Turno** | Revele um feitiço do deck → mão |
| Contramagia | Rápida | Oponente paga 2 essências exauridas ou o feitiço anula |
| Constrição | Combate | Prende inimigo; não ataca no próximo combate dele |
| Eterealidade | Combate | Aliado não pode ser alvo pontual neste turno |
| Omega | Combate | Exaurte 4 + sacrifique 1 essência + 1 Corrupção — destrói tropa inimiga |

**Velocidade Turno:** só na fase principal do seu turno (não no combate).

---

## Tropas neutras extras (20)

**Com palavra-chave (8):**

| Nome | Custo | ATK\|HP | Palavra-chave |
|------|-------|--------|----------------|
| Militante do Bosque | 1 | 2\|1 | Investida |
| Filho da Bruma | 1 | 2\|2 ✦ | Voar |
| Sentinela da Calha | 2 | 1\|3 | Protetor |
| Curandeiro Errante | 2 | 1\|4 ✦ | Testamento (compra 1 ao morrer) |
| Devorador de Ecos | 3 | 4\|2 | Fatiar |
| Espectro Menor | 4 | 3\|4 | Eco |
| Demolidor das Ruínas | 4 | 4\|3 | Vincular |
| Matriarca Silenciosa | 4 | 1\|6 | Silêncio |

**Só stats (12):** Servo das Cinzas, Arruaceiro Noturno, Bruto do Pátio, Arqueiro da Torre, Guarda do Penhasco, Sacerdotisa Neutra, Cavaleiro Desgastado, Abominação Lenta, Titã Partido, Fera de Estalar, Vigia do Crepúsculo, Colosso Rachado.

---

## Tropas — por custo (pool piloto)

### Custo 1

| Nome | ID | ATK\|HP | ✦ | Palavras-chave / efeito |
|------|-----|--------|---|-------------------------|
| Cinza Rastejante | `cinza-rastejante` | 1\|1 | ✦ | — |
| Fragmento do Poço | `fragmento-poco` | 1\|2 | ✦ | — |

### Custo 2

| Nome | ID | ATK\|HP | ✦ | Palavras-chave / efeito |
|------|-----|--------|---|-------------------------|
| Vigia do Reino Reverso | `vigia-reverso` | 1\|3 | — | — |
| Eco da Banshee | `eco-banshee` | 2\|2 | ✦ | — |
| Carniçal Incandescente | `carnical-incandescente` | 2\|1 | ✦ | — |
| Escudeiro do Pacto | `escudeiro-pacto` | 1\|3 | — | **Protetor** |
| Mensageiro Alado | `mensageiro-alado` | 2\|2 | ✦ | **Investida** |
| Último Suspiro | `ultimo-suspiro` | 2\|1 | — | **Testamento** — ao morrer: compra 1 |
| Vazio Antimágia | `vazio-antimagia` | 1\|4 | — | **Silêncio** |
| Falcão do Abismo | `falcao-abismo` | 2\|2 | ✦ | **Voar** |

### Custo 3

| Nome | ID | ATK\|HP | ✦ | Palavras-chave / efeito |
|------|-----|--------|---|-------------------------|
| Lâmina do Pacto | `lamina-pacto` | 3\|2 | — | — |
| Guardião do Estandarte | `guardiao-estandarte` | 2\|4 | — | — |
| Eco Persistente | `eco-persistente` | 2\|2 | — | **Eco** |
| Corrente Etérea | `corrente-eterea` | 3\|2 | — | **Vincular** |
| Muralha de Ossos | `muralha-ossos` | 1\|5 | — | **Protetor** + **Testamento** — ao morrer: 1 dano no Líder inimigo |
| Ceifador Laminar | `ceifador-laminar` | 3\|2 | — | **Fatiar** |

### Custo 4

| Nome | ID | ATK\|HP | ✦ | Palavras-chave / efeito |
|------|-----|--------|---|-------------------------|
| Flagelo de Cobre | `flagelo-cobre` | 4\|3 | — | — |
| Sombra do Erudito | `sombra-erudito` | 3\|4 | ✦ | — |

### Custo 5

| Nome | ID | ATK\|HP | ✦ | Palavras-chave / efeito |
|------|-----|--------|---|-------------------------|
| Colosso do Abismo | `colosso-abismo` | 5\|5 | — | — |

---

## Magias

| Nome | ID | Custo | Velocidade | Efeito |
|------|-----|-------|------------|--------|
| Encore | `encore` | 2 | Padrão | Se a tropa for atacada: atacante rola 1d6 — ímpar erra o golpe. |
| Pele de Ferro | `pele-ferro` | 2 | Padrão | Tropa aliada +2 de vida permanente. |
| Caldeirão de Sangue | `caldeirao-sangue` | 3 | Combate | Tropa inimiga na arena: 1d6 — par = 2 de dano. |
| Lufada de Vento | `lufada-vento` | 2 | Rápida | Tropa na arena (aliada ou inimiga) volta à base do dono, exausta. |

**Velocidades:** Padrão (turno + fase de magias) · Combate (só fases de magia no combate) · Rápida (quase a qualquer momento).

---

## Fora do deck inicial

| Nome | ID | Tipo | Notas |
|------|-----|------|--------|
| Gárgula | `token-gargula` | Tropa (token) | Arena Gárgulas de Pedra |
| Susej — o arauto da ignorância | `susej-arauto` | Tropa | Efeito de arena |
| Noah — o básico | `noah-lider-base` | **Líder** | 15 HP · formas futuras (inverno / delta) — ver DECKBUILDING |

---

## Deck inicial — cópias por carta

| Carta | Cópias |
|-------|--------|
| Cinza Rastejante | 3 |
| Fragmento do Poço | 4 |
| Vigia do Reino Reverso | 4 |
| Eco da Banshee | 4 |
| Lâmina do Pacto | 4 |
| Guardião do Estandarte | 4 |
| Flagelo de Cobre | 4 |
| Sombra do Erudito | 4 |
| Colosso do Abismo | 4 |
| Carniçal Incandescente | 4 |
| Encore | 2 |
| Pele de Ferro | 2 |
| Caldeirão de Sangue | 2 |
| Lufada de Vento | 2 |
| Escudeiro do Pacto | 2 |
| Mensageiro Alado | 2 |
| Último Suspiro | 1 |
| Eco Persistente | 1 |
| Corrente Etérea | 1 |
| Vazio Antimágia | 1 |
| Muralha de Ossos | 1 |
| Ceifador Laminar | 2 |
| Falcão do Abismo | 2 |
| **Total** | **60** |

---

## Palavras-chave (tropas)

| Palavra | Resumo |
|---------|--------|
| **Protetor** | Inimigos devem atacar Protetores na arena antes das outras tropas (magias ignoram). |
| **Investida** | Entra na base pronta para se mover (não exausta ao ser convocada). |
| **Testamento** | Efeito ao morrer; não conta como magia (Bar do João não bloqueia). |
| **Eco** | Ao morrer: uma tropa aliada na base fica pronta. |
| **Vincular** | Ao causar dano em combate: alvo não pode se mover no próximo turno dele. |
| **Silêncio** | Não pode receber Encore, Pele de Ferro ou outras magias presas. |
| **Fatiar** | Dano excedente ao eliminar um inimigo continua em outro inimigo legal na mesma arena (mesmo ataque). |
| **Voar** | Pode mover diretamente entre arenas; ao voar, fica exausta. |

Regras completas: [`GDD.md`](GDD.md) §11.4.

---

## Checklist rápido (só palavras-chave)

- **Protetor:** Escudeiro do Pacto, Muralha de Ossos  
- **Investida:** Mensageiro Alado  
- **Testamento:** Último Suspiro, Muralha de Ossos  
- **Eco:** Eco Persistente  
- **Vincular:** Corrente Etérea  
- **Silêncio:** Vazio Antimágia  
- **Fatiar:** Ceifador Laminar  
- **Voar:** Falcão do Abismo  

---

*Ao adicionar cartas novas, edite `public/data/cards.json` e atualize este arquivo.*
