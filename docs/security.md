# JARVIS XR — Modelo de Segurança

A segurança é tratada como um requisito inegociável de nível empresarial no ecossistema JARVIS XR.

---

## 1. Princípios de Segurança

1. **Sem Execução Arbitrária de Comandos:**
   - O backend nunca disponibiliza endpoints que recebam scripts, comandos de terminal (`bash`, `sh`, `cmd`) ou URLs arbitrárias para consultar.
2. **Isolamento de Credenciais (Zero Leaks):**
   - Os tokens administrativos do Proxmox VE e do Home Assistant nunca são transmitidos para o frontend. Ficam confinados ao processo Python no contentor backend.
   - Nenhuma credencial ou segredo é registado nos logs da aplicação (`stdout`/`stderr`).
3. **Controlo Estrito de Entidades no Home Assistant:**
   - O JARVIS suporta dois modos de restrição:
     - **Por Etiquetas (*Labels*):** Apenas entidades explicitamente marcadas com a etiqueta `jarvis` no Home Assistant podem ser descobertas ou acionadas.
     - **Por Allowlist Manual:** Salvaguarda estrita através da variável `HOME_ASSISTANT_ALLOWED_ENTITIES`. Tentativas de acionar entidades não autorizadas devolvem estritamente `403 Forbidden`.
4. **Proteção de Máquinas Virtuais no Proxmox VE:**
   - **Allowlist de VMIDs:** Apenas as máquinas listadas em `PROXMOX_ALLOWED_VMIDS` podem receber ações de ciclo de vida. Todas as restantes são de leitura exclusiva.
   - **Encerramento Limpo (ACPI):** O comando de desligar recorre ao protocolo ACPI do sistema operativo convidado, evitando corrupção de dados ou corte forçado de energia.
   - **Confirmação Obrigatória:** Operações de paragem ou reinício exigem `confirmed: true`. Pedidos sem confirmação são rejeitados com pedido de validação ao utilizador.
5. **Proteção contra SSRF (Server-Side Request Forgery):**
   - As verificações de integridade HTTP de serviços do homelab ocorrem exclusivamente a partir de uma lista estática de URLs definidas em configuração (`HOMELAB_SERVICES`), rejeitando qualquer entrada dinâmica enviada pelo utilizador.
6. **Autenticação em Tempo Constante:**
   - A validação do token Bearer utiliza a função `secrets.compare_digest` do Python, prevenindo ataques de análise temporal (*timing attacks*).

---

## 2. Segmentação de Rede e Reverse Proxy

- **Cosmos Cloud Shield:** O Cosmos Cloud atua como gateway de entrada, aplicando proteção de taxa (*rate limiting*), certificados TLS válidos e isolamento de rede interna (`cosmos-network`).
- **Nenhum Contentor Exposto sem Proxy:** O `jarvis-backend` não publica portas para a LAN exterior. Apenas é contactado internamente pelo proxy reverso.
- **Acesso Limitado:** O JARVIS XR deve residir na LAN ou VLAN de gestão do homelab e nunca ser encaminhado (*port forwarding*) diretamente para a Internet pública sem uma VPN dedicada (ex.: WireGuard / Tailscale / Cloudflare Tunnel autenticado).

---

## 3. Gestão de Segredos & .env

- O ficheiro `.env` está explicitamente incluído no `.gitignore`.
- Foi fornecido um `.env.example` com valores fictícios e explicações de cada variável.
- Em caso de rotação de credenciais, basta alterar o ficheiro `.env` e reiniciar os contentores:
  ```bash
  docker compose up -d
  ```
