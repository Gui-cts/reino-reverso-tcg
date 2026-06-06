# Reino Reverso TCG — Livro de Regras

Bem-vindo ao **Reino Reverso**, um card game estratégico para 2 jogadores ambientado em um mundo de fantasia e horror urbano. Domine arenas, comande tropas e reduza a vida do Líder inimigo a zero para vencer!

---

## Como vencer

Reduza a vida do **Líder** adversário a **0 HP**. Isso acontece principalmente ao dominar arenas — cada conquista causa dano direto ao Líder inimigo.

---

## Seu Líder

Antes da partida, você escolhe um **Líder**. Ele fica fora do baralho e representa sua facção.

- Cada Líder tem **pontos de vida (HP)** — se chegar a 0, você perde.
- Cada Líder tem uma **habilidade ativa** (1 uso por turno).
- Cada Líder pode **evoluir** durante a partida gastando **5 Corrupção**, mudando para uma forma mais poderosa.

### Noah — o pugilista (facção Delta)

| Atributo | Valor |
|----------|-------|
| HP | 10 |
| Facção | Delta |
| Estilo | Tank / Proteção / Controle de terreno |
| **Habilidade: Escudo** | Durante o combate (1×/turno, custa **2 Essência**): proteja uma tropa aliada na arena. O escudo bloqueia o **próximo dano** que ela receber, independente da quantidade (1 ou 50). |
| Evoluções | Noah — o vampiro inverno · Noah — o Delta da Empatia |

### Noah — o vampiro inverno (forma evoluída)

| Atributo | Valor |
|----------|-------|
| HP | 10 |
| Facção | Delta |
| **Habilidade: Cria do Inverno** | Durante o combate (1×/turno, custa **2 Essência**): transforma uma tropa aliada na arena em **Cria do Inverno** (mantém stats, ganha comportamento de gelo). |
| **Congelar (ao atacar)** | Quando uma Cria do Inverno **ataca**, rola 1d6. Se **par**, o alvo fica com `attackSuppressed` (não pode atacar no próximo turno) — "congelado". |
| **Vampirismo (passiva)** | Após dano de combate, se a Cria causou dano e sobreviveu, cura HP igual ao dano causado (máx. HP original). |

### Noah — o Delta da Empatia (forma evoluída)

| Atributo | Valor |
|----------|-------|
| HP | 10 |
| Facção | Delta |
| **Habilidade: Empatia** | Combate ou fase principal (1×/turno, custa **1 Essência**): marca uma tropa aliada na arena com Empatia. A tropa ganha **Protetor** (deve ser atacada primeiro) e **Escudo** (bloqueia próximo dano). |
| **Empatia (passiva)** | Quando uma tropa com Empatia morre, todas as outras tropas aliadas na **mesma arena** ganham **+1/+1** permanente. |

### Evolução de Líder

Na **fase principal** do seu turno (sem combate ativo), se você tiver **5 Corrupção**, pode evoluí-lo para uma forma disponível. A evolução é **irreversível** na partida.

---

## Montando seu baralho

| Regra | Valor |
|-------|-------|
| Tamanho mínimo | **40 cartas** (sem máximo) |
| Cópias por carta | No máximo **4** |
| Líder | Fica **fora** do baralho |
| Cartas de facção | Só com o Líder da facção correspondente |
| Cartas neutras | Entram em qualquer baralho |

---

## Preparando a partida

1. **Escolha de arenas** — cada jogador escolhe 2 arenas. Uma arena neutra (*Ruas de São Paulo*) entra automaticamente, totalizando **5 arenas** no campo.
2. **Mão inicial** — compre **5 cartas** do baralho.
3. **Mulligan** — uma vez por partida, você pode devolver quantas cartas quiser da mão ao baralho e comprar a mesma quantidade de volta.
4. Jogador 1 começa.

---

## Zonas do campo

| Zona | O que é |
|------|---------|
| **Baralho** | Pilha de compra (não pode ver as cartas) |
| **Mão** | Cartas que você pode jogar |
| **Base** | Zona segura para suas tropas; máximo 3 tropas |
| **Arena** | Onde o combate e a conquista acontecem; máximo 3 tropas por jogador em cada arena |
| **Espaço de Essência** | Cartas sacrificadas que geram recurso (ficam visíveis) |
| **Descarte** | Cartas destruídas ou descartadas |

---

## Seu turno

Cada turno segue esta ordem:

### 1. Preparação

Todas as suas tropas e Essências **exaustas** (deitadas) ficam prontas novamente.

### 2. Compra

Compre **1 carta** do baralho. Se não puder comprar (baralho vazio), você **perde a partida**.

### 3. Início

Ganhe pontos de conquista nas arenas que você controla sozinho (veja *Conquista*).

### 4. Jogo (fase principal)

Na fase principal, você pode fazer qualquer combinação das ações abaixo, na ordem que quiser:

- **Converter Essência** — sacrifique 1 carta com ✦ da mão → vai para o Espaço de Essência (1 vez por turno)
- **Convocar tropas** — pague o custo em Essência e coloque a tropa na sua Base (ela entra exausta)
- **Mover tropas** — mova uma tropa pronta da Base para uma Arena, ou de uma Arena para a Base (ela fica exausta)
- **Lançar magias** — pague o custo e aplique o efeito em um alvo válido
- **Declarar combate** — inicie o combate em uma arena onde ambos os jogadores tenham tropas

### 5. Fim de turno

Declare o fim do turno quando terminar suas ações. Se houver tropas inimigas na mesma arena que as suas, você **deve** declarar combate antes de encerrar.

---

## Essência — o recurso do jogo

Essência é o recurso usado para pagar o custo de tropas e magias.

**Como gerar Essência:**
- Algumas cartas têm o símbolo **✦**. Uma vez por turno, você pode sacrificar uma carta ✦ da mão para o Espaço de Essência.
- Cada carta no Espaço de Essência vale **1 ponto** de recurso.

**Como pagar custos:**
- Para jogar uma carta de custo 3, por exemplo, exauste (deite) 3 cartas de Essência.
- Essências exaustas **não** são destruídas — elas voltam a ficar prontas na sua próxima Preparação.

**Dica:** sacrifique cartas ✦ baratas nos primeiros turnos para acumular Essência rapidamente!

---

## Tropas

Tropas são suas unidades de combate. Cada tropa tem:

- **Custo** — quantidade de Essência para convocá-la
- **Ataque (ATK)** — dano que causa em combate
- **Vida (HP)** — quanto dano aguenta antes de morrer

### Convocando

- Pague o custo em Essência.
- A tropa entra na sua **Base**, **exausta** (não pode agir neste turno).
- Máximo de **3 tropas** na Base.

### Movendo

- Tropas prontas podem se mover da **Base para uma Arena** ou de uma **Arena para a Base**.
- Mover uma tropa a **exausta**.
- Tropas não podem se mover diretamente de uma arena para outra (exceto com **Voar**).
- Máximo de **3 tropas** por jogador em cada arena.

### Exaustão

Uma tropa **exausta** (deitada) não pode agir — não ataca, não se move. Ela fica pronta de novo na sua próxima fase de Preparação.

---

## Combate

### Declarando combate

- Escolha uma arena onde **ambos os jogadores** tenham tropas.
- Se houver tropas inimigas em uma arena, o combate é **obrigatório** antes de encerrar o turno.

### Como funciona

1. **Fase de magias** — antes do primeiro golpe, ambos os jogadores podem lançar magias (Padrão, Combate ou Rápida). Ambos passam para iniciar o golpe.
2. **Golpe** — o atacante (quem declarou o combate) age primeiro:
   - Escolha **uma** de suas tropas para atacar.
   - Escolha **um alvo** inimigo (respeite Protetores — veja *Palavras-chave*).
   - O dano é **simultâneo**: sua tropa causa ATK de dano no alvo, e o alvo causa ATK de dano na sua tropa, **ao mesmo tempo**.
   - Se o alvo morrer, ele não revida em ataques seguintes.
   - Repita para cada tropa que ainda não atacou neste golpe.
3. **Fase de magias** — entre golpes, novo momento para magias.
4. **Próximo golpe** — agora é a vez do defensor atacar, seguindo as mesmas regras.
5. Os golpes se alternam até que **sobrem tropas de apenas um lado** (ou nenhum).

### Após o combate

- Tropas com 0 HP vão para o **descarte**.
- Tropas sobreviventes **mantêm a vida atual** (não curam automaticamente).

---

## Conquista e dominação

### Ganhando pontos de conquista

No **início do seu turno**, você ganha **+1 ponto de conquista** em uma arena se:

1. Você tem pelo menos 1 tropa nessa arena.
2. No turno anterior, você encerrou com tropa lá e **sem** tropas inimigas.
3. No início deste turno, sua tropa ainda está lá e continua **sem** tropas inimigas.

### Dominando uma arena

Com **2 pontos de conquista** na mesma arena, você a **domina**:

- O Líder inimigo recebe **1 de dano**.
- Suas tropas nessa arena ficam **presas** (não podem mais se mover).
- Ninguém pode enviar novas tropas para uma arena dominada.

### Vencendo a fase

- **Mundo Normal**: domine **3** arenas para vencer a fase.
- **Abismo**: domine **2** arenas.
- **Reino Reverso**: sem dominação — veja abaixo.

---

## Fases do mundo

A partida progride por três grandes fases:

### Mundo Normal

- **5 arenas** em jogo (2 de cada jogador + 1 neutra).
- Domine **3 arenas** para vencer a fase.
- O vencedor escolhe **2 arenas** para o Abismo.

### Abismo

- **3 arenas** em jogo (vencedor escolhe 2, perdedor escolhe 1).
- Domine **2 arenas** para vencer.
- O vencedor escolhe a arena do Reino Reverso e **começa** a fase final.

### Reino Reverso

A fase final é um **deathmatch** em uma única arena:

| Regra | Descrição |
|-------|-----------|
| Arenas | **1** arena |
| Dominação | Não existe |
| Vencer combate | Causa **1 de dano** no Líder inimigo |
| Tropas sobreviventes | **Destruídas** ao fim do combate |
| Vácuo | Se sua Base está vazia ao fim de um combate → **1 de dano** no seu Líder |
| Pressão | Se o oponente tem tropa na arena e você não, ao encerrar seu turno → **1 de dano** no seu Líder |

O jogo continua até um Líder chegar a **0 HP**.

### Escolha pós-fase

Ao terminar o Mundo Normal ou o Abismo, cada jogador escolhe o que fazer com suas tropas que restam nas arenas:

| Escolha | Efeito |
|---------|--------|
| **Essência** | Cada tropa vira 1 carta no seu Espaço de Essência |
| **Corrupção** | Tropas destruídas; você ganha +1 Corrupção por tropa (máx. +3) |
| **Reciclar** | Tropas voltam para o seu baralho |

---

## Magias

Magias são cartas de efeito único — ao ser lançada, a magia aplica seu efeito e vai para o descarte.

### Velocidades

| Velocidade | Quando pode lançar |
|------------|-------------------|
| **Turno** | Só na fase principal do seu turno |
| **Padrão** | Na fase principal do seu turno **ou** nas fases de magia do combate |
| **Combate** | **Somente** nas fases de magia do combate |
| **Rápida** | A qualquer momento (seu turno, turno do oponente, combate) |

### Contramagia

Ao lançar um feitiço, o oponente tem a chance de responder com **Contramagia**. Se contramagiado, o lançador pode pagar 2 essências exaustas para manter o feitiço, ou o feitiço é anulado.

---

## Palavras-chave

Algumas tropas possuem habilidades especiais identificadas por palavras-chave:

### Protetor
Inimigos **devem** atacar tropas com Protetor antes de poder atacar outras tropas na mesma arena. Magias ignoram Protetor.

### Investida
A tropa entra na Base **pronta** (não exausta), podendo se mover no mesmo turno em que foi convocada.

### Testamento
Quando esta tropa morre, um efeito especial é ativado (descrito na carta). Testamento **não** é uma magia — arenas que bloqueiam magias não bloqueiam Testamento.

### Eco
Quando esta tropa morre, uma tropa aliada na sua Base fica pronta imediatamente.

### Vincular
Quando esta tropa causa dano em combate, o alvo **não pode se mover** até a próxima Preparação do dono do alvo.

### Silêncio
Esta tropa não pode receber magias presas (como Encore ou Pele de Ferro).

### Fatiar
Se esta tropa elimina um inimigo e o dano excede a vida do alvo, o dano restante passa para **outro inimigo** válido na mesma arena (respeitando Protetor).

### Voar
Esta tropa pode se mover diretamente **entre arenas** (não apenas Base ↔ Arena). Ao voar, fica exausta.

---

## Corrupção

Corrupção é um recurso secundário usado por cartas mais poderosas. Você acumula Corrupção de duas formas:

- **Templo das Sombras** — ao dominar esta arena, ganha +1 Corrupção.
- **Escolha pós-fase** — ao escolher "Corrupção" no fim de uma fase, ganha +1 por tropa destruída (máx. +3).

O máximo de Corrupção depende da fase atual:

| Fase | Máximo |
|------|--------|
| Mundo Normal | **3** |
| Abismo | **7** |
| Reino Reverso | Sem limite |

Corrupção tem dois usos:
- **Custo de cartas** — algumas cartas exigem Corrupção além de Essência (ex.: Omega custa 4 Essência + sacrifício de 1 + 1 Corrupção).
- **Evolução do Líder** — gaste 5 Corrupção para evoluir seu Líder para uma forma mais poderosa.

---

## Arenas — efeitos especiais

Cada arena pode ter um efeito único que altera as regras dentro dela:

### Mundo Normal

| Arena | Efeito |
|-------|--------|
| **Ruas de São Paulo** | Sem efeito (neutra) |
| **Bar do João** | Magias não podem ser usadas nesta arena |
| **Estação da Luz** | Ao declarar combate: espaços vazios são preenchidos com Gárgulas 1/1 |
| **Colégio Aurélio de Camargo** | Ao dominar: embaralha uma carta especial no seu baralho |
| **Ringue do Colecionador** | Ao declarar combate: uma tropa aleatória ganha +1/+1 permanente |
| **Mansão dos Omegas** | Ao dominar: compre 2 cartas |
| **Sanatório São Augustinho** | Ao fim de cada golpe: 1 de dano em todas as tropas na arena |
| **Templo das Sombras** | Precisa de **3** pontos para conquistar; ao dominar: +1 Corrupção |

### Abismo

| Arena | Efeito |
|-------|--------|
| **Armazém do Colecionador** | Tropas não podem sair desta arena por movimento normal |
| **Cidade das Curvas** | O alvo do ataque em combate é **aleatório** |
| **Prisão do Conglomerado** | Tropas que morrem aqui são **exiladas** (não vão ao descarte) |
| **Castelo de Pedra Rubra** | Magias que afetam esta arena custam 1 Essência a menos |

### Reino Reverso

| Arena | Efeito |
|-------|--------|
| **Arena do Reino Reverso** | Deathmatch padrão (sem efeito adicional) |
| **Vácuo Eterno** | Vácuo causa **2 de dano** em vez de 1 |
| **Salão dos Lordes** | Se ambos ficam sem tropas na arena, **cada** Líder leva 1 de dano |
| **Trono Negro** | Só o **perdedor** do combate sofre Vácuo |

---

## Referência rápida — fluxo de um turno

```
Preparação → Compra → Início (conquistas) → Jogo → Fim de turno
```

No **Jogo**, faça o que quiser:
1. Sacrifique ✦ para Essência (1× por turno)
2. Convoque tropas na Base
3. Mova tropas para arenas
4. Lance magias
5. Declare combate (obrigatório se arena contestada)
6. Encerre o turno

---

## Glossário

| Termo | Significado |
|-------|-------------|
| **Exausta** | Carta deitada; não pode agir até a próxima Preparação |
| **Pronta** | Carta em pé; pode agir |
| **Contestada** | Arena com tropas de ambos os jogadores |
| **Conquista** | 2 pontos de controle acumulados em uma arena |
| **Dominação** | Arena conquistada; concede dano ao Líder inimigo e conta para vitória da fase |
| **Presa** | Tropa que participou de uma conquista; não pode mais se mover |
| **✦** | Símbolo que indica que a carta pode ser convertida em Essência |
| **Vácuo** | Dano ao Líder no Reino Reverso se sua Base estiver vazia após combate |
| **Corrupção** | Recurso secundário para cartas poderosas (máx. 3) |
