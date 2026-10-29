# JARVIS XR — Arquitetura de Sistema

## 1. Princípios de Design

1. **Determinismo Estrito:** O sistema não recorre a LLMs, modelos generativos probabilísticos ou APIs de IA externas. Todas as ações mapeiam padrões de intenção conhecidos para ações de API previsíveis.
2. **Segurança por Isolamento (BFF - Backend for Frontend):** O frontend (executado no headset Quest ou browser) nunca recebe tokens administrativos do Proxmox, Home Assistant ou credenciais de DNS. O backend FastAPI atua como intermediário autenticado e aplica uma *allowlist* estrita.
3. **Resiliência a Falhas:** A indisponibilidade de um serviço (ex.: Home Assistant a reiniciar ou Proxmox inacessível) não impede a inicialização ou o funcionamento dos restantes painéis.
4. **Contexto Seguro Nativo:** Toda a comunicação externa é encriptada por TLS (HTTPS/WSS) via Caddy, requisito obrigatório para a WebXR Device API e captura de voz no Meta Quest Browser.

---

## 2. Diagrama de Blocos

```text
[ Meta Quest 3S (Quest Browser) / Desktop ]
       │
       │  (HTTPS :443 / WSS)
       ▼
┌─────────────────────────────────────────────────────────────┐
│ JARVIS Proxy (Caddy v2)                                     │
│  - Terminação TLS (DNS-01 ou CA interna)                    │
│  - Compressão gzip / zstd                                   │
│  - Headers de segurança WebXR (COOP, COEP)                 │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
     /api/*    │                              │  /*
               ▼                              ▼
┌──────────────────────────────┐ ┌───────────────────────────┐
│ JARVIS Backend (FastAPI)     │ │ JARVIS Frontend (Nginx)   │
│  - Python 3.12 (User non-root│ │  - SPA Three.js + WebXR   │
│  - Pydantic v2 validation    │ │  - TypeScript estático    │
│  - Token Bearer auth         │ │  - Interface HUD tática   │
│  - Adaptadores assíncronos   │ └───────────────────────────┘
└──────────────┬───────────────┘
               │
    ┌──────────┼───────────┬──────────────┐
    ▼          ▼           ▼              ▼
┌─────────┐ ┌─────────┐ ┌───────────────┐ ┌──────────────────┐
│ Proxmox │ │ Home    │ │ Pi-hole /     │ │ Healthchecker    │
│ VE API  │ │ Assist. │ │ AdGuard Home  │ │ de Serviços HTTP │
│ (:8006) │ │ (:8123) │ │ (:80 / :3000) │ │ (Allowlist)      │
└─────────┘ └─────────┘ └───────────────┘ └──────────────────┘
```

---

## 3. Componentes

### 3.1. Frontend 3D (Three.js & WebXR)
- **Modo Desktop:** Permite navegação através de drag com o rato e teclado, visualização de painéis e controlo por botões.
- **Modo WebXR (Meta Quest 3S):**
  - Sessão `immersive-ar` com fundo transparente (`alpha: true`), permitindo passthrough do ambiente real da divisão.
  - Painéis tridimensionais dispostos em arco a distâncias ergonómicas (~1.8m à frente dos olhos do utilizador).
  - Tracking das mãos e suporte a controladores Touch Plus.

### 3.2. Backend (FastAPI & Pydantic)
- **Normalização de Respostas:** Todas as respostas seguem a estrutura uniforme `{ "status": "ok"|"error", "data": ..., "error": ..., "timestamp": "..." }`.
- **Motor de Voz Determinístico:** Normalização de texto (remoção de acentos, pontuação e stopwords), correspondência de frases por catálogo pré-configurado e geração de respostas vocais curtas e claras.

