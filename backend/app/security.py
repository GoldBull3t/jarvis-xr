"""Módulo de segurança e controlo de acesso."""
import secrets
from fastapi import Security, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import settings

security_bearer = HTTPBearer(auto_error=False)


def verify_api_key(credentials: HTTPAuthorizationCredentials = Security(security_bearer)) -> str:
    """
    Valida o token Bearer fornecido no header Authorization.
    Se JARVIS_AUTH_ENABLED=False ou JARVIS_API_KEY='none', autoriza imediatamente para redes locais.
    Caso contrário, utiliza comparação em tempo constante para mitigar timing attacks.
    """
    if not settings.is_auth_required:
        return credentials.credentials if (credentials and credentials.credentials) else "anonymous"

    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticação necessária. Forneça o cabeçalho 'Authorization: Bearer <token>' ou desative JARVIS_AUTH_ENABLED."
        )

    # Comparação segura contra timing attacks
    if not secrets.compare_digest(credentials.credentials, settings.JARVIS_API_KEY):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de acesso inválido ou expirado."
        )

    return credentials.credentials

