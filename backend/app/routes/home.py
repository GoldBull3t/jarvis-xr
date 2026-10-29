"""Rotas da API dedicadas ao Home Assistant."""
from fastapi import APIRouter, Depends, HTTPException, status, Response
from app.security import verify_api_key
from app.schemas import (
    APIResponse,
    HomeSummaryData,
    ActionLightRequest,
    ActionSwitchRequest,
    ActionSceneRequest,
    ActionClimateRequest,
    ActionCoverRequest,
    ActionMediaPlayerRequest,
    ActionExecutionResult,
    PresenceUpdateRequest
)
from app.integrations.homeassistant import ha_adapter

router = APIRouter(prefix="/home", tags=["Home Assistant"])


@router.get("/summary", response_model=APIResponse)
async def get_home_summary(_: str = Depends(verify_api_key)):
    """Obtém resumo agregado de domótica com sensores e contagens de luzes."""
    summary: HomeSummaryData = await ha_adapter.get_summary()
    return APIResponse(status="ok", data=summary)


@router.get("/entities", response_model=APIResponse)
async def get_home_entities(_: str = Depends(verify_api_key)):
    """Obtém o estado detalhado de todas as entidades autorizadas."""
    entities = await ha_adapter.get_entities()
    return APIResponse(status="ok", data=entities)


@router.post("/actions/light", response_model=APIResponse)
async def action_light(
    req: ActionLightRequest,
    _: str = Depends(verify_api_key)
):
    """Aciona uma luz autorizada com verificação estrita de segurança."""
    if not ha_adapter._is_entity_authorized(req.entity_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"A entidade '{req.entity_id}' não está na allowlist de entidades autorizadas."
        )

    result: ActionExecutionResult = await ha_adapter.control_light(
        entity_id=req.entity_id,
        action=req.action,
        brightness=req.brightness
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
            detail=f"A entidade '{req.entity_id}' não está na allowlist de entidades autorizadas."
        )

    result: ActionExecutionResult = await ha_adapter.control_switch(
        entity_id=req.entity_id,
        action=req.action
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
            detail=f"A cena '{req.entity_id}' não está na allowlist de entidades autorizadas."
        )

    result: ActionExecutionResult = await ha_adapter.activate_scene(entity_id=req.entity_id)

    if not result.success:
        return APIResponse(status="error", error=result.message, data=result)

    return APIResponse(status="ok", data=result)


@router.post("/actions/climate", response_model=APIResponse)
async def action_climate(
    req: ActionClimateRequest,
    _: str = Depends(verify_api_key)
):
    """Aciona controlo de climatização (termostato/AC) autorizado."""
    if not ha_adapter._is_entity_authorized(req.entity_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"A entidade '{req.entity_id}' não está autorizada."
        )

    result: ActionExecutionResult = await ha_adapter.control_climate(
        entity_id=req.entity_id,
        action=req.action,
        temperature=req.temperature,
        hvac_mode=req.hvac_mode
    )
    if not result.success:
        return APIResponse(status="error", error=result.message, data=result)
    return APIResponse(status="ok", data=result)


@router.post("/actions/cover", response_model=APIResponse)
async def action_cover(
    req: ActionCoverRequest,
    _: str = Depends(verify_api_key)
):
    """Aciona estores ou cortinas autorizadas."""
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
    """Controla reprodução multimédia autorizada."""
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

