"""Serviço de Auditoria e Registo de Segurança em Tempo Real do JARVIS XR."""
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel, Field


class AuditEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    event_type: str  # "HA_ACTION", "VM_ACTION", "AUTH_EVENT", "SECURITY_ALERT", "COMMAND"
    target: str      # ex: "switch.servidor", "VM 100 (Debian)", "PIN Pad"
    action: str      # ex: "TURN_OFF", "SHUTDOWN", "UNLOCKED", "UNLOCK_DOOR"
    actor: str = "webxr_controller"  # "webxr_controller", "hud_2d", "voice", "system"
    confirmed: bool = False
    details: Optional[str] = None


class AuditLogger:
    """Registo circular em memória das últimas ações para auditoria e segurança."""
    
    def __init__(self, max_entries: int = 100):
        self._max_entries = max_entries
        self._entries: List[AuditEntry] = []
        # Inicializa com evento de arranque do sistema
        self.log(
            event_type="SYSTEM",
            target="JARVIS Core",
            action="BOOT_AUDIT_SERVICE",
            actor="system",
            confirmed=True,
            details="Serviço de registo de auditoria e segurança iniciado."
        )

    def log(
        self,
        event_type: str,
        target: str,
        action: str,
        actor: str = "webxr_controller",
        confirmed: bool = False,
        details: Optional[str] = None
    ) -> AuditEntry:
        entry = AuditEntry(
            event_type=event_type,
            target=target,
            action=action,
            actor=actor,
            confirmed=confirmed,
            details=details
        )
        self._entries.insert(0, entry)
        if len(self._entries) > self._max_entries:
            self._entries = self._entries[:self._max_entries]
        return entry

    def get_entries(self, limit: int = 50) -> List[AuditEntry]:
        return self._entries[:limit]


# Instância partilhada do auditor
audit_logger = AuditLogger()

