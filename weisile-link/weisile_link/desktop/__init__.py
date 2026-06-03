"""Desktop support helpers for WeisileLink releases."""

from weisile_link.desktop.profiles import (
    DesktopProfile,
    DesktopProfileError,
    DesktopProfileStore,
    MacOSKeychainBackend,
    MemoryCredentialBackend,
    WindowsCredentialManagerBackend,
    credential_backend_for_platform,
    default_config_path,
    resolve_profile_environment,
    save_claimed_profile,
)
from weisile_link.desktop.pairing import (
    DesktopPairingResult,
    DesktopPairingService,
    DesktopReadyCheck,
    build_pairing_parser,
    create_vsle_bluetooth_transport,
    run_pairing_command,
)

__all__ = [
    "DesktopPairingResult",
    "DesktopPairingService",
    "DesktopProfile",
    "DesktopProfileError",
    "DesktopProfileStore",
    "DesktopReadyCheck",
    "MacOSKeychainBackend",
    "MemoryCredentialBackend",
    "WindowsCredentialManagerBackend",
    "build_pairing_parser",
    "credential_backend_for_platform",
    "create_vsle_bluetooth_transport",
    "default_config_path",
    "resolve_profile_environment",
    "run_pairing_command",
    "save_claimed_profile",
]
