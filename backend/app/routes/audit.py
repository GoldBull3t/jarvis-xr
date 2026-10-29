"""Rotas da API para consulta de registos de auditoria e segurança."""
from typing import List
from fastapi import APIRouter, Depends, Query
from app.security import verify_api_key
from app.schemas import APIResponse, AuditLogItem
from app.services.audit import audit_logger

router = APIRouter(prefix="/audit", tags=["Auditoria & Segurança"])


@router.get("/logs", response_model=APIResponse)
async def get_audit_logs(
    limit: int = Query(default=50, ge=1, le=100),
    _: str = Depends(verify_api_key)
):
    """Obtém os eventos mais recentes do registo de auditoria e segurança."""
    entries = audit_logger.get_entries(limit=limit)
    items = [
        AuditLogItem(
            id=e.id,
            timestamp=e.timestamp,
            event_type=e.event_type,
            target=e.target,
            action=e.action,
            actor=e.actor,
            confirmed=e.confirmed,
            details=e.details
        )
        for e in entries
    ]
    return APIResponse(status="ok", data=items)

