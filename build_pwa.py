# -*- coding: utf-8 -*-
"""Budowa PWA: nazwa cache SW z SHA-256, pliki.json, kopia do APK.

Jedna lista plików — sw.js i updater APK czytają ten sam pliki.json.
Nie wpisuj CACHE ani list ręcznie w sw.js.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(r"C:\Users\Domek\Desktop\przewodnik")
PWA = ROOT / "Przewodnik_P2S_aplikacja (1)"
APK_ASSETS = ROOT / "Przewodnik_P2S_projekt_APK (1)" / "app" / "src" / "main" / "assets"
# Gradle/debug — osobny kanał. Nie używać do stempla treści ani asercji vs wersja.json.
VER = ROOT / "Przewodnik_P2S_projekt_APK (1)" / "version.properties"

CACHE_RE = re.compile(r"const CACHE = '[^']+';")
CRITICAL_RE = re.compile(r"const CRITICAL = \[[^\]]*?\];", re.S)
OPTIONAL_RE = re.compile(r"const OPTIONAL = \[[^\]]*?\];", re.S)

# Ścieżki bez ./ — kanon dla pliki.json. SW dostaje ./ przy wstrzyknięciu.
KRYTYCZNE = [
    "index.html",
    "engine/manifold.js",
    "engine/manifold.wasm",
    "engine/LICENSE-manifold.txt",
]
OPCJONALNE = [
    "manifest.webmanifest",
    "icon-192.png",
    "icon-512.png",
    "icon-512-maskable.png",
    "apple-touch-icon.png",
    "favicon-32.png",
    "fflate.min.js",
    "builder.js",
    "gate.js",
    "export3mf.js",
    "preview.js",
    "projekt-ui.js",
    "spec-v1.schema.json",
    "przerobka-web.js",
    "przerobka-ui.js",
    "intent.js",
    "modele_guard.js",
    "modele-rura.js",
    "szukaj.js",
    "nauka-rag.js",
    "nauka-szablony.js",
    "nauka-pack.json",
    "szablony-obrotowe.js",
    "szablony-home.js",
    "szablony-12b.js",
    "szablony-12c.js",
    "szablony-12d.js",
    "szablony-12e.js",
    "rozmiar-slowny.js",
    "wymiary-zdanie.js",
    "archetypy.js",
    "archetypy-rejestr.json",
    "instancje.js",
    "klasyfikator.js",
    "progi-klasyfikatora.json",
    "nauka-ocena.js",
    "nitka.js",
    "spec-validate.js",
    "font-skrypt.js",
    "studio.css",
    "studio.js",
    "t0-checklista.js",
    "szpule-kalibrowane.js",
    "hms-dekoder.js",
    "analizator-3mf.js",
    "analizator-profile.js",
    "analizator-profile.json",
    "wyszukiwanie.js",
    "wektory-przewodnik.json",
    "ocena-zdjecia.js",
    "ocena-zdjecia.json",
    "drukarka-status.js",
    "wizja-projekt.js",
    "brep-cechy.js",
    "desktop.js",
    "modele/LICENSE-ocena-zdjecia.txt",
    "wersja.json",
    "pliki.json",
    "sw.js",
]

# ORT wasm/ONNX/webgpu — leniwie przy ocenie zdjęcia, nigdy w precache.
PRECACHE_ZAKAZANE_NAZWY = {
    "ort.webgpu.min.js",
    "ort.webgpu.min.mjs",
}


def read_version() -> str:
    text = VER.read_text(encoding="utf-8")
    m = re.search(r"^VERSION_NAME=(.+)$", text, re.M)
    if not m:
        raise SystemExit("VERSION_NAME missing in version.properties")
    return m.group(1).strip()


def hashed_bytes() -> bytes:
    # Meta (wersja.json, pliki.json, sw.js) nie wchodzi do stempla — inaczej
    # stempel zależy od pliku, który ten stempel zapisuje.
    parts = [(PWA / "index.html").read_bytes()]
    for rel in (
        "engine/manifold.js",
        "engine/manifold.wasm",
        "engine/LICENSE-manifold.txt",
        "builder.js",
        "gate.js",
        "export3mf.js",
        "preview.js",
        "projekt-ui.js",
        "szukaj.js",
        "nauka-rag.js",
        "nauka-szablony.js",
        "nauka-pack.json",
        "szablony-obrotowe.js",
        "szablony-home.js",
        "szablony-12b.js",
        "szablony-12c.js",
        "szablony-12d.js",
        "szablony-12e.js",
        "rozmiar-slowny.js",
        "wymiary-zdanie.js",
        "archetypy.js",
        "archetypy-rejestr.json",
        "instancje.js",
        "klasyfikator.js",
        "progi-klasyfikatora.json",
        "nitka.js",
        "przerobka-web.js",
        "przerobka-ui.js",
        "intent.js",
        "modele_guard.js",
        "modele-rura.js",
        "spec-v1.schema.json",
        "spec-validate.js",
        "studio.css",
        "studio.js",
        "t0-checklista.js",
        "szpule-kalibrowane.js",
        "hms-dekoder.js",
        "analizator-3mf.js",
        "analizator-profile.js",
        "analizator-profile.json",
        "wyszukiwanie.js",
        "wektory-przewodnik.json",
        "ocena-zdjecia.js",
        "ocena-zdjecia.json",
        "drukarka-status.js",
        "wizja-projekt.js",
        "brep-cechy.js",
        "desktop.js",
        "modele/LICENSE-ocena-zdjecia.txt",
    ):
        p = PWA / rel
        if p.exists():
            parts.append(p.read_bytes())
    # ONNX / ORT wasm nie w stemplu: nie są w precache. Obecność 25 MB na dysku
    # nie może zmieniać nazwy cache (klon gita bez binariów vs maszyna z modelem).
    ort_lic = PWA / "vendor" / "ort" / "LICENSE-onnxruntime-web.txt"
    if ort_lic.is_file():
        parts.append(ort_lic.read_bytes())
    parts.append("\n".join(KRYTYCZNE + opcjonalne_pelne()).encode("utf-8"))
    return b"".join(parts)


def cache_name(blob: bytes, version: str) -> str:
    digest = hashlib.sha256(blob).hexdigest()[:8]
    return f"p2s-guide-v{version}-{digest}"


def js_array(paths: list[str], extra_first: list[str] | None = None) -> str:
    items = list(extra_first or [])
    for p in paths:
        items.append("./" + p if not p.startswith("./") else p)
    # Stabilny zapis jak dotychczasowy sw.js (kilka na linię na początku).
    if len(items) <= 2:
        inner = ", ".join(repr(x) for x in items)
        return "[" + inner + "]"
    first = ", ".join(repr(x) for x in items[:2])
    rest = ", ".join(repr(x) for x in items[2:])
    return "[" + first + ",\n  " + rest + "]"


def stamp_sw(sw: str, name: str, krytyczne: list[str], opcjonalne: list[str]) -> str:
    if not CACHE_RE.search(sw):
        raise SystemExit("const CACHE = ... not found in sw.js")
    sw = CACHE_RE.sub(f"const CACHE = '{name}';", sw, count=1)
    crit_js = "const CRITICAL = " + js_array(krytyczne, extra_first=["./"]) + ";"
    opt_js = "const OPTIONAL = " + js_array(opcjonalne) + ";"
    if not CRITICAL_RE.search(sw):
        raise SystemExit("const CRITICAL = ... not found in sw.js")
    if not OPTIONAL_RE.search(sw):
        raise SystemExit("const OPTIONAL = ... not found in sw.js")
    sw = CRITICAL_RE.sub(crit_js, sw, count=1)
    sw = OPTIONAL_RE.sub(opt_js, sw, count=1)
    if "c.addAll(CRITICAL)" not in sw or "Promise.allSettled(OPTIONAL.map" not in sw:
        raise SystemExit("sw.js install must addAll(CRITICAL) and allSettled(OPTIONAL)")
    for rel in KRYTYCZNE + ["fflate.min.js", "builder.js", "gate.js"]:
        token = "./" + rel
        if token not in sw:
            raise SystemExit(f"{token} missing from sw.js after stamp")
    return sw


def verify_sw_matches_pliki(sw: str, pliki: dict) -> None:
    crit_m = CRITICAL_RE.search(sw)
    opt_m = OPTIONAL_RE.search(sw)
    if not crit_m or not opt_m:
        raise SystemExit("nie da się odczytać CRITICAL/OPTIONAL ze sw.js")
    def paths(block: str) -> list[str]:
        found = re.findall(r"'(\./[^']*)'", block)
        out = []
        for f in found:
            if f == "./":
                continue
            out.append(f[2:] if f.startswith("./") else f)
        return out
    crit = paths(crit_m.group(0))
    opt = paths(opt_m.group(0))
    if crit != list(pliki["krytyczne"]):
        raise SystemExit("CRITICAL w sw.js ≠ pliki.json krytyczne:\n" + str(crit) + "\n" + str(pliki["krytyczne"]))
    if opt != list(pliki["opcjonalne"]):
        raise SystemExit("OPTIONAL w sw.js ≠ pliki.json opcjonalne")


def write_pliki_json(version: str, stamp: str, opcjonalne: list[str] | None = None) -> dict:
    meta = {
        "wersja": version,
        "stempel": stamp,
        "krytyczne": list(KRYTYCZNE),
        "opcjonalne": list(opcjonalne if opcjonalne is not None else OPCJONALNE),
    }
    (PWA / "pliki.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    return meta


def copy_assets() -> None:
    APK_ASSETS.mkdir(parents=True, exist_ok=True)
    leftover_sw = APK_ASSETS / "sw.js"
    if leftover_sw.exists():
        leftover_sw.unlink()
    src_index = PWA / "index.html"
    dst_index = APK_ASSETS / "index.html"
    shutil.copyfile(src_index, dst_index)
    fflate = PWA / "fflate.min.js"
    if fflate.exists():
        shutil.copyfile(fflate, APK_ASSETS / "fflate.min.js")
    eng = APK_ASSETS / "engine"
    eng.mkdir(parents=True, exist_ok=True)
    for name in ("manifold.js", "manifold.wasm", "LICENSE-manifold.txt"):
        src = PWA / "engine" / name
        if src.exists():
            shutil.copyfile(src, eng / name)
    for name in (
        "builder.js", "gate.js", "export3mf.js", "preview.js", "projekt-ui.js",
        "szukaj.js", "nauka-rag.js", "nauka-szablony.js", "szablony-obrotowe.js", "szablony-home.js",
        "szablony-12b.js", "szablony-12c.js", "szablony-12d.js", "szablony-12e.js", "rozmiar-slowny.js", "wymiary-zdanie.js", "nauka-pack.json",
        "archetypy.js", "archetypy-rejestr.json",
        "instancje.js", "klasyfikator.js", "progi-klasyfikatora.json",
        "nitka.js", "przerobka-web.js", "przerobka-ui.js", "intent.js",
        "modele_guard.js", "modele-rura.js",
        "spec-v1.schema.json", "spec-validate.js", "font-skrypt.js",
        "studio.css", "studio.js", "t0-checklista.js",
        "szpule-kalibrowane.js", "hms-dekoder.js",
        "analizator-3mf.js", "analizator-profile.js", "analizator-profile.json",
        "wyszukiwanie.js", "wektory-przewodnik.json",
        "ocena-zdjecia.js", "ocena-zdjecia.json",
        "drukarka-status.js",
        "wizja-projekt.js",
        "brep-cechy.js",
        "desktop.js",
        "nauka-ocena.js",
        "wersja.json", "pliki.json",
        "manifest.webmanifest",
    ):
        src = PWA / name
        if src.exists():
            shutil.copyfile(src, APK_ASSETS / name)
    for rel_dir in ("modele", "vendor/ort"):
        src_dir = PWA / rel_dir
        if not src_dir.is_dir():
            continue
        dst_dir = APK_ASSETS / rel_dir
        dst_dir.mkdir(parents=True, exist_ok=True)
        for f in src_dir.iterdir():
            if f.is_file():
                shutil.copyfile(f, dst_dir / f.name)
    if src_index.read_bytes() != dst_index.read_bytes():
        raise SystemExit("PWA and APK index.html differ after copy")


# Markery `/* inlined … */` w kanonicznym index.html. Transformacja = ta sama
# co w `_sync_inlined_*.py`, nie surowy plik vs blok. preview.js jest w MODULES
# `_sync_inlined_core` (IIFE jak gate/builder/export3mf).
INLINED_MARKERS = (
    "gate.js",
    "builder.js",
    "export3mf.js",
    "preview.js",
    "projekt-ui.js",
    "przerobka-web.js",
    "przerobka-ui.js",
)


def _load_sync_core():
    path = ROOT / "_sync_inlined_core.py"
    spec = importlib.util.spec_from_file_location("_sync_inlined_core", path)
    if spec is None or spec.loader is None:
        raise SystemExit("nie wczytano _sync_inlined_core.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _strip_esm_projekt(src: str) -> str:
    text = re.sub(r"(?ms)^import\s+.*?;\s*", "", src)
    text = re.sub(r"(?m)^export\s+", "", text)
    if re.search(r"(?m)^\s*import\s+", text):
        raise SystemExit("nieusunięty import")
    return text


def _load_sync_projekt():
    path = ROOT / "_sync_inlined_projekt_ui.py"
    spec = importlib.util.spec_from_file_location("_sync_inlined_projekt_ui", path)
    if spec is None or spec.loader is None:
        raise SystemExit("nie wczytano _sync_inlined_projekt_ui.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _expected_projekt_ui_block() -> str:
    mod = _load_sync_projekt()
    return "/* inlined projekt-ui.js */\n" + mod.build_wrapped() + "</script>\n\n<script>\n"


def _slice_until_next(html: str, name: str, next_name: str) -> str | None:
    marker = f"/* inlined {name} */"
    next_marker = f"/* inlined {next_name} */"
    start = html.find(marker)
    if start < 0:
        return None
    end = html.find(next_marker, start + len(marker))
    if end < 0:
        return None
    return html[start:end]


def _expected_inlined_block(core, name: str) -> str:
    if name == "projekt-ui.js":
        return _expected_projekt_ui_block()
    if name == "przerobka-web.js":
        source = (ROOT / "przerobka-web.js").read_text(encoding="utf-8").rstrip() + "\n"
        return f"/* inlined {name} */\n" + source + "</script>\n\n<script>\n"
    if name == "przerobka-ui.js":
        # _sync_inlined_przerobka_ui.py czyta kopię PWA, nie korzeń (korzenia nie ma).
        ui = PWA / "przerobka-ui.js"
        if not ui.is_file():
            raise SystemExit("brak PWA/przerobka-ui.js do porównania inlined")
        source = ui.read_text(encoding="utf-8").rstrip() + "\n"
        return f"/* inlined {name} */\n" + source
    chain = list(core.MODULES)
    if name == "preview.js" and not any(n == "preview.js" for n, _, _ in chain):
        return (
            f"/* inlined {name} */\n"
            + core.inline_source(name, "")
            + "\n"
        )
    for mod_name, _next, prelude in chain:
        if mod_name == name:
            return f"/* inlined {name} */\n" + core.inline_source(name, prelude) + "\n"
    raise SystemExit(f"brak transformacji sync dla markera /* inlined {name} */")


def _actual_inlined_block(html: str, name: str) -> str | None:
    if name == "przerobka-ui.js":
        marker = f"/* inlined {name} */"
        start = html.find(marker)
        if start < 0:
            return None
        close = html.find("</script>", start)
        if close < 0:
            return None
        return html[start:close]
    nxt = {
        "gate.js": "builder.js",
        "builder.js": "export3mf.js",
        "export3mf.js": "preview.js",
        "preview.js": "projekt-ui.js",
        "projekt-ui.js": "przerobka-web.js",
        "przerobka-web.js": "przerobka-ui.js",
    }.get(name)
    if nxt is None:
        return None
    return _slice_until_next(html, name, nxt)


def verify_inlined_matches_source(html: str) -> None:
    found = re.findall(r"/\* inlined ([^*]+?) \*/", html)
    if not found:
        raise SystemExit("brak markerów /* inlined … */ w index.html")
    unknown = [n for n in found if n not in INLINED_MARKERS]
    if unknown:
        raise SystemExit(
            "nieznany marker inlined (brak transformacji sync): " + ", ".join(unknown)
        )
    missing = [n for n in INLINED_MARKERS if n not in found]
    if missing:
        raise SystemExit("brak markera inlined w index.html: " + ", ".join(missing))
    if found != list(INLINED_MARKERS):
        raise SystemExit(
            "kolejnosc markerow inlined != kontrakt:\n"
            + str(found)
            + "\n"
            + str(list(INLINED_MARKERS))
        )
    core = _load_sync_core()
    errors: list[str] = []
    ok: list[str] = []
    for name in found:
        expected = _expected_inlined_block(core, name)
        actual = _actual_inlined_block(html, name)
        if actual is None:
            errors.append(f"{name}: nie wycięto bloku")
            continue
        if actual != expected:
            errors.append(
                f"{name}: inlined != zrodlo po transformacji sync "
                f"(wstawka {len(actual)} znakow, oczekiwane {len(expected)})"
            )
        else:
            ok.append(name)
    if errors:
        raise SystemExit(
            "inlined != zrodlo po transformacji _sync_inlined_*.py:\n"
            + "\n".join(errors)
            + ("\nOK: " + ", ".join(ok) if ok else "")
        )
    print("inlined OK", ", ".join(found))


# Sufit: 30.08.2026 index ~3,11 MB → 3,40 MB. 6.09.2026 po 4.2.65 = 3 361 872 B
# (zostało 38 kB). 12e ~25–30 kB + druga czcionka ~80 kB nie mieszczą się w 3,40 MB.
# C0: 3,60 MB, decyzja właściciela 6.09.2026 (pomiar, nie zgadywanie).
INDEX_HTML_MAX_BYTES = 3_600_000
TRESC_BOX_RE = re.compile(r'<div class="box-t">Treść\s+([0-9]+(?:\.[0-9]+)+)</div>')


def najnowsza_tresc_changelog(html: str) -> str:
    """Aktualny boks = pierwszy Treść X.Y.Z w dokumencie (newest-first).

    Recenzja 31.08 widziała 4.2.22, bo brała pierwszy boks
    „Aktualizacja merytoryczna aplikacji” — to historia, nie nośnik wersji.
    Nie ruszamy tamtych wpisów. Last-in-DOM Treść to stary wpis w zakładce
    Aktualizuj (np. 4.2.26), więc nie bierzemy found[-1].
    """
    found = TRESC_BOX_RE.findall(html)
    if not found:
        raise SystemExit("brak boksu changelogu Treść X.Y.Z w index.html")

    def key(v: str) -> tuple[int, ...]:
        return tuple(int(p) for p in v.split("."))

    pierwszy = found[0]
    maksimum = max(found, key=key)
    if pierwszy != maksimum:
        raise SystemExit(
            f"pierwszy boks Treść {pierwszy} ≠ max {maksimum} "
            "— changelog Treść nie jest newest-first"
        )
    return pierwszy


def verify_wersja_changelog(html: str, version: str, pwa_wersja_json: Path | None = None) -> None:
    """Kanał treści: Treść X = przekazana wersja (= wersja.json jeśli już jest).

    Nie czyta version.properties ani apk/version.json.
    """
    naj = najnowsza_tresc_changelog(html)
    if naj != version:
        raise SystemExit(
            f"changelog Treść {naj} ≠ wersja treści {version}"
        )
    if pwa_wersja_json and pwa_wersja_json.is_file():
        meta = json.loads(pwa_wersja_json.read_text(encoding="utf-8"))
        wj = str(meta.get("wersja") or "")
        if wj and wj != version:
            raise SystemExit(f"wersja.json {wj} ≠ {version}")
    print("wersja changelog OK", naj)


def verify_trzy_nosiciele(html: str) -> None:
    """Kanał treści: pierwszy boks Treść = wersja.json = pliki.json.

    Nie porównywać z apk/version.json (OTA, origin 4.0.14) ani z
    version.properties (Gradle/debug) — osobne kanały, asercja byłaby szkodliwa.
    """
    boks = najnowsza_tresc_changelog(html)
    wj = str(json.loads((PWA / "wersja.json").read_text(encoding="utf-8")).get("wersja") or "")
    pj = str(json.loads((PWA / "pliki.json").read_text(encoding="utf-8")).get("wersja") or "")
    if not (boks == wj == pj):
        raise SystemExit(
            f"kanał treści: Treść {boks} / wersja.json {wj} / pliki.json {pj}"
        )
    print("kanał treści OK", boks)


def _load_sync_wyszukiwanie():
    path = ROOT / "_sync_wyszukiwanie.py"
    spec = importlib.util.spec_from_file_location("_sync_wyszukiwanie", path)
    if spec is None or spec.loader is None:
        raise SystemExit("nie wczytano _sync_wyszukiwanie.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _load_sync_ocena():
    path = ROOT / "_sync_ocena_zdjecia.py"
    spec = importlib.util.spec_from_file_location("_sync_ocena_zdjecia", path)
    if spec is None or spec.loader is None:
        raise SystemExit("nie wczytano _sync_ocena_zdjecia.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _load_sync_drukarka():
    path = ROOT / "_sync_drukarka.py"
    spec = importlib.util.spec_from_file_location("_sync_drukarka", path)
    if spec is None or spec.loader is None:
        raise SystemExit("nie wczytano _sync_drukarka.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _load_sync_wizja():
    path = ROOT / "_sync_wizja_projekt.py"
    spec = importlib.util.spec_from_file_location("_sync_wizja_projekt", path)
    if spec is None or spec.loader is None:
        raise SystemExit("nie wczytano _sync_wizja_projekt.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _norm_rel(rel: str) -> str:
    return rel.replace("\\", "/").lstrip("./")


def jest_zakazane_precache(rel: str) -> bool:
    n = _norm_rel(rel)
    low = n.lower()
    if low.endswith(".onnx"):
        return True
    if "vendor/ort/" in low or low.startswith("vendor/ort/"):
        base = low.rsplit("/", 1)[-1]
        if base.endswith(".wasm") or "asyncify" in base or base in PRECACHE_ZAKAZANE_NAZWY:
            return True
    return False


def zakazane_z_kryteriow() -> list[str]:
    kry = json.loads((ROOT / "kryteria.json").read_text(encoding="utf-8"))
    cfg = kry.get("pwa_precache") or {}
    return [_norm_rel(z) for z in (cfg.get("zakazane") or [])]


def list_ort_rel(base: Path | None = None) -> list[str]:
    out: list[str] = []
    ort = (base or PWA) / "vendor" / "ort"
    if not ort.is_dir():
        return out
    for f in sorted(ort.iterdir()):
        if f.is_file():
            out.append("vendor/ort/" + f.name)
    return out


def opcjonalne_pelne() -> list[str]:
    extra: list[str] = []
    seen: set[str] = set()
    zak = set(zakazane_z_kryteriow())
    for rel in list(OPCJONALNE) + list_ort_rel():
        n = _norm_rel(rel)
        if n in seen or jest_zakazane_precache(n) or n in zak:
            continue
        seen.add(n)
        extra.append(n)
    return extra


def verify_precache_bez_ciezarow(krytyczne: list[str], opcjonalne: list[str]) -> None:
    kry = json.loads((ROOT / "kryteria.json").read_text(encoding="utf-8"))
    cfg = kry.get("pwa_precache") or {}
    zakazane = set(zakazane_z_kryteriow())
    all_rel = [_norm_rel(r) for r in list(krytyczne) + list(opcjonalne)]
    for n in all_rel:
        if n in zakazane or jest_zakazane_precache(n):
            raise SystemExit(f"STOP: {n} w OPTIONAL/CRITICAL precache")
    max_b = int(cfg.get("precache_rdzen_max_B") or 8_000_000)
    total = 0
    for n in all_rel:
        p = PWA / n
        if p.is_file():
            total += p.stat().st_size
    if total > max_b:
        raise SystemExit(
            f"STOP: precache {total} B ({total / 1_000_000:.2f} MB) "
            f"> precache_rdzen_max_B {max_b}"
        )
    print("precache OK", total, "<=", max_b, "plikow", len(all_rel))


def verify_ocena_onnx() -> None:
    kry = json.loads((ROOT / "kryteria.json").read_text(encoding="utf-8"))
    o = kry.get("ocena_zdjecia") or {}
    max_b = int(o.get("onnx_max_B") or 8_000_000)
    side_max = int(o.get("sidecar_max_B") or 250_000)
    model = PWA / "modele" / "ocena-zdjecia.onnx"
    if not model.is_file():
        raise SystemExit("brak PWA/modele/ocena-zdjecia.onnx")
    n = model.stat().st_size
    if n > max_b:
        raise SystemExit(
            f"STOP: ONNX {n} B ({n / 1_000_000:.2f} MB) > onnx_max_B {max_b}"
        )
    side = PWA / "ocena-zdjecia.json"
    if not side.is_file():
        raise SystemExit("brak PWA/ocena-zdjecia.json")
    ns = side.stat().st_size
    if ns > side_max:
        raise SystemExit(f"ocena-zdjecia.json {ns} B > sidecar_max_B {side_max}")
    root_m = ROOT / "modele" / "ocena-zdjecia.onnx"
    if root_m.is_file() and root_m.read_bytes() != model.read_bytes():
        raise SystemExit("ocena-zdjecia.onnx korzeń ≠ PWA")
    print("ocena onnx OK", n, "<=", max_b, "sidecar", ns, "<=", side_max)


def verify_sidecar_wektorow() -> None:
    kry_path = ROOT / "kryteria.json"
    kry = json.loads(kry_path.read_text(encoding="utf-8"))
    max_b = int((kry.get("wyszukiwanie") or {}).get("sidecar_max_B") or 1_250_000)
    pwa_side = PWA / "wektory-przewodnik.json"
    root_side = ROOT / "wektory-przewodnik.json"
    if not pwa_side.is_file():
        raise SystemExit("brak PWA/wektory-przewodnik.json")
    n = pwa_side.stat().st_size
    if n > max_b:
        raise SystemExit(f"wektory-przewodnik.json {n} B przekracza sidecar_max_B {max_b}")
    if root_side.is_file() and root_side.read_bytes() != pwa_side.read_bytes():
        raise SystemExit("wektory-przewodnik.json korzeń ≠ PWA")
    print("sidecar wektory OK", n, "<=", max_b)
    ostrzez_sidecar_niezacommitowany()


def ostrzez_sidecar_niezacommitowany() -> None:
    """Ostrzeżenie (nie STOP): sidecar w PWA różni się od HEAD repo PWA.

    6.09.2026: Pages przez 6 publikacji (4.2.66–4.2.71) serwowało wektory z 4.2.65,
    bo zbudowany plik szedł do `git stash` przy merge. Sidecar wchodzi do stempla,
    więc musi iść do commita razem z index.html. Build roboczy nie ma się zatrzymać.
    """
    try:
        r = subprocess.run(
            ["git", "-C", str(PWA), "diff", "--quiet", "HEAD", "--", "wektory-przewodnik.json"],
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError:
        return
    if r.returncode == 1:
        print(
            "UWAGA: wektory-przewodnik.json w PWA różni się od HEAD — "
            "commit razem z index.html przed merge do main (nie stash)."
        )


def verify_index_size(n: int) -> None:
    if n > INDEX_HTML_MAX_BYTES:
        raise SystemExit(
            f"index.html {n} B przekracza sufit {INDEX_HTML_MAX_BYTES} B"
        )
    print("index sufit OK", n, "<=", INDEX_HTML_MAX_BYTES)


def read_shell_name() -> str:
    """VERSION_NAME z version.properties (sideload shell). Brak pliku = PWA."""
    if not VER.is_file():
        return "PWA"
    try:
        name = read_version()
    except SystemExit:
        return "PWA"
    return name or "PWA"


def chip_text(tresc: str, shell: str) -> str:
    # Stopka: treść bez kłamliwego "shell APK" (PWA/file nie jest APK).
    # #sheetVer: neutralny fallback; p2sChipText() nadpisuje po starcie.
    return f"treść {tresc}"


FOOT_STAMP_RE = re.compile(
    r'(<div class="foot">)Przewodnik 3\.3 · treść [0-9.]+(?: · shell APK [^<·]+)? · stan na ([0-9]{2}\.[0-9]{2}\.[0-9]{4})'
)
SHEET_VER_RE = re.compile(
    r'<span(?: id="sheetVer")? style="opacity:\.8">(?:Wersja aplikacji: [^<]+|treść [^<]+)</span>'
)


def stamp_index_meta(html: str, version: str, shell: str | None = None) -> str:
    if not shell:
        shell = read_shell_name()
    inject = (
        f"window.P2S_VER_NAME={version!r};\n"
        f"window.P2S_SHELL_NAME={shell!r};\n"
        f"window.__P2S_META={{wersja:{version!r},talk_ms:300000,spec_ms:600000,shell:{shell!r}}};\n"
    )
    html = re.sub(r"window\.P2S_VER_NAME\s*=\s*['\"][^'\"]*['\"];\s*", "", html, count=1)
    html = re.sub(r"window\.P2S_SHELL_NAME\s*=\s*['\"][^'\"]*['\"];\s*", "", html, count=1)
    html = re.sub(r"window\.__P2S_META\s*=\s*\{[^;]*\};\s*", "", html, count=1)
    if "window.__P2S_DECISION=" in html:
        html = html.replace("window.__P2S_DECISION=", inject + "window.__P2S_DECISION=", 1)
    chip = chip_text(version, shell)
    sheet_fallback = "treść —"

    def foot_sub(m: re.Match[str]) -> str:
        return f"{m.group(1)}Przewodnik 3.3 · {chip} · stan na {m.group(2)}"

    html, nfoot = FOOT_STAMP_RE.subn(foot_sub, html, count=1)
    if nfoot != 1:
        raise SystemExit(f"stopka: oczekiwano 1, jest {nfoot}")
    sheet_new = f'<span id="sheetVer" style="opacity:.8">{sheet_fallback}</span>'
    html, nsheet = SHEET_VER_RE.subn(sheet_new, html, count=1)
    if nsheet != 1:
        raise SystemExit(f"sheetVer: oczekiwano 1, jest {nsheet}")
    if "Wersja aplikacji:" in html:
        raise SystemExit("hardcoded Wersja aplikacji leftover in index.html")
    return html




def main() -> None:
    _load_sync_wyszukiwanie().main()
    _load_sync_ocena().main()
    _load_sync_drukarka().main()
    _load_sync_wizja().main()
    index_path = PWA / "index.html"
    html_now = index_path.read_text(encoding="utf-8")
    verify_inlined_matches_source(html_now)
    verify_sidecar_wektorow()
    verify_ocena_onnx()
    # Kanał treści = pierwszy boks Treść. Gradle i apk/version.json — osobno.
    version = najnowsza_tresc_changelog(html_now)
    verify_wersja_changelog(html_now, version, PWA / "wersja.json")
    shell = read_shell_name()
    html = stamp_index_meta(html_now, version, shell)
    index_path.write_text(html, encoding="utf-8", newline="\n")
    opcjonalne = opcjonalne_pelne()
    verify_precache_bez_ciezarow(KRYTYCZNE, opcjonalne)
    index_bytes = index_path.read_bytes()
    digest = hashlib.sha256(hashed_bytes()).hexdigest()[:8]
    name = cache_name(hashed_bytes(), version)
    pliki = write_pliki_json(version, digest, opcjonalne)
    sw_path = PWA / "sw.js"
    sw = stamp_sw(sw_path.read_text(encoding="utf-8"), name, KRYTYCZNE, opcjonalne)
    sw_path.write_text(sw, encoding="utf-8", newline="\n")
    meta = {
        "wersja": version,
        "talk_ms": 300000,
        "spec_ms": 600000,
        "cache": name,
        "stamp": digest,
        "profil_domyslny": "konserwatywny",
    }
    (PWA / "wersja.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    copy_assets()
    sw_txt = sw_path.read_text(encoding="utf-8")
    for p in KRYTYCZNE:
        if "./" + p not in sw_txt:
            raise SystemExit("sw.js nie ma " + p)
    verify_sw_matches_pliki(sw_txt, pliki)
    print("version", version)
    print("cache", name)
    print("pliki.json", len(pliki["krytyczne"]), "krytyczne", len(pliki["opcjonalne"]), "opcjonalne")
    print("index bytes", len(index_bytes))
    verify_index_size(len(index_bytes))
    print("apk identical", (PWA / "index.html").read_bytes() == (APK_ASSETS / "index.html").read_bytes())
    print("fflate pwa", (PWA / "fflate.min.js").exists())
    print("fflate apk", (APK_ASSETS / "fflate.min.js").exists())
    verify_trzy_nosiciele(index_path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
