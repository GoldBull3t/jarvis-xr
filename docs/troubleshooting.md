# JARVIS XR — Resolução de Problemas, Manutenção e Backup (Fase 7)

Este guia cobre a resolução de falhas comuns, procedimentos de backup e manutenção contínua da aplicação JARVIS XR.

---

## 1. Problemas Frequentes & Soluções

### 1.1. O botão "INICIAR SESSÃO AR" não aparece ou está desativado no Meta Quest 3S
- **Causa:** O browser não está num **Contexto Seguro** (`isSecureContext === false`). O WebXR exige obrigatoriamente `https://` com certificado válido ou `localhost`.
- **Solução:**
  1. Verifique se acedeu com `https://` e não `http://`.
  2. Se estiver a usar CA local do Caddy (`tls internal`), certifique-se de que o ficheiro `root.crt` foi importado nos certificados de confiança do Meta Quest 3S (**Definições > Segurança > Instalar certificados de CA**).
  3. Em alternativa, utilize um domínio próprio com DNS-01 Challenge (Let's Encrypt), que é 100% confiado de fábrica pelo Quest Browser.

### 1.2. O microfone não escuta ou devolve "not-allowed"
- **Causa:** O Quest Browser bloqueou a permissão de áudio para a origem HTTPS.
- **Solução:**
  1. No Meta Quest Browser, clique no ícone do cadeado à esquerda do URL.
  2. Altere a permissão de **Microfone** para **Permitir**.
  3. Recarregue a página.

### 1.3. Erro "Proxmox inacessível" ou HTTP 401/403
- **Causa:** Token ID ou Token Secret inválido, ou falta de permissões na role do Proxmox.
- **Solução:**
  1. Confirme no Proxmox VE se o utilizador `jarvis-monitoring@pve` tem a role `PVEAuditor` no caminho `/`.
  2. Se o Proxmox usa certificado autoassinado padrão, certifique-se de que `PROXMOX_VERIFY_SSL=false` no `.env`.
  3. Verifique se a porta `8006` não está bloqueada pelo Proxmox Firewall para o IP da VM do JARVIS XR.

### 1.4. Home Assistant: "Entidade não autorizada" (HTTP 403)
- **Causa:** Medida de segurança do JARVIS XR ativada. A entidade chamada não está na variável `HOME_ASSISTANT_ALLOWED_ENTITIES`.
- **Solução:**
  1. Edite o ficheiro `.env` na VM.
  2. Adicione o ID exato da entidade à lista (separado por vírgula):
     ```dotenv
     HOME_ASSISTANT_ALLOWED_ENTITIES=light.escritorio,switch.tomada_servidor,sensor.temperatura_escritorio,sua.nova_entidade
     ```
  3. Reinicie o backend: `docker compose restart jarvis-backend`.

---

## 2. Procedimento de Atualização

Para atualizar o JARVIS XR para uma nova versão sem perda de configurações:

```bash
cd /opt/jarvis-xr

# 1. Obter alterações do repositório Git
git pull origin main

# 2. Reconstruir as imagens e reiniciar os contentores
docker compose up -d --build

# 3. Validar a integridade dos serviços
bash deploy/scripts/validate.sh
```

---

## 3. Procedimento de Backup e Recuperação

### 3.1. O que deve ser salvaguardado:
1. O ficheiro de configuração e credenciais: `.env`
2. Os certificados e dados persistentes do Caddy: volume Docker `caddy_data`

### 3.2. Script de Backup Rápido:
```bash
#!/usr/bin/env bash
BACKUP_DIR="/opt/backups/jarvis-xr"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Cópia do .env
cp /opt/jarvis-xr/.env "$BACKUP_DIR/env_backup_$TIMESTAMP.env"

# Cópia dos certificados Caddy
docker run --rm \
  -v jarvis-xr_caddy_data:/data \
  -v "$BACKUP_DIR":/backup \
  alpine tar -czf "/backup/caddy_data_$TIMESTAMP.tar.gz" -C /data .

echo "[+] Backup concluído com sucesso em $BACKUP_DIR!"
```

### 3.3. Restauração:
```bash
# Restaurar .env
cp /opt/backups/jarvis-xr/env_backup_XXX.env /opt/jarvis-xr/.env

# Restaurar certificados Caddy
docker run --rm \
  -v jarvis-xr_caddy_data:/data \
  -v /opt/backups/jarvis-xr:/backup \
  alpine tar -xzf "/backup/caddy_data_XXX.tar.gz" -C /data
```

