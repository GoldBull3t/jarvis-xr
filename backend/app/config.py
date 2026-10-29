"""Módulo de configuração centralizada do JARVIS XR."""
import json
from typing import List, Dict, Any, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, field_validator


class Settings(BaseSettings):
    """Configurações da aplicação JARVIS XR com validação estrita."""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # Configuração Geral
    JARVIS_ENV: str = "production"
    JARVIS_LOG_LEVEL: str = "INFO"
    JARVIS_API_KEY: str = Field(
        default="jarvis-dev-insecure-key-replace-in-production",
        description="Chave pre-shared para autenticação Bearer token"
    )
    
    # Domínio / Proxy
    JARVIS_DOMAIN: str = "jarvis.homelab.local"
    
    # Integração Proxmox VE
    PROXMOX_ENABLED: bool = False
    PROXMOX_URL: Optional[str] = None
    PROXMOX_TOKEN_ID: Optional[str] = None
    PROXMOX_TOKEN_SECRET: Optional[str] = None
    PROXMOX_VERIFY_SSL: bool = False
    PROXMOX_TIMEOUT_SECONDS: int = 10
    
    # Integração Home Assistant
    HOME_ASSISTANT_ENABLED: bool = False
    HOME_ASSISTANT_URL: Optional[str] = None
    HOME_ASSISTANT_TOKEN: Optional[str] = None
    HOME_ASSISTANT_TIMEOUT_SECONDS: int = 5
    HOME_ASSISTANT_ALLOWED_ENTITIES: str = ""
    
    # Integração DNS
    DNS_PROVIDER: str = "none"  # "pihole", "adguard", "none"
    PIHOLE_URL: Optional[str] = None
    PIHOLE_API_TOKEN: Optional[str] = None
    ADGUARD_URL: Optional[str] = None
    ADGUARD_USERNAME: Optional[str] = None
    ADGUARD_PASSWORD: Optional[str] = None
    
    # Allowlist de Serviços do Homelab para Healthcheck
    HOMELAB_SERVICES: str = "[]"

    @property
    def allowed_ha_entities(self) -> List[str]:
        """Devolve a lista de IDs de entidades autorizadas."""
        if not self.HOME_ASSISTANT_ALLOWED_ENTITIES:
            return []
        return [e.strip() for e in self.HOME_ASSISTANT_ALLOWED_ENTITIES.split(",") if e.strip()]

    @property
    def monitored_services(self) -> List[Dict[str, Any]]:
        """Devolve a lista de serviços a monitorizar a partir da string JSON."""
        try:
            parsed = json.loads(self.HOMELAB_SERVICES)
            if isinstance(parsed, list):
                return parsed
            return []
        except Exception:
            return []


# Instância partilhada de configurações
settings = Settings()

