"""Extract the UI tree + exact RectTransform/graphic properties from Unity scenes.

Produces a markdown spec per scene for pixel-accurate reimplementation.
Component detection is field-based (no GUID table needed for built-ins).
"""
import re, os, glob, sys, io

ROOT = "D:/Chitrang_ViitorCloud/R&D/Sliding-Puzzle"
GAME = os.path.join(ROOT, "Assets/Games/Sliding-Puzzle")

# ── guid -> asset name (sprites, fonts, scripts) ───────────────────────────
def build_guid_map():
    m = {}
    for base in [os.path.join(ROOT, "Assets")]:
        for meta in glob.glob(base + "/**/*.meta", recursive=True):
            try:
                head = open(meta, encoding="utf-8", errors="replace").read(400)
            except OSError:
                continue
            g = re.search(r"guid: (\w+)", head)
            if g:
                name = os.path.basename(meta)[:-5]
                m[g.group(1)] = name
    return m

GUID = build_guid_map()

def gname(guid):
    return GUID.get(guid, guid[:8] + "…")

def f(v):
    """Trim floats: 1.0 -> 1, 0.500 -> 0.5"""
    try:
        x = float(v)
        if x == int(x):
            return str(int(x))
        return ("%.4f" % x).rstrip("0")
    except (TypeError, ValueError):
        return str(v)

def vec(body, key):
    m = re.search(key + r": \{x: ([-\de.+]+), y: ([-\de.+]+)(?:, z: ([-\de.+]+))?(?:, w: ([-\de.+]+))?\}", body)
    if not m:
        return None
    parts = [f(m.group(1)), f(m.group(2))]
    if m.group(3) is not None:
        parts.append(f(m.group(3)))
    if m.group(4) is not None:
        parts.append(f(m.group(4)))
    return "(" + ", ".join(parts) + ")"

def color(body, key="m_Color"):
    m = re.search(key + r": \{r: ([-\d.e+]+), g: ([-\d.e+]+), b: ([-\d.e+]+), a: ([-\d.e+]+)\}", body)
    if not m:
        return None
    r, g, b, a = (float(m.group(i)) for i in range(1, 5))
    hexs = "#%02X%02X%02X" % (round(r * 255), round(g * 255), round(b * 255))
    return f"{hexs} (a={f(a)})"

TRANS = {"0": "None", "1": "ColorTint", "2": "SpriteSwap", "3": "Animation"}
ALIGN = {"257": "Left|Middle", "513": "Center|Middle", "1025": "Right|Middle",
         "258": "Left|Top", "514": "Center|Top", "260": "Left|Bottom", "516": "Center|Bottom"}

def parse(scene_path):
    txt = open(scene_path, encoding="utf-8", errors="replace").read()
    docs = re.split(r"\n--- ", txt)
    node = {}      # fileID -> {cls, body}
    gos = {}       # fileID -> {name, comps, active}
    for d in docs:
        m = re.match(r"!u!(\d+) &(\d+)", d)
        if not m:
            continue
        cls, fid = m.group(1), m.group(2)
        node[fid] = {"cls": cls, "body": d}
        if cls == "1":
            nm = re.search(r"m_Name: (.*)", d)
            act = re.search(r"m_IsActive: (\d)", d)
            gos[fid] = {
                "name": (nm.group(1).strip().strip("'") if nm else "?"),
                "comps": re.findall(r"component: \{fileID: (\d+)\}", d),
                "active": act.group(1) == "1" if act else True,
            }
    # rect transforms
    rt = {}
    for fid, n in node.items():
        if n["cls"] not in ("224", "4"):
            continue
        b = n["body"]
        go = re.search(r"m_GameObject: \{fileID: (\d+)\}", b)
        kids = []
        if "m_Children:" in b:
            seg = b.split("m_Children:")[1]
            seg = seg.split("m_Father:")[0] if "m_Father:" in seg else seg
            kids = re.findall(r"fileID: (\d+)", seg)
        fa = re.search(r"m_Father: \{fileID: (\d+)\}", b)
        rt[fid] = {"go": go.group(1) if go else None, "children": kids,
                   "father": fa.group(1) if fa else "0", "cls": n["cls"]}
    go2rt = {v["go"]: k for k, v in rt.items() if v["go"]}
    return node, gos, rt, go2rt

def describe(fid, node, gos, rt, go2rt, out, depth=0):
    go = gos.get(fid)
    if not go:
        return
    pad = "  " * depth
    flag = "" if go["active"] else "  _(inactive)_"
    out.write(f"{pad}- **{go['name']}**{flag}\n")

    detail = []
    for c in go["comps"]:
        n = node.get(c)
        if not n:
            continue
        b, cls = n["body"], n["cls"]
        if cls in ("224", "4"):
            bits = []
            for k, label in [("m_AnchorMin", "anchorMin"), ("m_AnchorMax", "anchorMax"),
                             ("m_AnchoredPosition", "pos"), ("m_SizeDelta", "size"),
                             ("m_Pivot", "pivot"), ("m_LocalScale", "scale")]:
                v = vec(b, k)
                if v:
                    bits.append(f"{label}={v}")
            if bits:
                detail.append("`RectTransform` " + " ".join(bits))
        elif cls == "222":
            continue
        elif cls == "114":
            # field-based component identification
            if "m_ReferenceResolution" in b:
                bits = [f"ref={vec(b,'m_ReferenceResolution')}"]
                mm = re.search(r"m_ScreenMatchMode: (\d+)", b)
                mw = re.search(r"m_MatchWidthOrHeight: ([-\d.]+)", b)
                sm = re.search(r"m_UiScaleMode: (\d+)", b)
                if sm: bits.append(f"scaleMode={sm.group(1)}")
                if mm: bits.append(f"matchMode={mm.group(1)}")
                if mw: bits.append(f"match={f(mw.group(1))}")
                detail.append("`CanvasScaler` " + " ".join(bits))
            elif "m_text:" in b:
                t = re.search(r"m_text: (.*)", b)
                fs = re.search(r"m_fontSize: ([-\d.]+)", b)
                fa = re.search(r"m_fontAsset: \{fileID: \d+, guid: (\w+)", b)
                al = re.search(r"m_HorizontalAlignment: (\d+)", b)
                auto = re.search(r"m_enableAutoSizing: (\d)", b)
                bits = []
                if fa: bits.append(f"font={gname(fa.group(1))}")
                if fs: bits.append(f"size={f(fs.group(1))}")
                c2 = color(b, "m_fontColor")
                if c2: bits.append(f"color={c2}")
                if auto and auto.group(1) == "1":
                    mn = re.search(r"m_fontSizeMin: ([-\d.]+)", b)
                    mx = re.search(r"m_fontSizeMax: ([-\d.]+)", b)
                    bits.append(f"autoSize[{f(mn.group(1)) if mn else '?'}..{f(mx.group(1)) if mx else '?'}]")
                if t:
                    val = t.group(1).strip().strip("'").replace("\n", " ")
                    if val and val != "":
                        bits.append(f'text="{val[:60]}"')
                detail.append("`TMP_Text` " + " ".join(bits))
            elif "m_Transition:" in b:
                tr = re.search(r"m_Transition: (\d+)", b)
                ps = re.search(r"m_PressedSprite: \{fileID: [-\d]+, guid: (\w+)", b)
                bits = [f"transition={TRANS.get(tr.group(1), tr.group(1)) if tr else '?'}"]
                if ps: bits.append(f"pressedSprite={gname(ps.group(1))}")
                detail.append("`Button` " + " ".join(bits))
            elif "m_Sprite:" in b:
                sp = re.search(r"m_Sprite: \{fileID: [-\d]+, guid: (\w+)", b)
                bits = []
                bits.append(f"sprite={gname(sp.group(1))}" if sp else "sprite=None")
                c2 = color(b)
                if c2: bits.append(f"color={c2}")
                pa = re.search(r"m_PreserveAspect: (\d)", b)
                if pa and pa.group(1) == "1": bits.append("preserveAspect")
                detail.append("`Image` " + " ".join(bits))
            elif "m_CellSize" in b:
                bits = [f"cell={vec(b,'m_CellSize')}", f"spacing={vec(b,'m_Spacing')}"]
                detail.append("`GridLayoutGroup` " + " ".join(bits))
            elif "m_Alpha:" in b and "m_Interactable" in b:
                a = re.search(r"m_Alpha: ([-\d.]+)", b)
                detail.append(f"`CanvasGroup` alpha={f(a.group(1)) if a else '?'}")
            elif "m_Script" in b:
                g = re.search(r"m_Script: \{fileID: \d+, guid: (\w+)", b)
                if g:
                    nm = gname(g.group(1))
                    if nm.endswith(".cs"):
                        detail.append(f"`{nm[:-3]}`")
    for d in detail:
        out.write(f"{pad}  - {d}\n")

    r = go2rt.get(fid)
    if r:
        for c in rt[r]["children"]:
            cg = rt.get(c, {}).get("go")
            if cg:
                describe(cg, node, gos, rt, go2rt, out, depth + 1)

def main():
    scenes = [
        ("Portrait", os.path.join(GAME, "Scenes/MAP_PuzzleScene_Portrait.unity")),
        ("Landscape", os.path.join(GAME, "Scenes/MAP_PuzzleScene_Landscape.unity")),
    ]
    outdir = os.path.join(GAME, "docs/ui")
    os.makedirs(outdir, exist_ok=True)

    for label, path in scenes:
        node, gos, rt, go2rt = parse(path)
        roots = [fid for fid, v in rt.items() if v["father"] == "0" and v["go"]]
        out = io.StringIO()
        out.write(f"# Scene element spec — {label}\n\n")
        out.write(f"> Auto-generated from `{os.path.basename(path)}` by `extract_ui.py`.\n")
        out.write("> Values are Unity RectTransform values in **reference-resolution pixels**.\n")
        out.write("> `pos` = anchoredPosition, `size` = sizeDelta. Anchors are normalized (0..1).\n\n")
        for r in roots:
            describe(rt[r]["go"], node, gos, rt, go2rt, out)
        dest = os.path.join(outdir, f"scene-{label.lower()}.md")
        open(dest, "w", encoding="utf-8").write(out.getvalue())
        print(f"wrote {dest}  ({len(out.getvalue().splitlines())} lines)")

main()
