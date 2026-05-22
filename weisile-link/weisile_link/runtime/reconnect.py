"""Reconnect timing policy for WeisileLink transports.

Sources:
- VSLE spec Section 16.3 requires exponential backoff with jitter:
  0.5s, 1s, 2s, then 5s max for attempt 4 and later.
"""

import random
from dataclasses import dataclass, field
from typing import Callable

JitterSource = Callable[[int], float]


def _random_jitter(_attempt: int) -> float:
    return random.uniform(-1.0, 1.0)


@dataclass(frozen=True)
class ReconnectPolicy:
    """Calculate reconnect delays from the Section 16.3 backoff table."""

    max_delay_s: float = 5.0
    jitter_fraction: float = 0.2
    jitter_source: JitterSource = field(default_factory=lambda: _random_jitter)

    def delay_for_attempt(self, attempt: int) -> float:
        """Return the reconnect delay in seconds for a 1-based attempt."""
        normalized_attempt = max(1, int(attempt))
        if normalized_attempt <= 3:
            base_delay = 0.5 * (2 ** (normalized_attempt - 1))
        else:
            base_delay = self.max_delay_s
        jitter = max(-1.0, min(1.0, self.jitter_source(normalized_attempt)))
        jittered_delay = base_delay * (1.0 + self.jitter_fraction * jitter)
        safe_delay = max(0.0, min(self.max_delay_s, jittered_delay))
        return round(safe_delay, 3)
