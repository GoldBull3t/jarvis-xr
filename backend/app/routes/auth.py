"""Rotas de segurança e controlo de acesso por PIN do JARVIS XR."""
import secrets
from fastapi import APIRouter, Depends, HTTPException, status
from app.config import settings
from app.schemas import APIResponse, PinVerifyRequest, PinStatusResponse
from app.services.audit import audit_logger

router = APIRouter(prefix="/auth", tags=["Segurança & Acesso"])


@router.get("/pin-status", response_model=APIResponse)
async def get_pin_status():
    """Verifica se o ecrã de bloqueio por PIN está ativado e as definições de auto-lock."""
    data = PinStatusResponse(
        pin_required=settings.JARVIS_PIN_REQUIRED,
        auto_lock_minutes=settings.JARVIS_AUTO_LOCK_MINUTES,
        is_locked=settings.JARVIS_PIN_REQUIRED
    )
    return APIResponse(status="ok", data=data)


@router.post("/verify-pin", response_model=APIResponse)
async def verify_pin(payload: PinVerifyRequest):
    """Valida o PIN numérico introduzido no teclado virtual 3D ou 2D."""
    if not settings.JARVIS_PIN_REQUIRED:
        audit_logger.log(
            event_type="AUTH_EVENT",
            target="PIN Lock Screen",
            action="PIN_BYPASS_DISABLED",
            confirmed=True,
            details="Bloqueio por PIN desativado no sistema."
        )
        return APIResponse(status="ok", data={"valid": True, "message": "PIN desativado"})

    # Comparação segura contra ataques de timing
    is_valid = secrets.compare_digest(payload.pin.strip(), settings.JARVIS_ACCESS_PIN.strip())
    
    if is_valid:
        audit_logger.log(
            event_type="AUTH_EVENT",
            target="PIN Lock Screen",
            action="PIN_VERIFIED_SUCCESS",
            confirmed=True,
            details="Cockpit desbloqueado com sucesso via PIN numérico."
        )
        return APIResponse(status="ok", data={"valid": True, "message": "Cockpit desbloqueado com sucesso"})
    else:
        audit_logger.log(
            event_type="SECURITY_ALERT",
            target="PIN Lock Screen",
            action="PIN_VERIFIED_FAILED",
            confirmed=False,
            details="Tentativa de desbloqueio com PIN incorreto."
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="PIN de acesso incorreto. Acesso recusado."
        )

