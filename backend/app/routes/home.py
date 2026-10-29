"""Rotas da API dedicadas ao Home Assistant."""
from fastapi import APIRouter, Depends, HTTPException, status
from app.security import verify_api_key
from app.schemas import (
    APIResponse,
    HomeSummaryData,
    ActionLightRequest,
    ActionSwitchRequest,
    ActionSceneRequest,
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


@router.post("/presence", response_model=APIResponse)
async def update_home_presence(
    req: PresenceUpdateRequest,
    _: str = Depends(verify_api_key)
):
    """Notifica o Home Assistant da entrada/saída de imersão nos Meta Quest 3S."""
    res = await ha_adapter.update_presence(active=req.active, device=req.device)
    return APIResponse(status="ok", data=res)

