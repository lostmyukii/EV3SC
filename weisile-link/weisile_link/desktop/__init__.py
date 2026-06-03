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

__all__ = [
    "DesktopProfile",
    "DesktopProfileError",
    "DesktopProfileStore",
    "MacOSKeychainBackend",
    "MemoryCredentialBackend",
    "WindowsCredentialManagerBackend",
    "credential_backend_for_platform",
    "default_config_path",
    "resolve_profile_environment",
    "save_claimed_profile",
]
