#!/usr/bin/env bash
# ==============================================================================
# JARVIS XR — SCRIPT DE VALIDAÇÃO DE ESTADO E SERVIÇOS
# ==============================================================================

set -euo pipefail

echo "======================================================"
echo "    JARVIS XR — VALIDAÇÃO DO SISTEMA"
echo "======================================================"

if ! command -v docker >/dev/null 2>&1; then
    echo "[-] Erro: Docker não está instalado ou não está no PATH."
    exit 1
fi

echo "[1/4] A verificar contentores Docker..."
docker compose ps

echo -e "\n[2/4] A testar endpoint de saúde (/api/health) diretamente no backend..."
if docker compose exec -T jarvis-backend curl -fsS http://localhost:8000/api/health; then
    echo -e "\n[✓] Backend respondeu com sucesso ao healthcheck interno!"
else
    echo -e "\n[-] Falha ao contactar o backend diretamente."
    exit 1
fi

echo -e "\n[3/4] A testar endpoint de saúde via Proxy HTTPS..."
# -k para permitir testar com certificado CA local/internal
if curl -kfsS https://localhost/api/health > /dev/null 2>&1 || curl -fsS http://localhost/api/health > /dev/null 2>&1; then
    echo "[✓] Proxy reverso (Caddy) está a encaminhar corretamente para o backend!"
else
    echo "[!] Aviso: Não foi possível testar o proxy via localhost (verifique o DNS/domínio configurado)."
fi

echo -e "\n[4/4] A executar bateria de testes automatizados do backend..."
docker compose run --rm jarvis-backend pytest -v

echo -e "\n======================================================"
echo "    SISTEMA VALIDADO COM SUCESSO!"
echo "======================================================"

