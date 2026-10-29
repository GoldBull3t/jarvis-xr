# JARVIS XR — Modelo de Segurança

A segurança é tratada como um requisito inegociável de nível empresarial no ecossistema JARVIS XR.

---

## 1. Princípios de Segurança

1. **Sem Execução Arbitrária de Comandos:**
   - O backend nunca disponibiliza endpoints que recebam scripts, comandos de terminal (`bash`, `sh`, `cmd`) ou URLs arbitrárias para consultar.
2. **Isolamento de Credenciais (No Leaks):**
   - Os tokens administrativos do Proxmox VE e do Home Assistant nunca são transmitidos para o frontend. Ficam confinados ao processo Python no container backend.
   - Nenhuma credencial ou segredo é registado nos logs da aplicação (`stdout`/`stderr`).
3. **Allowlist Estrita de Entidades:**
   - Nem todas as entidades do Home Assistant podem ser acionadas. Apenas as explicitamente listadas na variável de ambiente `HOME_ASSISTANT_ALLOWED_ENTITIES` podem receber comandos.
4. **Proteção contra SSRF (Server-Side Request Forgery):**
   - As verificações de integridade HTTP de serviços do homelab ocorrem exclusivamente a partir de uma lista estática de URLs definidas em configuração (`HOMELAB_SERVICES`), rejeitando qualquer entrada dinâmica enviada pelo utilizador.
5. **Autenticação em Tempo Constante:**
   - A validação do token Bearer utiliza a função `secrets.compare_digest` do Python, prevenindo ataques de análise temporal (*timing attacks*).

---

## 2. Segmentação de Rede

- **Apenas Portas 80 e 443 Expostas:** Os contentores `jarvis-backend` e `jarvis-frontend` não publicam as suas portas na LAN. Apenas o contentor `jarvis-proxy` (Caddy) expõe as portas 80 e 443 à rede da VM.
- **Rede Interna Docker (`jarvis-net`):** Comunicação entre proxy, backend e frontend ocorre através de uma rede bridge isolada do Docker.
- **Acesso Limitado:** O JARVIS XR deve residir na LAN ou VLAN de gestão do homelab e nunca ser encaminhado (*port forwarding*) para a Internet pública sem uma VPN dedicada (ex.: WireGuard / Tailscale).

---

## 3. Gestão de Segredos & .env

- O ficheiro `.env` está explicitamente incluído no `.gitignore`.
- Foi fornecido um `.env.example` com valores fictícios e explicações de cada variável.
- Em caso de rotação de credenciais, basta alterar o ficheiro `.env` na VM e reiniciar os contentores:
  ```bash
  docker compose up -d
  ```

