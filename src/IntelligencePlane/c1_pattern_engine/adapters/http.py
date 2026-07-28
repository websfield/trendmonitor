"""The shared keyless HTTP utility (Phase 7 R3) — stdlib ``urllib``, hardened.

Transport contract (every clause is a security control, not a preference):

* **https-only, default certificate verification** — no ``ssl`` context loosening anywhere.
* **Redirects disabled** — the simpler of the two sanctioned branches: ``urllib`` follows
  cross-host redirects by default, so an open redirect on an allowlisted source would be an SSRF
  pivot; here any 3xx is a fetch failure (→ ``AdapterDark`` upstream), never a follow.
* **Host pinned at request time** — the final constructed URL is validated against the source's
  allowlisted host immediately before the request (``TrendAllowlist.check_url``).
* **Hard response-size cap with bounded read** — a fast, huge, or bombed response errors at the
  cap; timeouts alone don't catch it. (Compression is not requested, so no decompression bomb
  surface exists — the client never sends ``Accept-Encoding``.)
* **Bounded retry with backoff; per-host rate limiting** — transient failures (URLError, 5xx,
  429) retry a fixed small number of times then fail; 4xx never retries. The nightly load is
  ~registry-cap x sources; pacing keeps each source within polite etiquette, and chronic
  rate-limiting degrades honestly to a stated coverage gap, never a breach.

No credential exists on this path (keyless by design, CLAUDE.md rule 2). Everything injectable
(opener, clock, sleeper) so the test suite never touches the network.
"""

from __future__ import annotations

import time as _time
import urllib.error
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass, field

from c1_pattern_engine.adapters.allowlist import TrendAllowlist

__all__ = ["FetchFailed", "KeylessHttpClient"]

MAX_RESPONSE_BYTES = 5 * 1024 * 1024  # hard cap: no legitimate feed/API payload approaches this
TIMEOUT_SECONDS = 10.0
MAX_ATTEMPTS = 3  # 1 try + 2 retries; never unbounded
BACKOFF_BASE_SECONDS = 1.5
MIN_INTERVAL_PER_HOST_SECONDS = 1.0


class FetchFailed(RuntimeError):
    """Transport/protocol failure. The adapter layer converts this to AdapterDark — degraded
    coverage is surfaced, never papered over with a fabricated series."""


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise FetchFailed(f"redirect refused ({code} → {newurl!r}): redirects are disabled")


def _default_opener(url: str, timeout: float) -> tuple[int, bytes]:
    opener = urllib.request.build_opener(_NoRedirect())
    # https is enforced by the caller's allowlist check before this function is ever reached.
    request = urllib.request.Request(
        url, headers={"User-Agent": "ugc-intelligence-trend-monitor/1.0"}
    )
    with opener.open(request, timeout=timeout) as response:
        body = response.read(MAX_RESPONSE_BYTES + 1)
        return int(response.status), body


@dataclass
class KeylessHttpClient:
    """``get(source_name, url) -> bytes`` with every hardening clause above enforced."""

    allowlist: TrendAllowlist
    opener: Callable[[str, float], tuple[int, bytes]] = field(default=_default_opener)
    sleeper: Callable[[float], None] = field(default=_time.sleep)
    clock: Callable[[], float] = field(default=_time.monotonic)
    _last_request_at: dict[str, float] = field(default_factory=dict)

    def get(self, source_name: str, url: str) -> bytes:
        # The final-URL host check — the request-time layer of the two-layer allowlist.
        self.allowlist.check_url(source_name, url)
        host = self.allowlist.require(source_name).host

        last = self._last_request_at.get(host)
        if last is not None:
            wait = MIN_INTERVAL_PER_HOST_SECONDS - (self.clock() - last)
            if wait > 0:
                self.sleeper(wait)

        failure: Exception | None = None
        for attempt in range(MAX_ATTEMPTS):
            self._last_request_at[host] = self.clock()
            try:
                status, body = self.opener(url, TIMEOUT_SECONDS)
            except urllib.error.HTTPError as exc:  # non-2xx with a status
                if exc.code == 429 or exc.code >= 500:
                    failure = exc  # transient: retry with backoff
                else:
                    raise FetchFailed(f"{source_name}: HTTP {exc.code}, not retried") from exc
            except FetchFailed:
                raise  # redirect refusal etc. — deterministic, never retried
            except Exception as exc:  # URLError, timeout, TLS failure — transient class
                failure = exc
            else:
                if status != 200:
                    raise FetchFailed(f"{source_name}: HTTP {status}")
                if len(body) > MAX_RESPONSE_BYTES:
                    raise FetchFailed(
                        f"{source_name}: response exceeded the {MAX_RESPONSE_BYTES}-byte cap"
                    )
                return body
            if attempt < MAX_ATTEMPTS - 1:
                self.sleeper(BACKOFF_BASE_SECONDS * (2**attempt))

        raise FetchFailed(
            f"{source_name}: transient failure after {MAX_ATTEMPTS} attempts: {failure!r}"
        ) from failure
