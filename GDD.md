# Reino Reverso TCG — Game Design Document (GDD)

Documento de design consolidado para desenvolvimento.  
**Protótipo jogável:** `TcgPrototype` (Vite + TypeScript).

---

## 1. Visão geral

**Reino Reverso TCG** é um card game estratégico para **2 jogadores**, tema **fantasia / sobrenatural**. A partida não é um duelo linear de “bater no rosto”: o campo é dividido em **fases de mundo** e **controle de arenas**. O Líder não entra em combate direto na mesa (exceto regras futuras); ele representa a facção e sofre dano conforme o domínio territorial.

| Pilar | Descrição |
|-------|-----------|
| Território | Vencer disputas em arenas para avançar de fase |
| Economia | Essência (e depois Corrupção) para jogar cartas |
| Pressão | Líder com vida limitada; dano vem sobretudo de conquistas |
| Identidade | Cada Líder define facção e pool de cartas |

---

## 2. Estrutura da partida (macro)

A partida tem **3 grandes fases**, em sequência:

```mermaid
flowchart LR
  MN[Mundo Normal\nmelhor de 5 arenas] --> AB[Abismo\nmelhor de 3 arenas]
  AB --> RR[Reino Reverso\ncombate final]
```

| Fase | Arenas em jogo | Vitória da fase | Vantagem do vencedor |
|------|----------------|-----------------|----------------------|
| **Mundo Normal** | 5 (2 por jogador + 1 neutra) | Dominar **3** arenas | Escolhe **2** arenas do Abismo |
| **Abismo** | 3 simultâneas | Dominar **2** arenas | Escolhe a arena do Reino Reverso |
| **Reino Reverso** | 1 arena | Ver seção 8 | Quem venceu o Abismo **começa** |

**Fim da partida completa:** quando um **Líder chega a 0 de vida** (em qualquer momento em que dano se aplique ao Líder).

> Protótipo: **Mundo Normal → Abismo → Reino Reverso** com escolha pós-fase e draft de arenas.

---

## 3. Líder e baralho

### 3.1 Líder

- Carta **fora do campo** (não é tropa em zona).
- Tem **habilidade** própria (fora do v1).
- Define quais cartas de **facção** podem ir no baralho.
- Sofre dano conforme regras de cada fase (ver seção 7).

| Constante | Valor (protótipo v1) | Valor (jogo completo — sugestão) |
|-----------|----------------------|----------------------------------|
| Vida inicial | **3 HP** (partida curta só com MN) | 15–20 HP total ou por fase |

### 3.2 Baralho

| Regra | Valor |
|-------|--------|
| Tamanho mínimo | **40** cartas |
| Cópias por carta | Máximo **4** |
| Cartas de facção | Só com o Líder correspondente |
| Cartas neutras | Qualquer baralho |

### 3.3 Mulligan (início)

- Mão inicial: **5** cartas.
- **1 mulligan** por jogador por partida.
- Escolhe **quantas e quais** devolver; compra a **mesma quantidade** do baralho.

---

## 4. Zonas de jogo

| Zona | Função |
|------|--------|
| **Baralho** | Compra |
| **Mão** | Cartas jogáveis |
| **Base** | Zona segura; tropas entram exaustas ao ser convocadas |
| **Arena** | Combate e conquista; máx. 3 tropas por jogador |
| **Espaço de Essência** | Cartas convertidas/sacrificadas viram mana (exiladas, visíveis) |
| **Descarte** | Cartas destruídas / descartadas |

### 4.1 Movimento (tropas)

- Da **mão → base**: ao convocar; tropa entra **exausta**.
- **Base ↔ arena** apenas (não arena ↔ arena sem efeito).
- Qualquer movimento **exausta** a tropa.
- Na **preparação**, tropas e Essência **desviram** (deixam de estar exaustas).

### 4.2 Tropas presas

Quando um jogador **conquista** uma arena (2 pontos de conquista), as tropas que estavam nela na conquista ficam **presas** — não podem mais se mover.

---

## 5. Turno do jogador

Ordem das fases em cada turno:

```mermaid
flowchart LR
  P[Preparação\n desvirar] --> D[Compra\n +1 carta]
  D --> I[Início\n pontos de conquista]
  I --> J[Jogo\n cartas / mover / combater]
  J --> F[Fim de turno\n só quando declarar]
```

| Fase | O que acontece |
|------|----------------|
| **Preparação** | Desvira tropas e cartas de Essência exaustas |
| **Compra (Draw)** | Compra **1** carta do baralho |
| **Início** | Ganha pontos de conquista elegíveis; efeitos de início de turno (futuro) |
| **Jogo** | Alterna livremente: jogar cartas, mover, declarar combate. **Combate não encerra o turno** |
| **Fim de turno** | Só quando o jogador declara |

---

## 6. Economia — Essência

### 6.1 Essência (v1)

- Recurso principal para pagar custos.
- Cartas no **Espaço de Essência** não são descartadas ao pagar: ficam **exaustas (deitadas)**.
- Na **preparação** do dono, Essência exausta **desvira**.

### 6.2 Converter carta em Essência

- Algumas cartas têm símbolo **✦** (Essência).
- **1× por turno**: sacrificar da mão uma carta com ✦ → vai para o Espaço de Essência (+1 Essência disponível).
- Cada carta no Espaço conta como **1 ponto** de Essência para pagar custos.

### 6.3 Escolha pós-fase

Ao **vencer uma fase** (Mundo Normal ou Abismo), o vencedor escolhe o que fazer com as tropas nas arenas:

| Escolha | Efeito |
|---------|--------|
| **1 — Essência** | Destrói todas as tropas nas arenas; cada uma vira Essência (1 carta = 1 Essência) |
| **2 — Corrupção** | Destrói todas; gera Corrupção (**+1 por tropa**, máx. **+3** nesta escolha) |
| **3 — Reciclar** | Todas as cartas nas arenas voltam ao baralho e embaralham |

---

## 7. Combate

### 7.1 Declaração

- Declarado numa **arena** durante a fase de jogo.
- Requer tropas **dos dois** jogadores na mesma arena.
- Declarar combate numa arena **cancela** progresso de conquista pendente naquela arena (oponente atacou).
- Com tropas inimigas na mesma arena, **não é permitido encerrar o turno** sem declarar combate (em cada arena contestada).

### 7.2 Resolução

- Combate **até a morte** (não termina após um único golpe).
- Cada tropa pode **atacar uma vez por golpe** (só ataca no golpe em que seu jogador tem a vez).
- **Golpes alternados** entre jogadores (atacante → defensor → atacante…).
- Dentro de cada golpe: **um ataque por vez** — escolhe tropa → escolhe alvo → resolve na hora → próxima tropa.
- Em cada ataque, **alvo e atacante trocam dano no mesmo instante**; se o alvo morre, não revide em ataques seguintes contra ele.
- Várias tropas podem atacar o **mesmo** alvo em sequência (o segundo ataque só recebe revide se o alvo ainda estiver vivo).
- **Fim de turno bloqueado** se houver tropas inimigas na mesma arena: é obrigatório **declarar combate** primeiro.
- Efeitos futuros (ex.: **Taunt** / provocar) podem restringir a escolha de alvo.
- Entre golpes: efeitos “só em combate” (magias rápidas — futuro).
- Termina quando:
  - só restar tropas de **um** jogador, ou
  - **ambas** morrerem → arena fica sem tropas (neutra para presença).

### 7.3 Após combate

- Tropas mortas vão ao **descarte**.
- **Sobreviventes mantêm a vida atual** (não curam ao fim do combate); cura só por efeito de carta.
- No v1, **pontos de conquista em andamento não zeram** se ambos morrerem (ajuste de balanceamento futuro).

---

## 8. Conquista e dominação de arena

### 8.1 Pontos de conquista

Para ganhar **+1 ponto** em uma arena (no início do seu turno):

1. Você tem tropa aliada na arena.
2. No seu turno anterior, você **encerrou o turno** com ela lá (arena **sem** tropas inimigas).
3. No início do seu turno atual, a tropa **ainda está** na arena e **não há** tropas inimigas ali (arena não contestada).
4. O oponente pode ter **atacado** essa arena no turno dele; isso **não cancela** o ponto se você venceu o combate e manteve presença.

Com **2 pontos** na mesma arena → **conquista**.

### 8.2 Ao conquistar

- Arena fica **dominada por você** até o fim da **fase atual** (MN ou Abismo).
- **1 dano** no Líder inimigo (só no momento da conquista).
- Tropas presentes na conquista ficam **presas** na arena.
- **Nenhum jogador** pode enviar novas tropas para uma arena dominada (nem combater nela).

### 8.3 Empate / contestação

- Se houver tropa inimiga na arena, ela está **contestada** — não ganha ponto de conquista naquele ciclo.
- Combate é a forma de resolver presença inimiga.

### 8.4 Fim da fase (Mundo Normal / Abismo)

- Ao dominar **3** arenas (MN) ou **2** (Abismo), a fase **acaba na hora**.
- Aplica-se escolha pós-fase (seção 6.3); em seguida draft das arenas da próxima fase.

---

## 9. Reino Reverso

| Regra | Detalhe |
|-------|---------|
| Arenas | **1** arena escolhida pelo vencedor do Abismo |
| Dominação | **Não** há dominação permanente |
| Dano no Líder | Quem **vence o combate** na arena causa dano ao Líder inimigo |
| Tropas sobreviventes | Voltam automaticamente para a **base** do dono |
| Fluxo | Combates repetem até um Líder morrer |
| **Vácuo** | Se, no seu turno no RR, você não tiver **nenhuma** tropa na base → **1 dano passivo** no seu Líder |
| Iniciativa | Começa quem **venceu o Abismo** |

---

## 10. Arenas (Mundo Normal)

### 10.1 Setup

- Cada jogador escolhe **2** cartas de arena.
- **1 arena neutra** fixa entra sempre: *Ruas de São Paulo* (sem efeito).
- Total: **5** arenas no campo.
- Arenas do **Mundo Normal** só podem ser escolhidas na fase MN; **Abismo** e **Reino Reverso** terão pools próprios (futuro).

### 10.2 Arenas do Mundo Normal (protótipo)

| Arena | Efeito |
|-------|--------|
| **Ruas de São Paulo** | Neutra padrão — sem efeito |
| **Bar do João** | Magias não podem ser usadas nesta arena (flag ativa quando magias existirem) |
| **Estação da Luz** | Ao declarar combate: preenche espaços vazios de ambos os jogadores com tokens **Gárgula 1/1** |
| **Colégio Aurélio de Camargo** | Ao dominar: embaralha **Susej — o arauto da ignorância** no baralho (carta em desenvolvimento) |
| **Ringue do Colecionador** | Ao declarar combate: uma tropa aleatória na arena ganha **+1/+1 permanente** |
| **Mansão dos Omegas** | Ao dominar: compra **2** cartas |
| **Sanatório São Augustinho** | Após cada golpe de ataque: **1 de dano** em todas as tropas remanescentes na arena |
| **Templo das Sombras** | Conquista com **3** pontos; ao dominar: **+1 Corrupção** (máx. 3) |

### 10.3 Arenas do Abismo (protótipo)

| Arena | Efeito |
|-------|--------|
| **Fosso dos Ecos** | Sem efeito |
| **Cripta Subterrânea** | Após cada golpe: 1 de dano em todas as tropas na arena |
| **Labirinto de Sal** | Magias bloqueadas no combate |
| **Altar Profanado** | Conquista com 3 pontos; +1 Corrupção ao dominar |
| **Ponte Quebrada** | Ao declarar combate: tropa aleatória +1/+1 |
| **Covil de Vermes** | Ao dominar: compra 2 cartas |

Setup: vencedor da fase escolhe **2**, perdedor escolhe **1** (3 arenas ativas). Vitória da fase: **2** domínios.

### 10.4 Reino Reverso (protótipo)

| Arena | Uso |
|-------|-----|
| **Portal do Reino Reverso** | Combate final (sem dominação) |
| **Nexo Invertido** | Idem + magias bloqueadas no combate |

Vencedor do Abismo escolhe **1** arena e **começa** a fase.

---

## 11. Tipos de carta (roadmap)

| Tipo | Status |
|------|--------|
| **Tropa** | v1 — ataque, vida, custo em Essência; algumas com ✦ |
| **Magia** | Planejado (ex.: Pacto de Cobre, Colapso de Arena…) |
| **Artefato** | Planejado (ex.: Poço de Essência, Estandarte…) |
| **Equipamento** | Planejado (ex.: Espada do Noah, Canino de Gelo e Chamas…) |
| **Líder** | Fora do campo; define baralho |

Recursos planejados além de Essência: **Corrupção** (cartas mais agressivas).

---

## 12. Protótipo v1 — escopo implementado

Checklist do que o código atual cobre:

- [x] 2 jogadores local (hotseat)
- [x] Setup: escolha de 2 arenas + neutra
- [x] Mulligan parcial
- [x] Mão 5, deck 40, cópias no JSON
- [x] Turno: Preparação → Compra → Início → Jogo
- [x] Essência: converter ✦ (1×/turno), exaurir ao pagar, desvirar na preparação
- [x] Tropas: convocar na base, mover base↔arena, exaustão
- [x] Combate por rodadas até limpar arena
- [x] Conquista (2 pontos), dominação, dano ao Líder, tropas presas
- [x] Vitória: 3 domínios (MN) ou Líder a 0
- [x] UI: J2 mão acima da base; J1 base acima da mão
- [x] Efeitos de arena do Mundo Normal (8 cartas + neutra)
- [x] Corrupção rastreada (ganho no Templo das Sombras)
- [x] Tropas derrotadas vão ao descarte (removem do campo)
- [x] Transição MN → Abismo → Reino Reverso (vitória por domínios na fase)
- [x] Escolha pós-fase (Essência / Corrupção / Reciclar)
- [x] Draft de arenas do Abismo (vencedor 2 + perdedor 1) e RR (vencedor 1)
- [x] Reino Reverso: dano ao Líder ao vencer combate, tropas à base, vácuo
- [ ] Magias e gasto de Corrupção em cartas

Fora do protótipo atual:

- [ ] Magias, artefatos, equipamentos
- [ ] CPU / multiplayer online
- [ ] Validação estrita de baralho por Líder

### Como rodar

```bash
cd C:\Users\Guilherme\Desktop\Faculdade\projetos\TcgPrototype
npm install
npm run dev
```

Título da aba: **Reino Reverso TCG — Protótipo v1.1**

### Constantes no código

Arquivo `src/game/types.ts`:

- `LEADER_MAX_HP = 3`
- `MAX_TROOPS_PER_ZONE = 3`
- `INITIAL_HAND_SIZE = 5`
- `CARDS_DRAW_PER_TURN = 1`
- `DOMINATIONS_TO_WIN_PHASE = 3`

---

## 13. Referência rápida — fluxo de uma partida (MN)

1. Escolher arenas → mulligan → Jogador 1 começa.
2. No turno: desvirar → comprar 1 → checar conquistas → jogar (Essência / tropas / combate) → fim de turno.
3. Repetir até alguém dominar **3** arenas ou reduzir Líder a 0.
4. (Futuro) Escolha pós-fase → Abismo → Reino Reverso.

---

## 14. Glossário

| Termo | Significado |
|-------|-------------|
| **Exausta / deitada** | Não pode agir até a próxima preparação |
| **Contestada** | Há tropa inimiga na mesma arena |
| **Conquista** | 2 pontos de controle na arena |
| **Dominada** | Arena concede vitória de fase; tropas que conquistaram ficam presas |
| **Espaço de Essência** | Zona de mana; cartas exiladas, exaustas ao gastar |
| **✦** | Símbolo: carta pode ser convertida em Essência |

---

## 15. Histórico do documento

| Data | Nota |
|------|------|
| 2026-05 | GDD inicial consolidado a partir do design com o autor |

---

*Este documento é a fonte de verdade para regras de design. Ajustes de balanceamento devem atualizar este arquivo e as constantes em `types.ts`.*
