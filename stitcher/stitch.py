"""Joins a guided set of phone photos into one 360° (equirectangular, 2:1) panorama with Hugin.

Each photo comes with the direction the phone was pointing when it was taken (yaw, pitch, roll in
degrees, from its motion sensors; yaw relative to the first photo). Those directions place the
photos roughly; Hugin then finds matching points between overlapping photos, fine-tunes the
positions and the lens's field of view, and blends the seams. If too few matches are found (a bare
wall, a dark room), the panorama is still assembled from the phone's directions alone.
"""

import glob
import os
import re
import subprocess
import tempfile
from dataclasses import dataclass

from PIL import Image

OUTPUT_WIDTH = 6000
BACKGROUND = (38, 40, 44)


@dataclass
class Shot:
    path: str
    yaw: float
    pitch: float
    roll: float


class StitchError(Exception):
    pass


def run(*args: str, cwd: str) -> str:
    result = subprocess.run(list(args), cwd=cwd, capture_output=True, text=True, timeout=600)
    if result.returncode != 0:
        raise StitchError(f"{args[0]} failed: {(result.stderr or result.stdout).strip()[-600:]}")
    return result.stdout


def control_points(pto: str) -> int:
    with open(pto, encoding="utf-8", errors="replace") as f:
        return sum(1 for line in f if line.startswith("c "))


def stitch(shots: list[Shot], hfov: float, workdir: str) -> tuple[bytes, dict]:
    """Returns the panorama as JPEG bytes, and what happened (for logs)."""
    if len(shots) < 6:
        raise StitchError("At least 6 photos are needed.")
    pto = os.path.join(workdir, "project.pto")
    names = [os.path.basename(s.path) for s in shots]

    # Rectilinear photos sharing one lens; the field of view is a starting guess, refined below.
    run("pto_gen", "-o", pto, "-p", "0", "-f", f"{hfov:.2f}", *names, cwd=workdir)
    positions = ",".join(f"y{i}={s.yaw:.3f},p{i}={s.pitch:.3f},r{i}={s.roll:.3f}" for i, s in enumerate(shots))
    run("pto_var", "--set", positions, "-o", pto, pto, cwd=workdir)

    # Matches only between photos the phone says overlap (fast, and no false matches across the room).
    run("cpfind", "--prealigned", "-o", pto, pto, cwd=workdir)
    run("cpclean", "-o", pto, pto, cwd=workdir)
    points = control_points(pto)
    aligned = points >= 2 * len(shots)
    if aligned:
        # Positions and the shared field of view; the first photo stays put as the reference.
        run("pto_var", "--opt", "y,p,r,v0,!y0,!p0,!r0", "-o", pto, pto, cwd=workdir)
        run("autooptimiser", "-n", "-o", pto, pto, cwd=workdir)
        # Even out exposure and vignetting between photos, so the seams don't show.
        if os.environ.get("STITCH_PHOTOMETRIC", "1") == "1":
            try:
                run("autooptimiser", "-m", "-o", pto, pto, cwd=workdir)
            except StitchError:
                pass

    height = OUTPUT_WIDTH // 2
    run(
        "pano_modify",
        # Level the horizon: the first photo anchors the rest, and its own tilt shouldn't tilt the room.
        "--straighten",
        "--projection=2",
        "--fov=360x180",
        f"--canvas={OUTPUT_WIDTH}x{height}",
        f"--crop=0,{OUTPUT_WIDTH},0,{height}",
        "--ldr-file=TIF",
        "--ldr-compression=NONE",
        "-o",
        pto,
        pto,
        cwd=workdir,
    )
    run("nona", "-m", "TIFF_m", "-o", "remap", pto, cwd=workdir)
    parts = sorted(glob.glob(os.path.join(workdir, "remap*.tif")))
    if not parts:
        raise StitchError("Nothing was rendered.")
    # Hugin's own blender: enblend left black patches where photos cross the 180° seam.
    run("verdandi", "--wrap", "-o", "pano.tif", *[os.path.basename(p) for p in parts], cwd=workdir)

    # Whatever no photo covered (usually a patch straight down) gets a quiet neutral colour.
    pano = Image.open(os.path.join(workdir, "pano.tif"))
    pano.load()
    canvas = Image.new("RGB", pano.size, BACKGROUND)
    canvas.paste(pano.convert("RGB"), mask=pano.getchannel("A") if "A" in pano.getbands() else None)
    out = os.path.join(workdir, "pano.jpg")
    canvas.save(out, "JPEG", quality=88, optimize=True)
    with open(out, "rb") as f:
        data = f.read()
    fov = re.search(r"\bv([0-9.]+)", open(pto, encoding="utf-8", errors="replace").read().split("\ni ", 1)[-1])
    return data, {"photos": len(shots), "controlPoints": points, "aligned": aligned, "fov": float(fov.group(1)) if fov else hfov}


def stitch_files(shots: list[tuple[bytes, float, float, float]], hfov: float) -> tuple[bytes, dict]:
    with tempfile.TemporaryDirectory(prefix="stitch-") as workdir:
        prepared = []
        for i, (data, yaw, pitch, roll) in enumerate(shots):
            path = os.path.join(workdir, f"{i:04d}.jpg")
            with open(path, "wb") as f:
                f.write(data)
            prepared.append(Shot(path, yaw, pitch, roll))
        return stitch(prepared, hfov, workdir)
