# JARVIS XR — Configuração no Meta Quest 3S & WebXR (Fase 3)

Este documento orienta a ligação, calibração espacial e interação imersiva com os Meta Quest 3S utilizando o **Meta Quest Browser**.

---

## 1. Requisito Fundamental: Contexto Seguro (HTTPS)

O motor Chromium do Meta Quest Browser exige **HTTPS** para autorizar:
- `WebXR Device API` (`immersive-ar` / `immersive-vr`)
- `WebXR Hand Input API` (tracking articulado das mãos)
- `Web Speech API` (reconhecimento vocal por microfone)
- `getUserMedia` (acesso aos sensores de áudio)

### Opção A: Domínio Próprio com DNS-01 Challenge (Recomendada)
1. Associe um domínio ou subdomínio (ex.: `jarvis.meuhomelab.com`) ao IP local da VM (`192.168.1.150`) através do DNS local (Pi-hole, AdGuard ou `/etc/hosts`).
2. No Caddy, ative o módulo de DNS-01 (ex.: Cloudflare ou DuckDNS). O Caddy emitirá um certificado Let's Encrypt com chave pública globalmente reconhecida.
3. **Resultado:** O Quest 3S aceita a ligação imediatamente sem qualquer aviso ou configuração manual de certificados no headset.

### Opção B: CA Interna do Caddy (`tls internal`)
Se não utilizar um domínio externo:
1. O Caddy gera um certificado raiz em `/data/caddy/pki/authorities/local/root.crt` (dentro do volume Docker `caddy_data`).
2. Extraia o ficheiro:
   ```bash
   docker compose cp jarvis-proxy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt
   ```
3. Instale o certificado no Quest 3S:
   - Ligue o Quest ao PC via USB e use o ADB:
     ```bash
     adb push caddy-root.crt /sdcard/Download/
     ```
   - No headset: aceda a **Definições > Segurança > Instalar certificados de CA** e selecione o ficheiro.

---

## 2. Acesso à Interface e Calibração Espacial

1. Coloque os Meta Quest 3S e assegure-se de que a delimitação da divisão (*Boundary / Guardian*) está ativa.
2. Abra a aplicação **Meta Quest Browser**.
3. Na barra de endereço, introduza o endereço HTTPS configurado.
4. Clique no botão inferior **INICIAR SESSÃO AR (PASSTHROUGH)**.
5. Autorize as permissões de câmara e tracking de mãos quando solicitado.

---

## 3. Disposição Espacial dos Hologramas (Arco Ergonómico)

A interface JARVIS XR posiciona os elementos no espaço 3D real da sala:

- **Núcleo Central JARVIS:** Posição `(0, 0, -2.0m)` — Centro visual de telemetria, pulsação e estado do sistema.
- **Painel Domótica (Home Assistant):** Posição `(-1.4m, +0.05m, -1.8m)` rodado `+20°` para a linha de visão natural à esquerda.
- **Painel Virtualização (Proxmox VE):** Posição `(+1.4m, +0.05m, -1.8m)` rodado `-20°` à direita.
- **Painel Rede & DNS Shield:** Posição `(0.0m, +1.05m, -1.9m)` ligeiramente elevado ao centro.

---

## 4. Métodos de Interação na Fase 3

### 4.1. Hand Tracking (Mãos Virtuais 3D)
- O sistema utiliza a `XRHandModelFactory` para renderizar as mãos e articulações virtuais em tempo real.
- **Apontar:** O raio laser virtual (`Line3D` ciano) projeta-se a partir da mão dominante.
- **Gesto de Pinçar (Pinch):** Una a ponta do indicador com a ponta do polegar para acionar botões nos painéis holográficos.
- O retículo circular projeta-se com precisão sobre o ponto exato da superfície do painel.

### 4.2. Controladores Meta Quest Touch Plus
- **Gatilho (*Trigger*):** Seleciona ou prime botões nos painéis 3D.
- **Feedback Háptico:** O controlador emite uma vibração subtil de 40ms ao confirmar a seleção de botões ou interruptores.
- **Modelos 3D:** Os modelos dos comandos Touch Plus são renderizados via `XRControllerModelFactory`.

### 4.3. Mapeamento Interativo de Coordenadas UV
- Cada clique do laser calcula as coordenadas UV de interseção `(u, v)` no plano 3D.
- As coordenadas são convertidas em píxeis `(x, y)` no canvas interno do painel:
  - Botão fechar `[✕]`: recolhe o painel individual.
  - Botão `[💡 LUZ ESCRITÓRIO]`: alterna a entidade autorizada.
  - Botão `[⟳ ATUALIZAR MÉTRICAS]`: força um novo ciclo de telemetria com o backend.

---

## 5. Checklist de Aceitação da Fase 3

- [x] O browser deteta suporte a `immersive-ar` ou `immersive-vr` através de `navigator.xr.isSessionSupported()`.
- [x] O botão de entrada no modo XR atualiza o seu texto dinamicamente consoante as capacidades do headset.
- [x] Ao entrar em modo AR, o fundo torna-se transparente e o Passthrough a cores do Quest 3S exibe a sala real.
- [x] Os painéis 3D flutuam fixos a distâncias confortáveis (~1.8m), sem vibrações ou deriva visual.
- [x] O raio laser aponta e destaca áreas interativas dos painéis com retículo de colisão.
- [x] O gesto de pinçar (*pinch*) ou o gatilho dos comandos executa a ação correta no painel 3D.
- [x] Se o WebXR não for suportado (ex.: computador convencional), o modo Desktop mantém rotação por rato e botões 2D sem falhas.
