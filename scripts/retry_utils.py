#!/usr/bin/env python3
"""
外部 HTTP API および Gemini API 呼び出し向けの共通リトライ・バックオフユーティリティ。

標準ライブラリのみに依存してロードできるため、`requests` をインストールしない
ワークフロー（例: moon_data.py）からも安全にインポートできる。
"""

import http.client
import json
import math
import time
import urllib.error
import urllib.request
from typing import Any, Callable, Dict, Optional

# HTTP取得リトライ設定（各ワークフローの実行上限時間を圧迫しない有界設定）
HTTP_MAX_ATTEMPTS = 3
HTTP_RETRY_BACKOFF_BASE = 1.0
HTTP_RETRY_BACKOFF_MAX = 4.0
HTTP_RETRYABLE_STATUS_CODES = frozenset({429, 500, 502, 503, 504})

# Gemini 生成呼び出しの一時障害リトライ設定
# 注意: 429 / RESOURCE_EXHAUSTED（日次・分次クオータ超過）は絶対にリトライしない。
GEMINI_MAX_ATTEMPTS = 3
GEMINI_RETRY_BACKOFF_BASE = 2.0
GEMINI_RETRY_BACKOFF_MAX = 6.0
GEMINI_TRANSIENT_STATUS_CODES = frozenset({500, 502, 503, 504})
_GEMINI_TRANSIENT_STATUSES = frozenset({'UNAVAILABLE', 'INTERNAL', 'DEADLINE_EXCEEDED'})
_GEMINI_TRANSIENT_EXC_NAMES = frozenset({
    'TimeoutException',
    'ReadTimeout',
    'ConnectTimeout',
    'PoolTimeout',
    'WriteTimeout',
    'ConnectError',
    'ReadError',
    'RemoteProtocolError',
})


def finite_number(value: Any) -> Optional[float]:
    """bool を除く有限の数値だけを比較用に返す。"""
    if isinstance(value, bool) or value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def extract_status_code(obj: Any, *, include_code: bool = False) -> Optional[int]:
    """レスポンスまたは例外から HTTP ステータスコードを安全に取得する。"""
    attrs = ('status_code', 'code') if include_code else ('status_code',)
    for attr in attrs:
        value = getattr(obj, attr, None)
        if isinstance(value, int) and not isinstance(value, bool):
            return value
    return None


def parse_retry_after(
    headers: Any,
    max_delay: float = HTTP_RETRY_BACKOFF_MAX,
) -> Optional[float]:
    """Retry-After ヘッダの数値秒を上限付きで返す。"""
    if not headers or not hasattr(headers, 'get'):
        return None
    raw_value = headers.get('Retry-After')
    if raw_value is None:
        return None
    seconds = finite_number(raw_value)
    if seconds is None or seconds <= 0:
        return None
    return min(seconds, max_delay)


def compute_retry_delay(
    attempt_index: int,
    response: Any = None,
    *,
    base: float = HTTP_RETRY_BACKOFF_BASE,
    cap: float = HTTP_RETRY_BACKOFF_MAX,
) -> float:
    """指数バックオフ待機時間（秒）を計算する。"""
    backoff = min(cap, base * (2 ** attempt_index))
    retry_after = parse_retry_after(getattr(response, 'headers', None), max_delay=cap)
    if retry_after is not None:
        return max(backoff, retry_after)
    return backoff


def is_retryable_http_status(status_code: Optional[int]) -> bool:
    """一時的な HTTP エラー (429 / 5xx) か判定する。"""
    if status_code is None:
        return False
    return status_code in HTTP_RETRYABLE_STATUS_CODES or 500 <= status_code < 600


def is_retryable_requests_exception(
    exc: Exception,
    requests_module: Any = None,
) -> bool:
    """requests のタイムアウト・接続エラー・一時的 HTTP エラーなら True を返す。"""
    if isinstance(exc, (TimeoutError, ConnectionError)):
        return True

    if requests_module is None:
        try:
            import requests as _requests
            requests_module = _requests
        except ImportError:
            requests_module = None

    requests_exc = getattr(requests_module, 'exceptions', None) if requests_module is not None else None
    if requests_exc is not None:
        retryable_types = tuple(
            cls for cls in (
                getattr(requests_exc, 'Timeout', None),
                getattr(requests_exc, 'ConnectionError', None),
                getattr(requests_exc, 'ChunkedEncodingError', None),
            )
            if isinstance(cls, type)
        )
        if retryable_types and isinstance(exc, retryable_types):
            return True

        http_error_cls = getattr(requests_exc, 'HTTPError', None)
        if isinstance(http_error_cls, type) and isinstance(exc, http_error_cls):
            resp = getattr(exc, 'response', None)
            status = extract_status_code(resp) or extract_status_code(exc)
            return is_retryable_http_status(status)

    resp = getattr(exc, 'response', None)
    status = extract_status_code(resp) or extract_status_code(exc)
    if status is not None:
        return is_retryable_http_status(status)

    return False


def http_get_with_retry(
    url: str,
    *,
    timeout: float,
    params: Optional[Dict[str, Any]] = None,
    headers: Optional[Dict[str, str]] = None,
    source_name: str = 'HTTP',
    max_attempts: int = HTTP_MAX_ATTEMPTS,
    max_retry_elapsed: Optional[float] = None,
    request_fn: Optional[Callable[..., Any]] = None,
    requests_module: Any = None,
    sleep_fn: Optional[Callable[[float], None]] = None,
) -> Any:
    """
    requests.get 互換関数をラップした有界リトライ付き HTTP GET ヘルパー。
    タイムアウト・接続エラー・一時的 429/5xx のみを指数バックオフ付きで再試行する。
    """
    if sleep_fn is None:
        sleep_fn = time.sleep
    if requests_module is None:
        import requests as _requests
        requests_module = _requests
    if request_fn is None:
        request_fn = requests_module.get

    attempts = max(1, int(max_attempts))
    retry_elapsed_limit = (
        timeout * 1.2 if max_retry_elapsed is None else max_retry_elapsed
    )
    started_at = time.monotonic()
    request_kwargs: Dict[str, Any] = {'timeout': timeout}
    if params is not None:
        request_kwargs['params'] = params
    if headers is not None:
        request_kwargs['headers'] = headers

    for attempt in range(attempts):
        try:
            resp = request_fn(url, **request_kwargs)
        except Exception as exc:
            elapsed = time.monotonic() - started_at
            can_retry = (
                attempt + 1 < attempts
                and is_retryable_requests_exception(exc, requests_module)
                and elapsed < retry_elapsed_limit
            )
            if not can_retry:
                raise
            delay = compute_retry_delay(attempt)
            print(
                f"  [WARN] {source_name} 取得リトライ "
                f"({attempt + 1}/{attempts - 1}): {exc}"
            )
            sleep_fn(delay)
            continue

        status_code = extract_status_code(resp)
        if is_retryable_http_status(status_code):
            elapsed = time.monotonic() - started_at
            if attempt + 1 < attempts and elapsed < retry_elapsed_limit:
                delay = compute_retry_delay(attempt, resp)
                close_fn = getattr(resp, 'close', None)
                if callable(close_fn):
                    close_fn()
                print(
                    f"  [WARN] {source_name} HTTP {status_code} リトライ "
                    f"({attempt + 1}/{attempts - 1})"
                )
                sleep_fn(delay)
                continue
            resp.raise_for_status()
            raise RuntimeError(f"{source_name} returned HTTP {status_code}")

        try:
            resp.raise_for_status()
        except Exception as exc:
            elapsed = time.monotonic() - started_at
            can_retry = (
                attempt + 1 < attempts
                and is_retryable_requests_exception(exc, requests_module)
                and elapsed < retry_elapsed_limit
            )
            if not can_retry:
                raise
            delay = compute_retry_delay(attempt, getattr(exc, 'response', resp))
            close_fn = getattr(resp, 'close', None)
            if callable(close_fn):
                close_fn()
            print(
                f"  [WARN] {source_name} 応答エラーリトライ "
                f"({attempt + 1}/{attempts - 1}): {exc}"
            )
            sleep_fn(delay)
            continue

        return resp

    raise RuntimeError(f"{source_name} fetch failed after {attempts} attempts")


def _is_retryable_urllib_exception(exc: Exception) -> bool:
    """urllib.request / JSON デコードにおける一時的エラーか判定する。"""
    if isinstance(exc, urllib.error.HTTPError):
        return is_retryable_http_status(getattr(exc, 'code', None))
    if isinstance(
        exc,
        (
            TimeoutError,
            ConnectionError,
            urllib.error.URLError,
            http.client.HTTPException,
            json.JSONDecodeError,
            OSError,
        ),
    ):
        return True
    return False


def fetch_json_urllib_with_retry(
    url: str,
    *,
    timeout: float = 18.0,
    source_name: str = 'HTTP',
    max_attempts: int = HTTP_MAX_ATTEMPTS,
    max_retry_elapsed: Optional[float] = None,
    urlopen_fn: Optional[Callable[..., Any]] = None,
    sleep_fn: Optional[Callable[[float], None]] = None,
) -> Any:
    """
    標準ライブラリ urllib.request を用いた有界リトライ付き JSON 取得ヘルパー。
    タイムアウト・ネットワークエラー・一時的 429/5xx・不完全応答を再試行する。
    """
    if sleep_fn is None:
        sleep_fn = time.sleep
    if urlopen_fn is None:
        urlopen_fn = urllib.request.urlopen

    attempts = max(1, int(max_attempts))
    retry_elapsed_limit = (
        timeout * 1.2 if max_retry_elapsed is None else max_retry_elapsed
    )
    started_at = time.monotonic()

    for attempt in range(attempts):
        try:
            with urlopen_fn(url, timeout=timeout) as resp:
                raw = resp.read().decode('utf-8')
            return json.loads(raw)
        except Exception as exc:
            elapsed = time.monotonic() - started_at
            can_retry = (
                attempt + 1 < attempts
                and _is_retryable_urllib_exception(exc)
                and elapsed < retry_elapsed_limit
            )
            if not can_retry:
                raise
            delay = compute_retry_delay(attempt, exc)
            print(
                f"  [WARN] {source_name} 取得リトライ "
                f"({attempt + 1}/{attempts - 1}): {exc}"
            )
            sleep_fn(delay)

    raise RuntimeError(f"{source_name} fetch failed after {attempts} attempts")


def is_retryable_gemini_exception(exc: Exception) -> bool:
    """
    Gemini API の一時的障害（500/502/503/504・UNAVAILABLE・一時的通信エラー）のみ True。
    429 / RESOURCE_EXHAUSTED（クオータ超過）や通常の引数・論理エラーは再試行しない。
    """
    code = extract_status_code(exc, include_code=True)
    if code is None:
        resp = getattr(exc, 'response', None)
        code = extract_status_code(resp, include_code=True)

    status = getattr(exc, 'status', None)
    status_upper = status.upper() if isinstance(status, str) else ''

    # 429 / RESOURCE_EXHAUSTED はクオータ保護のため即時終了（リトライ厳禁）
    if code == 429 or status_upper == 'RESOURCE_EXHAUSTED':
        return False

    if code in GEMINI_TRANSIENT_STATUS_CODES:
        return True
    if status_upper in _GEMINI_TRANSIENT_STATUSES:
        return True
    if isinstance(exc, (TimeoutError, ConnectionError)):
        return True

    mro_names = {cls.__name__ for cls in type(exc).__mro__}
    return bool(mro_names & _GEMINI_TRANSIENT_EXC_NAMES)


def call_gemini_with_retry(
    fn: Callable[[], Any],
    *,
    source_name: str = 'Gemini',
    max_attempts: int = GEMINI_MAX_ATTEMPTS,
    sleep_fn: Optional[Callable[[float], None]] = None,
) -> Any:
    """
    Gemini API 呼び出しを 503 UNAVAILABLE 等の一時的エラー時のみ有界リトライする。
    429 / RESOURCE_EXHAUSTED 時はリトライせず即座に例外を送出する。
    """
    if sleep_fn is None:
        sleep_fn = time.sleep
    attempts = max(1, int(max_attempts))
    for attempt in range(attempts):
        try:
            return fn()
        except Exception as exc:
            if attempt + 1 >= attempts or not is_retryable_gemini_exception(exc):
                raise
            delay = compute_retry_delay(
                attempt,
                base=GEMINI_RETRY_BACKOFF_BASE,
                cap=GEMINI_RETRY_BACKOFF_MAX,
            )
            print(
                f"  [WARN] {source_name} 一時エラーリトライ "
                f"({attempt + 1}/{attempts - 1}): {exc}"
            )
            sleep_fn(delay)

    raise RuntimeError(f"{source_name} call failed after {attempts} attempts")
