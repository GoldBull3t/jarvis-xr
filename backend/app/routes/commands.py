"""Módulo de execução determinística de comandos (Sem IA / Sem LLM)."""
import re
import unicodedata
from typing import List, Optional, Tuple
from fastapi import APIRouter, Depends
from app.security import verify_api_key
from app.integrations.homeassistant import ha_adapter
from app.schemas import (
    APIResponse,
    CommandDefinition,
    CommandExecuteRequest,
    CommandExecuteResult
)

router = APIRouter(tags=["Commands"])


def normalize_text(text: str) -> str:
    """
    Normaliza a frase de voz: minúsculas, remoção de acentos e pontuação.
    Garante correspondência determinística e robusta.
    """
    text = text.lower().strip()
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = re.sub(r"[^\w\s]", " ", text)
    tokens = text.split()
    # Remove palavras de preenchimento comuns
    stopwords = {"por", "favor", "o", "a", "os", "as", "de", "do", "da", "dos", "das", "um", "uma", "me", "nos"}
    cleaned_tokens = [t for t in tokens if t not in stopwords]
    return " ".join(cleaned_tokens if cleaned_tokens else tokens)


# Catálogo central de comandos determinísticos suportados
COMMAND_CATALOG: List[CommandDefinition] = [
    CommandDefinition(
        id="cmd_show_home",
        phrases=[
            "mostra casa",
            "abrir casa",
            "ver domotica",
            "estado casa",
            "painel casa",
            "mostrar casa",
            "abrir domotica"
        ],
        description="Abre o painel de domótica do Home Assistant",
        category="navigation"
    ),
    CommandDefinition(
        id="cmd_show_proxmox",
        phrases=[
            "mostra servidores",
            "qual e estado proxmox",
            "ver servidores",
            "estado servidores",
            "painel proxmox",
            "mostrar servidores",
            "abrir proxmox",
            "ver maquinas virtuais"
        ],
        description="Abre o painel de infraestrutura e virtualização Proxmox VE",
        category="navigation"
    ),
    CommandDefinition(
        id="cmd_show_network",
        phrases=[
            "mostra estado rede",
            "estado rede",
            "mostra estatisticas dns",
            "estatisticas dns",
            "painel rede",
            "ver pihole",
            "ver adguard",
            "mostrar rede"
        ],
        description="Abre o painel de estatísticas de rede e bloqueio DNS",
        category="navigation"
    ),
    CommandDefinition(
        id="cmd_show_services",
        phrases=[
            "mostra servicos",
            "ver servicos",
            "estado servicos",
            "painel servicos",
            "mostrar servicos",
            "disponibilidade servicos"
        ],
        description="Abre o painel de monitorização de disponibilidade de serviços",
        category="navigation"
    ),
    CommandDefinition(
        id="cmd_close_panels",
        phrases=[
            "fecha paineis",
            "fechar paineis",
            "esconder paineis",
            "limpar ecra",
            "voltar nucleo",
            "recolher paineis",
            "fechar tudo"
        ],
        description="Fecha todos os painéis holográficos e foca o núcleo central",
        category="navigation"
    ),
    CommandDefinition(
        id="cmd_system_status",
        phrases=[
            "estado sistema",
            "diagnostico sistema",
            "resumo homelab",
            "relatorio geral",
            "qual e estado geral"
        ],
        description="Consulta e apresenta o estado agregado de todo o ecossistema",
        category="system"
    ),
    CommandDefinition(
        id="cmd_refresh_data",
        phrases=[
            "atualiza dados",
            "atualizar dados",
            "recarregar metricas",
            "atualizar tudo",
            "sincronizar metricas"
        ],
        description="Recarrega as métricas dos serviços ativos",
        category="system"
    ),
    CommandDefinition(
        id="cmd_light_office_on",
        phrases=[
            "liga luz escritorio",
            "ligar luz escritorio",
            "acende luz escritorio",
            "acender luz escritorio"
        ],
        description="Liga a luz autorizada do escritório no Home Assistant",
        category="control",
        requires_confirmation=False
    ),
    CommandDefinition(
        id="cmd_light_office_off",
        phrases=[
            "desliga luz escritorio",
            "desligar luz escritorio",
            "apaga luz escritorio",
            "apagar luz escritorio"
        ],
        description="Desliga a luz autorizada do escritório no Home Assistant",
        category="control",
        requires_confirmation=False
    ),
    CommandDefinition(
        id="cmd_stop_listening",
        phrases=[
            "para ouvir",
            "parar escuta",
            "silencio",
            "cancelar",
            "fechar microfone",
            "terminar voz"
        ],
        description="Termina a escuta ativa de voz",
        category="system"
    )
]


def match_command_phrase(raw_text: str) -> Tuple[Optional[CommandDefinition], float]:
    """
    Encontra deterministamente o melhor comando correspondente.
    Calcula sobreposição exata de tokens sem recurso a modelos de linguagem probabilísticos.
    """
    normalized = normalize_text(raw_text)
    # Remove prefixo "jarvis" ou "o jarvis"
    normalized = re.sub(r"^(o\s+)?jarvis\s+", "", normalized).strip()

    best_match: Optional[CommandDefinition] = None
    best_score: float = 0.0

    input_tokens = set(normalized.split())

    for cmd in COMMAND_CATALOG:
        for phrase in cmd.phrases:
            phrase_norm = normalize_text(phrase)
            phrase_tokens = set(phrase_norm.split())

            # 1. Correspondência exata da string
            if phrase_norm == normalized:
                return cmd, 1.0

            # 2. Correspondência por subfrase contida
            if phrase_norm in normalized or normalized in phrase_norm:
                score = 0.85
                if score > best_score:
                    best_score = score
                    best_match = cmd

            # 3. Sobreposição de tokens (Jaccard similarity)
            if input_tokens and phrase_tokens:
                intersection = len(input_tokens.intersection(phrase_tokens))
                union = len(input_tokens.union(phrase_tokens))
                jaccard = intersection / union
                if jaccard >= 0.5 and jaccard > best_score:
                    best_score = jaccard
                    best_match = cmd

    return best_match, best_score


@router.get("/commands", response_model=APIResponse)
async def list_commands(_: str = Depends(verify_api_key)):
    """Lista o catálogo completo de comandos reconhecidos pelo JARVIS XR."""
    return APIResponse(status="ok", data=COMMAND_CATALOG)


@router.post("/commands/execute", response_model=APIResponse)
async def execute_command(
    request: CommandExecuteRequest,
    _: str = Depends(verify_api_key)
):
    """
    Executa deterministamente um comando por ID direto ou por frase falada reconhecida.
    NÃO utiliza IA nem gera respostas arbitrárias.
    """
    matched_cmd: Optional[CommandDefinition] = None

    if request.command_id:
        for cmd in COMMAND_CATALOG:
            if cmd.id == request.command_id:
                matched_cmd = cmd
                break
    elif request.raw_phrase:
        cmd, score = match_command_phrase(request.raw_phrase)
        if cmd and score >= 0.5:
            matched_cmd = cmd

    if not matched_cmd:
        return APIResponse(
            status="error",
            error="Comando não reconhecido. Consulte o catálogo de comandos disponíveis.",
            data={
                "spoken_feedback": "Comando não compreendido. A apresentar comandos disponíveis.",
                "ui_action": "show_help"
            }
        )

    # Execução das ações determinísticas mapeadas
    action_map = {
        "cmd_show_home": {
            "ui_action": "open_panel_home",
            "spoken": "A apresentar o painel de domótica.",
            "data": {"panel": "home"}
        },
        "cmd_show_proxmox": {
            "ui_action": "open_panel_proxmox",
            "spoken": "Servidores Proxmox carregados.",
            "data": {"panel": "proxmox"}
        },
        "cmd_show_network": {
            "ui_action": "open_panel_network",
            "spoken": "A apresentar o estado do escudo DNS e tráfego de rede.",
            "data": {"panel": "network"}
        },
        "cmd_show_services": {
            "ui_action": "open_panel_services",
            "spoken": "A carregar estado dos serviços locais.",
            "data": {"panel": "services"}
        },
        "cmd_close_panels": {
            "ui_action": "close_all_panels",
            "spoken": "Painéis recolhidos.",
            "data": {"panel": None}
        },
        "cmd_system_status": {
            "ui_action": "open_panel_home",
            "spoken": "Sistemas operacionais. Ligação ao servidor estabelecida.",
            "data": {"status": "ok"}
        },
        "cmd_refresh_data": {
            "ui_action": "refresh_data",
            "spoken": "Dados atualizados com sucesso.",
            "data": {"refreshed": True}
        },
        "cmd_light_office_on": {
            "ui_action": "action_light",
            "spoken": "A ligar a luz do escritório.",
            "data": {"entity_id": "light.escritorio", "state": "on"}
        },
        "cmd_light_office_off": {
            "ui_action": "action_light",
            "spoken": "A desligar a luz do escritório.",
            "data": {"entity_id": "light.escritorio", "state": "off"}
        },
        "cmd_stop_listening": {
            "ui_action": "stop_listening",
            "spoken": "Reconhecimento de voz desativado.",
            "data": {}
        }
    }

    result_spec = action_map.get(
        matched_cmd.id,
        {
            "ui_action": "none",
            "spoken": "Comando executado.",
            "data": {}
        }
    )

    # Execução real da integração com Home Assistant quando aplicável
    if matched_cmd.id in ["cmd_light_office_on", "cmd_light_office_off"]:
        target_entity = "light.escritorio"
        action = "on" if matched_cmd.id == "cmd_light_office_on" else "off"

        if ha_adapter.is_configured() and ha_adapter._is_entity_authorized(target_entity):
            ha_res = await ha_adapter.control_light(target_entity, action=action)
            if ha_res.success:
                state_pt = "ligada" if action == "on" else "desligada"
                result_spec["spoken"] = f"A luz do escritório foi {state_pt}."
                result_spec["data"] = {"entity_id": target_entity, "new_state": ha_res.new_state}
            else:
                result_spec["spoken"] = f"Não foi possível alterar a luz: {ha_res.message}."

    result = CommandExecuteResult(
        command_id=matched_cmd.id,
        action_executed=matched_cmd.description,
        spoken_feedback=result_spec["spoken"],
        ui_action=result_spec["ui_action"],
        data=result_spec["data"]
    )

    return APIResponse(status="ok", data=result)
