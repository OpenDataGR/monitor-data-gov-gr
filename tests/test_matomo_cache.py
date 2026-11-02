"""The Matomo response cache must not grow without bound. It used to be ONE Redis hash that only ever grew (HSET,
no per-field expiry -- the 1 h TTL was only checked when reading, so stale fields stayed forever) plus an unbounded
in-process dict copy in every worker; with date-range keys that change daily and reports of hundreds of KB, Redis
reached 194 MB in 66 keys (`redis-cli --bigkeys`: hash `cache:matomo`, 1386 fields). These tests pin the bounded,
expiring behaviour."""
import hashlib
import json

import config

import app as appmod


class FakeRedis:
    def __init__(self):
        self.store, self.ttls, self.deleted = {}, {}, []

    def get(self, key):
        return self.store.get(key)

    def set(self, key, value, ex=None):
        self.store[key] = value
        self.ttls[key] = ex

    def delete(self, key):
        self.deleted.append(key)


def _cache():
    return appmod._SharedQueryCache("matomo")


def test_every_entry_is_its_own_redis_key_with_an_expiry(monkeypatch):
    redis = FakeRedis()
    monkeypatch.setattr(appmod, "_redis_client", lambda: redis)
    cache = _cache()

    cache.set("Some.report|{}", {"data": [1, 2, 3], "ts": 1.0}, ttl=600)

    expected = "cache:matomo:" + hashlib.sha1(b"Some.report|{}").hexdigest()
    assert list(redis.store) == [expected] and redis.ttls[expected] == 600       # a real EX, not a hash field
    assert cache.get("Some.report|{}") == {"data": [1, 2, 3], "ts": 1.0}
    assert cache._local == {}                                                    # no in-process copy while Redis works


def test_the_old_never_expiring_hash_is_dropped_once(monkeypatch):
    redis = FakeRedis()
    monkeypatch.setattr(appmod, "_redis_client", lambda: redis)
    cache = _cache()
    cache.set("a", {"x": 1}); cache.set("b", {"x": 2}); cache.set("c", {"x": 3})
    assert redis.deleted == ["cache:matomo"]


def test_without_redis_the_local_fallback_is_bounded(monkeypatch):
    monkeypatch.setattr(appmod, "_redis_client", lambda: None)
    cache = _cache()
    for i in range(cache._LOCAL_MAX + 50):
        cache.set(f"key{i}", {"i": i})
    assert len(cache._local) == cache._LOCAL_MAX
    assert cache.get("key0") is None and cache.get(f"key{cache._LOCAL_MAX + 49}") == {"i": cache._LOCAL_MAX + 49}


def test_a_redis_write_error_falls_back_to_the_bounded_local_copy(monkeypatch):
    class Broken(FakeRedis):
        def set(self, *a, **k):
            raise RuntimeError("redis down")
    monkeypatch.setattr(appmod, "_redis_client", lambda: Broken())
    cache = _cache()
    cache.set("k", {"v": 1})
    assert cache._local == {"k": {"v": 1}}


class _Resp:
    def __init__(self, payload):
        self._payload = payload
        self.status_code = 200

    def raise_for_status(self):
        pass

    def json(self):
        return self._payload


def test_matomo_get_passes_the_ttl_and_cache_false_skips_the_cache_entirely(monkeypatch):
    redis = FakeRedis()
    monkeypatch.setattr(appmod, "_redis_client", lambda: redis)
    monkeypatch.setattr(appmod, "_MATOMO_CACHE", _cache())
    monkeypatch.setattr(config, "MATOMO_TOKEN", "tok")
    posts = []

    def fake_post(url, data=None, **kw):
        posts.append(data["method"])
        return _Resp([{"label": "x"}])

    monkeypatch.setattr(appmod.requests, "post", fake_post)

    appmod._matomo_get("Small.report", {"a": 1})
    appmod._matomo_get("Small.report", {"a": 1})                      # served from the cache
    assert posts == ["Small.report"]
    assert set(redis.ttls.values()) == {appmod._MATOMO_CACHE_TTL}      # and it expires

    redis.store.clear(); redis.ttls.clear(); posts.clear()
    appmod._matomo_get("Huge.report", {"a": 1}, cache=False)
    appmod._matomo_get("Huge.report", {"a": 1}, cache=False)           # asked again every time ...
    assert posts == ["Huge.report", "Huge.report"]
    assert redis.store == {}                                           # ... and never stored


def test_the_big_raw_reports_are_not_cached(monkeypatch):
    """Per-day page lists, the whole-portal downloads and API-event lists are reduced to a compact result by
    their callers (which cache that); the raw rows must not also be written to Redis."""
    seen = []
    monkeypatch.setattr(appmod, "_matomo_get", lambda method, params, **kw: seen.append((method, kw.get("cache", True))) or [])
    appmod._dataset_day_cache.clear(); appmod._all_downloads_cache.clear(); appmod._all_api_events_cache.clear()
    appmod._dataset_page_visits_for_day("2026-01-05")
    appmod._matomo_all_downloads("2026-01-01", "2026-01-30")
    appmod._matomo_all_api_events("2026-01-01", "2026-01-30")
    assert seen == [("Actions.getPageUrls", False), ("Actions.getDownloads", False), ("Events.getAction", False)]
