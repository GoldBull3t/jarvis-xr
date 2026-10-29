#!/usr/bin/env bash
# ==============================================================================
# JARVIS XR — SCRIPT DE CONFIGURAÇÃO DA VM DEBIAN 12 (PROXMOX)
# Instalação segura do Docker Engine oficial, Compose v2 e utilitários.
# ==============================================================================

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
    echo "[-] Erro: Este script deve ser executado como root ou com sudo." >&2
    exit 1
fi

echo "[+] 1. A atualizar lista de pacotes do Debian 12..."
apt-get update -y
apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    jq \
    ufw

echo "[+] 2. A configurar o repositório oficial do Docker..."
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -y

echo "[+] 3. A instalar Docker Engine, CLI, Containerd e Docker Compose Plugin..."
apt-get install -y --no-install-recommends \
    docker-ce \
    docker-ce-cli \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin

echo "[+] 4. A ativar e iniciar o serviço Docker..."
systemctl enable --now docker

CURRENT_USER="${SUDO_USER:-$USER}"
if [ "$CURRENT_USER" != "root" ]; then
    echo "[+] A adicionar utilizador '$CURRENT_USER' ao grupo docker..."
    usermod -aG docker "$CURRENT_USER"
fi

echo "[+] 5. A configurar firewall mínima (UFW)..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'JARVIS HTTP (Redirect)'
ufw allow 443/tcp comment 'JARVIS HTTPS WebXR'
ufw --force enable

echo "[+] Instalação base concluída com sucesso!"
echo "[+] Por favor, faça logout e login novamente para aplicar permissões do Docker ao utilizador."

