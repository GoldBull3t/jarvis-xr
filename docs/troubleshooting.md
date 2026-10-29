# JARVIS XR — Guia de Resolução de Problemas, Manutenção e Atualização

Este guia fornece soluções passo a passo para diagnósticos de rede, permissões, contentores no Cosmos Cloud, integração com o Proxmox VE, Home Assistant e headsets Meta Quest 3S.

---

## 1. Problemas no Cosmos Cloud & Contentores (GHCR)

### 1.1. Erro "ImagePullBackOff" ou "unauthorized / 403 Forbidden" ao descarregar do GHCR
- **Causa:** O repositório ou os pacotes no **GitHub Container Registry (`ghcr.io`)** foram criados com visibilidade **Privada** por omissão no seu GitHub pessoal (`GoldBull3t`).
- **Solução:**
  1. Aceda ao seu perfil do GitHub em `https://github.com/GoldBull3t?tab=packages`.
  2. Clique nos pacotes `jarvis-xr-backend` e `jarvis-xr-frontend`.
  3. No menu lateral direito, vá a **Package settings > Danger Zone > Change package visibility**.
  4. Altere a visibilidade para **Public**.
  5. No painel do **Cosmos Cloud**, clique em **Restart** ou force o download da imagem na ServApp.
  *(Em alternativa, se quiser manter os pacotes privados, adicione as suas credenciais do GitHub como Docker Registry Secret nas definições do Cosmos Cloud com um Personal Access Token com permissão `read:packages`).*

### 1.2. O frontend carrega, mas os painéis mostram "Erro de ligação ao backend" ou HTTP 502
- **Causa:** O contentor `jarvis-frontend` não consegue comunicar com o `jarvis-backend` através da rede interna do Docker.
- **Solução:**
  1. Verifique se ambos os contentores pertencem à mesma rede (por exemplo, `cosmos-network` ou a bridge gerada pelo Compose).
  2. No ficheiro `deploy/cosmos-compose.yml`, confirme que o serviço backend tem exatamente o nome `jarvis-backend`.
  3. O Nginx do frontend faz proxy de `/api/` internamente para `http://jarvis-backend:8000/api/`. Teste a conectividade na consola do contentor frontend:
     ```bash
     docker exec -it jarvis-frontend wget -qO- http://jarvis-backend:8000/api/health
     ```
  4. Se responder `{"status":"ok",...}`, a rede interna está operacional.

### 1.3. Como apontar o URL no Cosmos Cloud
- **Regra Importante:** No painel do Cosmos Cloud em **URLs > New URL**, aponte o tráfego **exclusivamente para o contentor `jarvis-frontend` na porta `80`**.
- O frontend Nginx trata de entregar os ficheiros estáticos 3D (`/`) e reencaminhar as chamadas da API (`/api/*`) para o backend de forma transparente e segura. Nunca exponha o `jarvis-backend` diretamente para a Web exterior sem autenticação.

---

## 2. Problemas no Meta Quest 3S & WebXR

### 2.1. O botão "INICIAR SESSÃO AR" não aparece ou está desativado
- **Causa:** O browser não está num **Contexto Seguro** (`window.isSecureContext === false`). A WebXR Device API é bloqueada pelo Chromium caso a página não seja acedida por `https://` com certificado válido ou via `localhost`.
- **Solução no Cosmos Cloud:**
  - Assegure-se de que configurou um domínio próprio com certificado Let's Encrypt gerado pelo Cosmos (ex.: `https://jarvis.meudominio.com`). O Quest Browser confia automaticamente nestes certificados de fábrica.
- **Solução com CA Local (Caddy):**
  - Se estiver a usar o Caddy com autoridade interna (`tls internal`), instale o certificado raiz (`root.crt`) no headset:
    1. Copie o certificado para a pasta de downloads do Quest via SideQuest ou ADB:
       ```bash
       adb push caddy-root.crt /sdcard/Download/
       ```
    2. No headset: **Definições > Segurança > Instalar certificados de CA** e selecione o ficheiro.

### 2.2. O microfone não escuta ou devolve "not-allowed"
- **Causa:** O Meta Quest Browser bloqueou a permissão de microfone para a origem HTTPS.
- **Solução:**
  1. Na barra de navegação do Meta Quest Browser, clique no ícone do cadeado à esquerda do URL.
  2. Altere a permissão de **Microfone** para **Permitir**.
  3. Recarregue a página (`Ctrl+R` ou botão de recarregar).
  4. Clique no botão de microfone ou execute o comando determinístico.

### 2.3. O Passthrough AR não mostra o mundo real (fundo preto)
- **Causa:** O headset iniciou a sessão em modo VR fechado ou a divisão física não tem iluminação suficiente para as câmaras de tracking do Quest 3S.
- **Solução:**
  1. Confirme que a sua área de jogo (*Boundary / Guardian*) está ativa e calibrada.
  2. Garanta que a divisão tem luz suficiente para os sensores de infravermelho e passthrough RGB.
  3. No código, o JARVIS XR inicializa com `alpha: true` e `clearColor(0x000000, 0)`. Verifique na consola remota se a sessão XR foi criada como `immersive-ar`.

---

## 3. Problemas com o Proxmox VE

### 3.1. Erro HTTP 401 / 403 "Proxmox inacessível" ou "Permissões insuficientes"
- **Causa:** Token ID ou Token Secret incorreto, ou falta de permissões de leitura no Proxmox.
- **Solução:**
  1. Confirme no Proxmox VE (**Datacenter > Permissions > Users**) se o utilizador `jarvis-monitoring@pve` existe.
  2. Confirme que o API Token tem **Privilege Separation: Ativado**.
  3. Em **Datacenter > Permissions**, adicione:
     - **Path:** `/`
     - **User / Token:** `jarvis-monitoring@pve!jarvis-token`
     - **Role:** `PVEAuditor` (para monitorização de CPU, RAM, VMs, Discos e Backups).

### 3.2. Ação de Ligar/Desligar VM falha com "VMID não autorizada" (HTTP 403)
- **Causa:** Mecanismo de segurança ativo. A VM solicitada não consta da variável `PROXMOX_ALLOWED_VMIDS`.
- **Solução:**
  1. No `.env` ou nas variáveis da ServApp no Cosmos Cloud, adicione o ID da VM à lista:
     ```dotenv
     PROXMOX_ALLOWED_VMIDS=100,101,102
     ```
  2. Reinicie o contentor backend.

### 3.3. Ação de Ligar/Desligar VM falha com "Permission check failed" no Proxmox
- **Causa:** A role `PVEAuditor` é estritamente de leitura. Para que o JARVIS possa ligar ou desligar uma máquina autorizada, o token necessita da permissão `VM.PowerMgmt`.
- **Solução:**
  1. No Proxmox VE, vá a **Datacenter > Permissions > Add > User Permission**.
  2. **Path:** `/vms/101` (apenas para a VM específica que deseja permitir, garantindo privilégio mínimo).
  3. **Role:** Crie uma nova role chamada `JarvisPowerRole` com a permissão `VM.PowerMgmt`, ou atribua a role existente com privilégio de ligar/desligar.

### 3.4. O comando de Shutdown não desliga a VM
- **Causa:** O comando utiliza o protocolo ACPI ordeiro para proteger o sistema de ficheiros da VM. Se a VM não tiver o agente de convidados instalado, o sistema operativo pode ignorar o sinal ACPI de encerramento.
- **Solução:**
  1. Dentro do sistema operativo da VM convidada, instale o QEMU Guest Agent:
     ```bash
     sudo apt install qemu-guest-agent -y
     sudo systemctl enable --now qemu-guest-agent
     ```
  2. Nas opções da VM no Proxmox VE, em **Options > QEMU Guest Agent**, confirme que está marcado como **Enabled**.

---

## 4. Problemas com o Home Assistant

### 4.1. As entidades não aparecem no painel do headset
- **Causa 1:** Está a utilizar a descoberta dinâmica por etiquetas, mas as entidades não têm a etiqueta `jarvis`.
- **Solução 1:**
  1. No Home Assistant, abra **Definições > Áreas e Etiquetas > Etiquetas**.
  2. Verifique se a etiqueta com ID `jarvis` existe.
  3. Vá à lista de dispositivos/entidades e associe a etiqueta `jarvis` às luzes ou interruptores pretendidos.
  4. No painel 3D do JARVIS, clique em **⟳ ATUALIZAR** ou diga *"JARVIS, atualiza os dados"*.
- **Causa 2:** Versão do Home Assistant anterior a 2024.4 (onde as etiquetas nativas foram introduzidas).
- **Solução 2:**
  - Utilize o modo manual configurando no `.env` / Cosmos Cloud:
    ```dotenv
    HOME_ASSISTANT_DISCOVERY_MODE=allowlist
    HOME_ASSISTANT_ALLOWED_ENTITIES=light.escritorio,switch.tomada_servidor
    ```

### 4.2. O sensor de presença `binary_sensor.jarvis_xr_active` não altera de estado
- **Causa:** O componente nativo não foi carregado ou a integração não está configurada no Home Assistant.
- **Solução:**
  1. Se instalou o componente nativo em `custom_components/jarvis_xr`, confirme que reiniciou o Home Assistant após copiar os ficheiros.
  2. Vá a **Definições > Dispositivos e Serviços** e verifique se a integração **JARVIS XR** aparece com sucesso.
  3. No menu **Ferramentas de Programação > Eventos**, subscreva o evento `jarvis_xr_presence` e coloque o headset para verificar se o evento é disparado em tempo real.

---

## 5. Procedimentos de Manutenção e Atualização

### 5.1. Atualização com Cosmos Cloud + GitHub Actions (Fluxo Recomendado)
Com este fluxo contínuo, nunca precisa de compilar nada manualmente no Proxmox ou no computador pessoal:
1. Faça alterações no seu computador pessoal e envie para o GitHub:
   ```powershell
   git add .
   git commit -m "melhoria: atualizacao de paineis"
   git push origin main
   ```
2. O **GitHub Actions** compila automaticamente o backend e o frontend em contentores otimizados e publica no `ghcr.io`.
3. No painel do **Cosmos Cloud**, clique na ServApp do JARVIS e selecione **Restart** (ou **Pull Latest Images**). O sistema atualiza em segundos sem interromper a sua rede.

### 5.2. Atualização Manual em VM Proxmox Dedicada
```bash
cd /opt/jarvis-xr

# 1. Obter alterações mais recentes
git pull origin main

# 2. Reconstruir contentores locais
docker compose up -d --build

# 3. Executar o script de teste de integridade
bash deploy/scripts/validate.sh
```

---

## 6. Procedimento de Salvaguarda (Backup) e Restauração

### 6.1. O que salvaguardar:
1. **Configuração de Ambiente:** Todas as chaves e tokens (`.env` ou o bloco de variáveis no Cosmos Cloud).
2. **Integração Home Assistant:** A pasta `custom_components/jarvis_xr` dentro da pasta de configuração do Home Assistant.
3. **Definição de Serviços:** O ficheiro `deploy/cosmos-compose.yml`.

### 6.2. Script de Backup Local Automático (para VM dedicada):
```bash
#!/usr/bin/env bash
BACKUP_DIR="/opt/backups/jarvis-xr"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Cópia do .env
cp /opt/jarvis-xr/.env "$BACKUP_DIR/env_backup_$TIMESTAMP.env"

# Cópia dos certificados Caddy (caso use Caddy)
if docker volume inspect jarvis-xr_caddy_data >/dev/null 2>&1; then
  docker run --rm \
    -v jarvis-xr_caddy_data:/data \
    -v "$BACKUP_DIR":/backup \
    alpine tar -czf "/backup/caddy_data_$TIMESTAMP.tar.gz" -C /data .
fi

echo "[+] Backup concluído com sucesso em $BACKUP_DIR!"
```
