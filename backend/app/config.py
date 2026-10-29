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
    JARVIS_AUTH_ENABLED: bool = Field(
        default=True,
        description="Ativa ou desativa a exigência de Bearer token"
    )
    JARVIS_API_KEY: str = Field(
        default="jarvis-dev-insecure-key-replace-in-production",
        description="Chave pre-shared para autenticação Bearer token (defina como 'none' para desativar)"
    )
    
    # Domínio / Proxy (opcional, flexível para qualquer domínio ou reverse proxy como Cosmos)
    JARVIS_DOMAIN: Optional[str] = None
    JARVIS_CORS_ORIGINS: str = "*"
    
    # Integração Proxmox VE
    PROXMOX_ENABLED: bool = False
    PROXMOX_URL: Optional[str] = None
    PROXMOX_TOKEN_ID: Optional[str] = None
    PROXMOX_TOKEN_SECRET: Optional[str] = None
    PROXMOX_VERIFY_SSL: bool = False
    PROXMOX_TIMEOUT_SECONDS: int = 10
    # Lista de VMIDs autorizados a receber comandos de ciclo de vida (ex: "101,102")
    PROXMOX_ALLOWED_VMIDS: str = ""
    
    # Integração Home Assistant
    HOME_ASSISTANT_ENABLED: bool = False
    HOME_ASSISTANT_URL: Optional[str] = None
    HOME_ASSISTANT_TOKEN: Optional[str] = None
    HOME_ASSISTANT_TIMEOUT_SECONDS: int = 5
    # Modo de descoberta: "labels" (automático por etiqueta do HA) ou "manual" (por lista de IDs)
    HOME_ASSISTANT_DISCOVERY_MODE: str = "labels"
    # Nome da etiqueta a procurar no Home Assistant (ex: "jarvis" ou "jarvis-xr")
    HOME_ASSISTANT_DISCOVERY_LABEL: str = "jarvis"
    # Fallback ou lista manual de entidades autorizadas
    HOME_ASSISTANT_ALLOWED_ENTITIES: str = ""
    # Entidade no Home Assistant a atualizar quando o utilizador entra em VR/AR
    HOME_ASSISTANT_PRESENCE_ENTITY: str = "input_boolean.jarvis_xr_active"
    
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
    def is_auth_required(self) -> bool:
        """Determina se a validação de token Bearer deve ser exigida nas rotas."""
        if not self.JARVIS_AUTH_ENABLED:
            return False
        key = (self.JARVIS_API_KEY or "").strip().lower()
        if key in ["", "none", "disabled", "false", "off"]:
            return False
        return True

    @property
    def cors_origins_list(self) -> List[str]:
        """Devolve a lista de origens CORS autorizadas."""
        if not self.JARVIS_CORS_ORIGINS or self.JARVIS_CORS_ORIGINS.strip() == "*":
            return ["*"]
        return [o.strip() for o in self.JARVIS_CORS_ORIGINS.split(",") if o.strip()]

    @property
    def allowed_ha_entities(self) -> List[str]:
        """Devolve a lista de IDs de entidades autorizadas."""
        if not self.HOME_ASSISTANT_ALLOWED_ENTITIES:
            return []
        return [e.strip() for e in self.HOME_ASSISTANT_ALLOWED_ENTITIES.split(",") if e.strip()]

    @property
    def allowed_proxmox_vmids(self) -> List[int]:
        """Devolve a lista de VMIDs autorizados a receber ações de ligar/desligar."""
        if not self.PROXMOX_ALLOWED_VMIDS:
            return []
        vmids = []
        for v in self.PROXMOX_ALLOWED_VMIDS.split(","):
            v_clean = v.strip()
            if v_clean.isdigit():
                vmids.append(int(v_clean))
        return vmids

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

