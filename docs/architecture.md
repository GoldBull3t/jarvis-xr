# JARVIS XR — Arquitetura de Sistema

## 1. Princípios de Design

1. **Determinismo Estrito:** O sistema não recorre a LLMs, modelos generativos probabilísticos ou APIs de IA externas. Todas as ações mapeiam padrões de intenção conhecidos para ações de API determinísticas e previsíveis.
2. **Segurança por Isolamento (BFF - Backend for Frontend):** O frontend (executado no headset Quest ou browser) nunca recebe tokens administrativos do Proxmox, Home Assistant ou credenciais de DNS. O backend FastAPI atua como guardião seguro e aplica validação rigorosa.
3. **Resiliência a Falhas:** A indisponibilidade de um serviço (ex.: Home Assistant a reiniciar ou Proxmox inacessível) não impede a inicialização ou o funcionamento dos restantes painéis.
4. **Contexto Seguro Nativo:** Toda a comunicação externa é encriptada por TLS (HTTPS/WSS) via Cosmos Cloud ou Caddy, requisito obrigatório para a WebXR Device API e captura de voz no Meta Quest Browser.
5. **Automação CI/CD:** O repositório integra compilação contínua via GitHub Actions para o GitHub Container Registry (`ghcr.io`), eliminando compilações locais pesadas.

---

## 2. Diagrama de Arquitetura

```text
[ Meta Quest 3S (Quest Browser) / Desktop ]
       │
       │  (HTTPS :443 / WSS)
       ▼
┌─────────────────────────────────────────────────────────────┐
│ Ingress / Reverse Proxy (Cosmos Cloud ou Caddy)             │
│  - Terminação TLS automática (Certificados Let's Encrypt)   │
│  - Headers de segurança WebXR (COOP: same-origin, COEP)    │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
     /api/*    │                              │  /* (Ficheiros estáticos SPA)
               ▼                              ▼
┌──────────────────────────────┐ ┌───────────────────────────┐
│ JARVIS Backend (FastAPI)     │ │ JARVIS Frontend (Nginx)   │
│  - Python 3.12 (User non-root│ │  - SPA Three.js + WebXR   │
│  - Pydantic v2 validation    │ │  - Hand Tracking 3D Mesh  │
│  - Token Bearer auth         │ │  - Mapeamento UV botões   │
│  - Adaptadores assíncronos   │ │  - Síntese vocal pt-PT    │
└──────────────┬───────────────┘ └───────────────────────────┘
               │
    ┌──────────┼───────────┬──────────────┬──────────────┐
    ▼          ▼           ▼              ▼              ▼
┌─────────┐ ┌─────────┐ ┌───────────────┐ ┌──────────┐ ┌──────────────────┐
│ Proxmox │ │ Home    │ │ Pi-hole /     │ │ Presence │ │ Healthchecker    │
│ VE API  │ │ Assist. │ │ AdGuard Home  │ │ Event    │ │ de Serviços HTTP │
│ (:8006) │ │ (:8123) │ │ (:80 / :3000) │ │ (HA Bus) │ │ (Allowlist)      │
└─────────┘ └─────────┘ └───────────────┘ └──────────┘ └──────────────────┘
```

---

## 3. Módulos e Componentes

### 3.1. Frontend 3D Espacial (Three.js & WebXR)
- **Modo Desktop:** Permite desenvolvimento e controlo através de rato e teclado com rotação suave e interface HUD tática 2D.
- **Modo WebXR (Meta Quest 3S):**
  - Sessão `immersive-ar` com fundo transparente (`alpha: true`), permitindo Passthrough a cores da divisão real.
  - Painéis tridimensionais dispostos em arco a distâncias ergonómicas (~1.8m à frente dos olhos do utilizador).
  - Suporte completo a **Hand Tracking** (malha 3D das mãos do utilizador e gesto de pinçar/pinch) e controladores Touch Plus (raio laser, gatilho e feedback háptico de 40ms).
  - **Mapeamento UV de Botões:** Os cliques espaciais no plano 3D calculam coordenadas `(u, v)` e acionam regiões de botões no canvas interno com flash tátil imediato.

### 3.2. Backend (FastAPI & Pydantic)
- **Descoberta Dinâmica por Etiquetas e Áreas:** O adaptador do Home Assistant descobre automaticamente entidades com a etiqueta `jarvis` ou nas áreas indicadas, eliminando a necessidade de configurar manualmente listas de IDs no `.env`.
- **Sensor de Presença em VR:** Notifica o Home Assistant (`POST /api/home/presence`) para disparar automações de iluminação real de sala quando o utilizador coloca o headset.
- **Ciclo de Vida Seguro de VMs Proxmox:** Suporta comandos de ligar (`start`), desligar limpo por ACPI (`shutdown`) e reiniciar (`reboot`) apenas para máquinas explicitamente autorizadas em `PROXMOX_ALLOWED_VMIDS`.
- **Telemetria de Armazenamento e Backups:** Sondagem de capacidade de pools ZFS/LVM/Ceph/NFS e estado da última tarefa de backup (`vzdump`).
- **Motor de Voz Determinístico:** Normalização fonética e linguística (remoção de acentos e stopwords) e correspondência estrita ou dinâmica de entidades sem recurso a LLMs.

### 3.3. Telemetria em Tempo Real sem Polling (SSE - Pilar 3)
- Canal unidirecional contínuo de baixa latência através do endpoint `/api/stream/events`.
- O backend monitoriza alterações de estado no Proxmox e no Home Assistant e emite eventos `event: telemetry` instantaneamente apenas quando o estado real dos dispositivos ou servidores se altera.
- Inclui batimentos cardíacos periódicos (*pings*) e reconexão automática resiliente ao desativar a suspensão do headset Meta Quest 3S.

### 3.4. Manipulação Espacial 3D & Vigilância (Pilar 2)
- **Agarrar e Reposicionar Painéis (*Spatial Dragging*):** O utilizador pode agarrar qualquer painel holográfico pelo cabeçalho ou utilizando o botão lateral de *Grip* e deslocá-lo livremente na sua sala física, mantendo a orientação voltada para os olhos.
- **Painel Holográfico de Câmara:** Carrega dinamicamente imagens instantâneas das câmaras de segurança autorizadas do Home Assistant, permitindo vigilância perimétrica no espaço virtual.

### 3.5. Central de Diagnóstico do Homelab (Pilar 4)
- Testes concorrentes de latência (ms) para todos os nós Proxmox, nós do Home Assistant, filtros DNS Shield e testes de resolução interna de nomes no gateway.
- Mecanismo transparente de auto-fallback: se a resolução do nome de domínio do Home Assistant falhar por DNS local temporário, o backend comuta instantaneamente para o IP de fallback (`HOME_ASSISTANT_FALLBACK_URL`).
