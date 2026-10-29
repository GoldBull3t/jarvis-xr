"""Rotas da API dedicadas ao Home Assistant com suporte multi-domínio completo."""
from fastapi import APIRouter, Depends, HTTPException, status, Response
from app.security import verify_api_key
from app.schemas import (
    APIResponse,
    HomeSummaryData,
    ActionLightRequest,
    ActionSwitchRequest,
    ActionSceneRequest,
    ActionScriptRequest,
    ActionClimateRequest,
    ActionCoverRequest,
    ActionMediaPlayerRequest,
    ActionLockRequest,
    ActionFanRequest,
    ActionVacuumRequest,
    ActionAutomationRequest,
    ActionGenericEntityRequest,
    ActionExecutionResult,
    PresenceUpdateRequest
)
from app.integrations.homeassistant import ha_adapter

router = APIRouter(prefix="/home", tags=["Home Assistant"])


@router.get("/summary", response_model=APIResponse)
async def get_home_summary(_: str = Depends(verify_api_key)):
    """Obtém resumo agregado de domótica com energia, climatização, segurança e contagens."""
    summary: HomeSummaryData = await ha_adapter.get_summary()
    return APIResponse(status="ok", data=summary)


@router.get("/entities", response_model=APIResponse)
async def get_home_entities(_: str = Depends(verify_api_key)):
    """Obtém o estado detalhado de todas as entidades autorizadas com suas respetivas áreas."""
    entities = await ha_adapter.get_entities()
    return APIResponse(status="ok", data=entities)


@router.get("/cameras", response_model=APIResponse)
async def get_home_cameras(_: str = Depends(verify_api_key)):
    """Obtém a lista de todas as câmaras de vigilância descobertas."""
    cameras = await ha_adapter.get_cameras_list()
    return APIResponse(status="ok", data=cameras)


@router.get("/areas", response_model=APIResponse)
async def get_home_areas(_: str = Depends(verify_api_key)):
    """Obtém o mapeamento de entidades agrupadas pelas Divisões/Áreas do Home Assistant."""
    summary = await ha_adapter.get_summary()
    areas_dict = {}
    for ent in summary.authorized_entities:
        area = ent.area_name or "Outros Dispositivos"
        if area not in areas_dict:
            areas_dict[area] = []
        areas_dict[area].append(ent)
    return APIResponse(status="ok", data=areas_dict)


@router.post("/actions/light", response_model=APIResponse)
async def action_light(
    req: ActionLightRequest,
    _: str = Depends(verify_api_key)
):
    """Aciona uma luz com regulação de brilho, temperatura e cor."""
    if not ha_adapter._is_entity_authorized(req.entity_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"A entidade '{req.entity_id}' não está autorizada."
        )

    result: ActionExecutionResult = await ha_adapter.control_light(
        entity_id=req.entity_id,
        action=req.action,
        brightness=req.brightness,
        color_temp=req.color_temp,
        rgb_color=req.rgb_color
    )

    if not result.success:
        return APIResponse(status="error", error=result.message, data=result)

    return APIResponse(status="ok", data=result)


@router.post("/actions/switch", response_model=APIResponse)
async def action_switch(
    req: ActionSwitchRequest,
    _: str = Depends(verify_api_key)
):
    """Aciona um interruptor ou tomada autorizada."""
    if not ha_adapter._is_entity_authorized(req.entity_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"A entidade '{req.entity_id}' não está autorizada."
        )

    result: ActionExecutionResult = await ha_adapter.control_switch(
        entity_id=req.entity_id,
        action=req.action
    )

    if not result.success:
        return APIResponse(status="error", error=result.message, data=result)

    return APIResponse(status="ok", data=result)


@router.post("/actions/climate", response_model=APIResponse)
async def action_climate(
    req: ActionClimateRequest,
    _: str = Depends(verify_api_key)
):
    """Aciona controlo de climatização (termostato/AC)."""
    if not ha_adapter._is_entity_authorized(req.entity_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"A entidade '{req.entity_id}' não está autorizada."
        )

    result: ActionExecutionResult = await ha_adapter.control_climate(
        entity_id=req.entity_id,
        action=req.action,
        temperature=req.temperature,
        hvac_mode=req.hvac_mode,
        fan_mode=req.fan_mode
    )
    if not result.success:
        return APIResponse(status="error", error=result.message, data=result)
    return APIResponse(status="ok", data=result)


@router.post("/actions/cover", response_model=APIResponse)
async def action_cover(
    req: ActionCoverRequest,
    _: str = Depends(verify_api_key)
):
    """Aciona estores ou cortinas com suporte a posição percentual."""
    if not ha_adapter._is_entity_authorized(req.entity_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"O estore '{req.entity_id}' não está autorizado."
        )

    result: ActionExecutionResult = await ha_adapter.control_cover(
        entity_id=req.entity_id,
        action=req.action,
        position=req.position
    )
    if not result.success:
        return APIResponse(status="error", error=result.message, data=result)
    return APIResponse(status="ok", data=result)


@router.post("/actions/media_player", response_model=APIResponse)
async def action_media_player(
    req: ActionMediaPlayerRequest,
    _: str = Depends(verify_api_key)
):
    """Controla reprodução multimédia (Play, Pause, Volume, Faixas)."""
    if not ha_adapter._is_entity_authorized(req.entity_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"O media player '{req.entity_id}' não está autorizado."
        )

    result: ActionExecutionResult = await ha_adapter.control_media_player(
        entity_id=req.entity_id,
        action=req.action,
        volume_level=req.volume_level
    )
    if not result.success:
        return APIResponse(status="error", error=result.message, data=result)
    return APIResponse(status="ok", data=result)


@router.post("/actions/scene", response_model=APIResponse)
async def action_scene(
    req: ActionSceneRequest,
    _: str = Depends(verify_api_key)
):
    """Ativa uma cena de domótica autorizada."""
    if not ha_adapter._is_entity_authorized(req.entity_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"A cena '{req.entity_id}' não está autorizada."
        )

    result: ActionExecutionResult = await ha_adapter.activate_scene(entity_id=req.entity_id)
    if not result.success:
        return APIResponse(status="error", error=result.message, data=result)
    return APIResponse(status="ok", data=result)


@router.post("/actions/script", response_model=APIResponse)
async def action_script(
    req: ActionScriptRequest,
    _: str = Depends(verify_api_key)
):
    """Executa um script de domótica do Home Assistant."""
    if not ha_adapter._is_entity_authorized(req.entity_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"O script '{req.entity_id}' não está autorizado."
        )

    result: ActionExecutionResult = await ha_adapter.activate_script(
        entity_id=req.entity_id,
        variables=req.variables
    )
    if not result.success:
        return APIResponse(status="error", error=result.message, data=result)
    return APIResponse(status="ok", data=result)


@router.post("/actions/lock", response_model=APIResponse)
async def action_lock(
    req: ActionLockRequest,
    _: str = Depends(verify_api_key)
):
    """Tranca ou destranca fechaduras inteligentes com código opcional."""
    if not ha_adapter._is_entity_authorized(req.entity_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"A fechadura '{req.entity_id}' não está autorizada."
        )

    result: ActionExecutionResult = await ha_adapter.control_lock(
        entity_id=req.entity_id,
        action=req.action,
        code=req.code
    )
    if not result.success:
        return APIResponse(status="error", error=result.message, data=result)
    return APIResponse(status="ok", data=result)


@router.post("/actions/fan", response_model=APIResponse)
async def action_fan(
    req: ActionFanRequest,
    _: str = Depends(verify_api_key)
):
    """Controla velocidade e estado de ventoinhas."""
    if not ha_adapter._is_entity_authorized(req.entity_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"A ventoinha '{req.entity_id}' não está autorizada."
        )

    result: ActionExecutionResult = await ha_adapter.control_fan(
        entity_id=req.entity_id,
        action=req.action,
        percentage=req.percentage
    )
    if not result.success:
        return APIResponse(status="error", error=result.message, data=result)
    return APIResponse(status="ok", data=result)


@router.post("/actions/vacuum", response_model=APIResponse)
async def action_vacuum(
    req: ActionVacuumRequest,
    _: str = Depends(verify_api_key)
):
    """Controla o ciclo de limpeza do aspirador robot."""
    if not ha_adapter._is_entity_authorized(req.entity_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"O aspirador '{req.entity_id}' não está autorizado."
        )

    result: ActionExecutionResult = await ha_adapter.control_vacuum(
        entity_id=req.entity_id,
        action=req.action
    )
    if not result.success:
        return APIResponse(status="error", error=result.message, data=result)
    return APIResponse(status="ok", data=result)


@router.post("/actions/automation", response_model=APIResponse)
async def action_automation(
    req: ActionAutomationRequest,
    _: str = Depends(verify_api_key)
):
    """Dispara ou comuta automações residenciais."""
    if not ha_adapter._is_entity_authorized(req.entity_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"A automação '{req.entity_id}' não está autorizada."
        )

    result: ActionExecutionResult = await ha_adapter.trigger_automation(
        entity_id=req.entity_id,
        action=req.action
    )
    if not result.success:
        return APIResponse(status="error", error=result.message, data=result)
    return APIResponse(status="ok", data=result)


@router.post("/actions/generic", response_model=APIResponse)
async def action_generic(
    req: ActionGenericEntityRequest,
    _: str = Depends(verify_api_key)
):
    """Executa serviço genérico do Home Assistant de forma determinística."""
    if not ha_adapter._is_entity_authorized(req.entity_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"A entidade '{req.entity_id}' não está autorizada."
        )

    result: ActionExecutionResult = await ha_adapter.execute_generic_service(
        entity_id=req.entity_id,
        domain=req.domain,
        service=req.service,
        service_data=req.service_data
    )
    if not result.success:
        return APIResponse(status="error", error=result.message, data=result)
    return APIResponse(status="ok", data=result)


@router.get("/camera/{entity_id}/snapshot")
async def get_camera_snapshot(
    entity_id: str,
    _: str = Depends(verify_api_key)
):
    """Obtém imagem instantânea (JPEG) de uma câmara de segurança autorizada."""
    if not ha_adapter._is_entity_authorized(entity_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Câmara não autorizada")

    img_bytes = await ha_adapter.get_camera_snapshot(entity_id)
    if not img_bytes:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot indisponível")
    return Response(content=img_bytes, media_type="image/jpeg")


@router.post("/presence", response_model=APIResponse)
async def update_home_presence(
    req: PresenceUpdateRequest,
    _: str = Depends(verify_api_key)
):
    """Notifica o Home Assistant da entrada/saída de imersão nos Meta Quest 3S."""
    res = await ha_adapter.update_presence(active=req.active, device=req.device)
    return APIResponse(status="ok", data=res)
