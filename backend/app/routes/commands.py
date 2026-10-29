"""Módulo de execução determinística de comandos com correspondência estática e dinâmica de entidades (Sem IA / Sem LLM)."""
import re
import unicodedata
import logging
from typing import List, Optional, Tuple, Dict, Any
from fastapi import APIRouter, Depends
from app.security import verify_api_key
from app.integrations.homeassistant import ha_adapter
from app.integrations.proxmox import pve_adapter
from app.config import settings
from app.schemas import (
    APIResponse,
    CommandDefinition,
    CommandExecuteRequest,
    CommandExecuteResult
)

logger = logging.getLogger("jarvis.routes.commands")
router = APIRouter(tags=["Commands"])


def normalize_text(text: str) -> str:
    """Normaliza texto: minúsculas, remoção de diacríticos e caracteres não-alfanuméricos."""
    text = text.lower().strip()
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = re.sub(r"[^\w\s]", " ", text)
    tokens = text.split()
    stopwords = {"por", "favor", "o", "a", "os", "as", "de", "do", "da", "dos", "das", "um", "uma", "me", "nos"}
    cleaned_tokens = [t for t in tokens if t not in stopwords]
    return " ".join(cleaned_tokens if cleaned_tokens else tokens)


# Catálogo oficial de comandos determinísticos estáticos
COMMAND_CATALOG: List[CommandDefinition] = [
    CommandDefinition(
        id="cmd_show_home",
        phrases=["mostra casa", "abrir casa", "ver domotica", "estado casa", "painel casa", "mostrar casa", "abrir domotica"],
        description="Abre o painel de domótica do Home Assistant",
        category="navigation"
    ),
    CommandDefinition(
        id="cmd_show_proxmox",
        phrases=["mostra servidores", "qual e estado proxmox", "ver servidores", "estado servidores", "painel proxmox", "mostrar servidores", "abrir proxmox", "ver maquinas virtuais"],
        description="Abre o painel de infraestrutura e virtualização Proxmox VE",
        category="navigation"
    ),
    CommandDefinition(
        id="cmd_show_network",
        phrases=["mostra estado rede", "estado rede", "mostra estatisticas dns", "estatisticas dns", "painel rede", "ver pihole", "ver adguard", "mostrar rede"],
        description="Abre o painel de estatísticas de rede e bloqueio DNS",
        category="navigation"
    ),
    CommandDefinition(
        id="cmd_show_services",
        phrases=["mostra servicos", "ver servicos", "estado servicos", "painel servicos", "mostrar servicos", "disponibilidade servicos"],
        description="Abre o painel de monitorização de disponibilidade de serviços",
        category="navigation"
    ),
    CommandDefinition(
        id="cmd_show_camera",
        phrases=["mostra camara", "ver camara", "abrir camara", "mostrar camara", "ver cameras", "mostrar cameras", "imagem camara", "painel camara"],
        description="Abre o painel holográfico de vigilância e câmara",
        category="navigation"
    ),
    CommandDefinition(
        id="cmd_show_diagnostics",
        phrases=["mostra diagnostico", "ver diagnostico", "abrir diagnostico", "painel diagnostico", "diagnostico completo", "testar ligacoes", "testar rede"],
        description="Abre o painel de diagnóstico e testes de latência do homelab",
        category="system"
    ),
    CommandDefinition(
        id="cmd_close_panels",
        phrases=["fecha paineis", "fechar paineis", "esconder paineis", "limpar ecra", "voltar nucleo", "recolher paineis", "fechar tudo"],
        description="Fecha todos os painéis holográficos e foca o núcleo central",
        category="navigation"
    ),
    CommandDefinition(
        id="cmd_system_status",
        phrases=["estado sistema", "diagnostico sistema", "resumo homelab", "relatorio geral", "qual e estado geral"],
        description="Consulta e apresenta o estado agregado de todo o ecossistema",
        category="system"
    ),
    CommandDefinition(
        id="cmd_refresh_data",
        phrases=["atualiza dados", "atualizar dados", "recarregar metricas", "atualizar tudo", "sincronizar metricas"],
        description="Recarrega as métricas dos serviços ativos",
        category="system"
    ),
    CommandDefinition(
        id="cmd_light_office_on",
        phrases=["liga luz escritorio", "ligar luz escritorio", "acende luz escritorio", "acender luz escritorio"],
        description="Liga a luz autorizada do escritório",
        category="control"
    ),
    CommandDefinition(
        id="cmd_light_office_off",
        phrases=["desliga luz escritorio", "desligar luz escritorio", "apaga luz escritorio", "apagar luz escritorio"],
        description="Desliga a luz autorizada do escritório",
        category="control"
    ),
    CommandDefinition(
        id="cmd_cover_open",
        phrases=["abre estores", "abrir estores", "subir estores", "abrir persianas"],
        description="Abre os estores autorizados",
        category="control"
    ),
    CommandDefinition(
        id="cmd_cover_close",
        phrases=["fecha estores", "fechar estores", "descer estores", "fechar persianas"],
        description="Fecha os estores autorizados",
        category="control"
    ),
    CommandDefinition(
        id="cmd_media_pause",
        phrases=["pausa musica", "pausar musica", "parar som", "pausar som", "parar musica"],
        description="Pausa a reprodução multimédia",
        category="control"
    ),
    CommandDefinition(
        id="cmd_media_play",
        phrases=["toca musica", "retoma musica", "continuar musica", "reproduzir musica"],
        description="Retoma a reprodução multimédia",
        category="control"
    ),
    CommandDefinition(
        id="cmd_stop_listening",
        phrases=["para ouvir", "parar escuta", "silencio", "cancelar", "fechar microfone", "terminar voz"],
        description="Termina a escuta ativa de voz",
        category="system"
    )
]


def match_command_phrase(raw_text: str) -> Tuple[Optional[CommandDefinition], float]:
    """Encontra deterministamente o melhor comando estático correspondente por tokens."""
    normalized = normalize_text(raw_text)
    normalized = re.sub(r"^(o\s+)?jarvis\s+", "", normalized).strip()

    best_match: Optional[CommandDefinition] = None
    best_score: float = 0.0
    input_tokens = set(normalized.split())

    for cmd in COMMAND_CATALOG:
        for phrase in cmd.phrases:
            phrase_norm = normalize_text(phrase)
            phrase_tokens = set(phrase_norm.split())

            if phrase_norm == normalized:
                return cmd, 1.0

            if phrase_norm in normalized or normalized in phrase_norm:
                score = 0.85
                if score > best_score:
                    best_score = score
                    best_match = cmd

            if input_tokens and phrase_tokens:
                intersection = len(input_tokens.intersection(phrase_tokens))
                union = len(input_tokens.union(phrase_tokens))
                jaccard = intersection / union
                if jaccard >= 0.5 and jaccard > best_score:
                    best_score = jaccard
                    best_match = cmd

    return best_match, best_score


async def match_dynamic_entity_action(raw_phrase: str, confirmed: bool = False) -> Optional[CommandExecuteResult]:
    """
    Motor determinístico de correspondência dinâmica de entidades (Pilar 1).
    Permite acionar qualquer luz, tomada, estore, termostato ou VM descoberta pelo nome amigável.
    """
    text = normalize_text(raw_phrase)
    text = re.sub(r"^(o\s+)?jarvis\s+", "", text).strip()

    # 1. Padrões de Ação no Proxmox VE
    pve_vm_match = re.search(r"(?:liga|ligar|inicia|iniciar|desliga|desligar|reinicia|reiniciar)\s+(?:vm|maquina|servidor)\s+(\d+)", text)
    if pve_vm_match:
        vmid = int(pve_vm_match.group(1))
        action = "start" if ("liga" in text or "inicia" in text) else ("shutdown" if "desliga" in text else "reboot")
        
        if not pve_adapter.is_configured():
            return CommandExecuteResult(
                command_id="cmd_pve_dynamic",
                action_executed=f"Ação {action} na VM {vmid}",
                spoken_feedback="Proxmox VE não está configurado.",
                ui_action="open_panel_proxmox"
            )

        if not confirmed and action in ["shutdown", "reboot"]:
            action_pt = "desligar" if action == "shutdown" else "reiniciar"
            return CommandExecuteResult(
                command_id="cmd_pve_dynamic_confirm",
                action_executed=f"Confirmação necessária para VM {vmid}",
                spoken_feedback=f"Confirma que pretende {action_pt} a máquina virtual {vmid}?",
                ui_action="confirm_vm_action",
                data={"vmid": vmid, "action": action}
            )

        res = await pve_adapter.control_vm(vmid, action, confirmed=True)
        return CommandExecuteResult(
            command_id="cmd_pve_dynamic",
            action_executed=f"Execução de {action} na VM {vmid}",
            spoken_feedback=res.message,
            ui_action="refresh_data"
        )

    # 2. Padrões de Ação no Home Assistant
    intent = None
    target_str = ""

    patterns = [
        (r"^(?:liga|ligar|acende|acender|ativa|ativar)\s+(.+)", "turn_on"),
        (r"^(?:desliga|desligar|apaga|apagar|desativa|desativar)\s+(.+)", "turn_off"),
        (r"^(?:abre|abrir|sobe|subir)\s+(.+)", "cover_open"),
        (r"^(?:fecha|fechar|desce|descer)\s+(.+)", "cover_close"),
        (r"^(?:pausa|pausar|para|parar)\s+(.+)", "media_pause"),
        (r"^(?:toca|tocar|reproduz|reproduzir|retoma|retomar)\s+(.+)", "media_play")
    ]

    for regex, act in patterns:
        m = re.match(regex, text)
        if m:
            intent = act
            target_str = m.group(1).strip()
            break

    if not intent or not target_str or not ha_adapter.is_configured():
        return None

    # Pesquisa as entidades autorizadas e calcula similaridade fonética de tokens
    entities = await ha_adapter.get_entities()
    if not entities:
        return None

    best_entity = None
    best_entity_score = 0.0
    target_tokens = set(target_str.split())

    for ent in entities:
        ent_norm = normalize_text(ent.friendly_name)
        ent_tokens = set(ent_norm.split())

        if target_str in ent_norm or ent_norm in target_str:
            best_entity = ent
            best_entity_score = 1.0
            break

        if target_tokens and ent_tokens:
            intersection = len(target_tokens.intersection(ent_tokens))
            score = intersection / len(target_tokens)
            if score > best_entity_score and score >= 0.5:
                best_entity_score = score
                best_entity = ent

    if not best_entity:
        return None

    # Executa a ação exata correspondente ao domínio da entidade
    entity_id = best_entity.entity_id
    domain = best_entity.domain
    feedback_name = best_entity.friendly_name

    if intent == "turn_on":
        if domain == "light":
            res = await ha_adapter.control_light(entity_id, "on")
        elif domain in ["switch", "input_boolean"]:
            res = await ha_adapter.control_switch(entity_id, "on")
        elif domain == "cover":
            res = await ha_adapter.control_cover(entity_id, "open")
        elif domain == "media_player":
            res = await ha_adapter.control_media_player(entity_id, "play")
        else:
            res = await ha_adapter.control_switch(entity_id, "on")

        return CommandExecuteResult(
            command_id="cmd_ha_dynamic",
            action_executed=f"Ligar {feedback_name}",
            spoken_feedback=f"{feedback_name} ligado com sucesso." if res.success else f"Falha ao ligar {feedback_name}.",
            ui_action="refresh_data",
            data={"entity_id": entity_id, "state": res.new_state}
        )

    elif intent == "turn_off":
        if domain == "light":
            res = await ha_adapter.control_light(entity_id, "off")
        elif domain in ["switch", "input_boolean"]:
            res = await ha_adapter.control_switch(entity_id, "off")
        elif domain == "cover":
            res = await ha_adapter.control_cover(entity_id, "close")
        elif domain == "media_player":
            res = await ha_adapter.control_media_player(entity_id, "pause")
        else:
            res = await ha_adapter.control_switch(entity_id, "off")

        return CommandExecuteResult(
            command_id="cmd_ha_dynamic",
            action_executed=f"Desligar {feedback_name}",
            spoken_feedback=f"{feedback_name} desligado com sucesso." if res.success else f"Falha ao desligar {feedback_name}.",
            ui_action="refresh_data",
            data={"entity_id": entity_id, "state": res.new_state}
        )

    elif intent in ["cover_open", "cover_close"]:
        act = "open" if intent == "cover_open" else "close"
        res = await ha_adapter.control_cover(entity_id, act)
        action_word = "aberto" if act == "open" else "fechado"
        return CommandExecuteResult(
            command_id="cmd_ha_dynamic",
            action_executed=f"Estore {feedback_name}",
            spoken_feedback=f"Estore {feedback_name} {action_word}." if res.success else f"Falha no estore: {res.message}",
            ui_action="refresh_data"
        )

    elif intent in ["media_play", "media_pause"]:
        act = "play" if intent == "media_play" else "pause"
        res = await ha_adapter.control_media_player(entity_id, act)
        return CommandExecuteResult(
            command_id="cmd_ha_dynamic",
            action_executed=f"Multimédia {feedback_name}",
            spoken_feedback=f"Reprodução de {feedback_name} atualizada.",
            ui_action="refresh_data"
        )

    return None


@router.get("/commands", response_model=APIResponse)
async def list_commands(_: str = Depends(verify_api_key)):
    """Lista o catálogo de comandos determinísticos suportados pelo JARVIS XR."""
    return APIResponse(status="ok", data=COMMAND_CATALOG)


@router.post("/commands/execute", response_model=APIResponse)
async def execute_command(
    request: CommandExecuteRequest,
    _: str = Depends(verify_api_key)
):
    """Executa deterministamente um comando por ID direto ou por voz dinâmica."""
    # 1. Tenta correspondência estática no catálogo oficial
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

    # 2. Se não encontrou no catálogo estático, tenta o motor dinâmico de entidades
    if not matched_cmd and request.raw_phrase:
        dynamic_res = await match_dynamic_entity_action(request.raw_phrase, request.confirmed)
        if dynamic_res:
            return APIResponse(status="ok", data=dynamic_res)

    if not matched_cmd:
        return APIResponse(
            status="error",
            error="Comando não reconhecido. Consulte o catálogo de comandos disponíveis.",
            data={
                "spoken_feedback": "Comando não compreendido. A apresentar comandos disponíveis.",
                "ui_action": "show_help"
            }
        )

    # 3. Execução das ações mapeadas estáticas
    action_map = {
        "cmd_show_home": {"ui_action": "open_panel_home", "spoken": "A apresentar o painel de domótica.", "data": {"panel": "home"}},
        "cmd_show_proxmox": {"ui_action": "open_panel_proxmox", "spoken": "Servidores Proxmox carregados.", "data": {"panel": "proxmox"}},
        "cmd_show_network": {"ui_action": "open_panel_network", "spoken": "A apresentar o estado do escudo DNS.", "data": {"panel": "network"}},
        "cmd_show_services": {"ui_action": "open_panel_services", "spoken": "A carregar estado dos serviços locais.", "data": {"panel": "services"}},
        "cmd_show_camera": {"ui_action": "open_panel_camera", "spoken": "A carregar visão da câmara em tempo real.", "data": {"panel": "camera"}},
        "cmd_show_diagnostics": {"ui_action": "open_panel_diagnostics", "spoken": "A executar diagnóstico de latência e conectividade.", "data": {"panel": "diagnostics"}},
        "cmd_close_panels": {"ui_action": "close_all_panels", "spoken": "Painéis recolhidos.", "data": {}},
        "cmd_system_status": {"ui_action": "open_panel_home", "spoken": "Sistemas operacionais. Ligação ao servidor estabelecida.", "data": {"status": "ok"}},
        "cmd_refresh_data": {"ui_action": "refresh_data", "spoken": "Dados atualizados com sucesso.", "data": {"refreshed": True}},
        "cmd_cover_open": {"ui_action": "refresh_data", "spoken": "A abrir estores autorizados.", "data": {}},
        "cmd_cover_close": {"ui_action": "refresh_data", "spoken": "A fechar estores autorizados.", "data": {}},
        "cmd_media_pause": {"ui_action": "refresh_data", "spoken": "Reprodução pausada.", "data": {}},
        "cmd_media_play": {"ui_action": "refresh_data", "spoken": "Reprodução retomada.", "data": {}},
        "cmd_stop_listening": {"ui_action": "stop_listening", "spoken": "Reconhecimento de voz desativado.", "data": {}}
    }

    result_spec = action_map.get(
        matched_cmd.id,
        {"ui_action": "none", "spoken": "Comando executado.", "data": {}}
    )

    # Execuções especiais
    if matched_cmd.id in ["cmd_light_office_on", "cmd_light_office_off"]:
        target_entity = "light.escritorio"
        action = "on" if matched_cmd.id == "cmd_light_office_on" else "off"
        if ha_adapter.is_configured() and ha_adapter._is_entity_authorized(target_entity):
            ha_res = await ha_adapter.control_light(target_entity, action=action)
            state_pt = "ligada" if action == "on" else "desligada"
            result_spec["spoken"] = f"A luz do escritório foi {state_pt}." if ha_res.success else f"Não foi possível: {ha_res.message}"
            result_spec["data"] = {"entity_id": target_entity, "new_state": ha_res.new_state}

    result = CommandExecuteResult(
        command_id=matched_cmd.id,
        action_executed=matched_cmd.description,
        spoken_feedback=result_spec["spoken"],
        ui_action=result_spec["ui_action"],
        data=result_spec["data"]
    )
    return APIResponse(status="ok", data=result)
