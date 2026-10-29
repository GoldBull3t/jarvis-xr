"""Módulo de segurança e controlo de acesso."""
import secrets
from typing import Optional
from fastapi import Security, HTTPException, status, Query, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import settings

security_bearer = HTTPBearer(auto_error=False)


def verify_api_key(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security_bearer),
    token: Optional[str] = Query(None),
    key: Optional[str] = Query(None)
) -> str:
    """
    Valida o token Bearer fornecido no header Authorization ou em query params (?token= / ?key=).
    Suporta SSE EventSource e carregamento de imagens de câmara no Meta Quest 3S.
    Se JARVIS_AUTH_ENABLED=False ou JARVIS_API_KEY='none', autoriza imediatamente.
    """
    if not settings.is_auth_required:
        return credentials.credentials if (credentials and credentials.credentials) else (token or key or "anonymous")

    provided_key = None
    if credentials and credentials.credentials:
        provided_key = credentials.credentials
    elif token:
        provided_key = token
    elif key:
        provided_key = key

    if not provided_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticação necessária. Forneça o cabeçalho 'Authorization: Bearer <token>' ou o parâmetro '?key=<token>'."
        )

    # Comparação segura contra timing attacks
    if not secrets.compare_digest(provided_key, settings.JARVIS_API_KEY):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de acesso inválido ou expirado."
        )

    return provided_key

