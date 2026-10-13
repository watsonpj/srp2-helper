#!/usr/bin/env python3
"""check_release.py [FOLDER] [--site URL]

Run this on the folder you are about to upload (default: the folder this script is in). It checks that the folder is ONE consistent
release: every page and script carries the same build id, every <script> tag asks for that id, and version.json agrees.

With --site, it also asks the live site (bypassing caches) which build it is serving, and whether each script on it is the right one,
so "I deployed but see the old version" can be told apart: did the files not arrive, or is it only a browser cache?
  python check_release.py . --site https://yourname.github.io/your-repo/
Exit status 0 = everything fine, 1 = a problem was found."""
import json, os, re, sys, time, urllib.request
PAGES = ["index.html", "cycle-messages.html"]; SCRIPTS = ["data.js", "app.js", "cycle-messages.js"]
CHECK = re.compile(r"<!-- srp2-build-check:start -->.*?<!-- srp2-build-check:end -->", re.S)
problems = []
def ok(msg): print("  OK       " + msg)
def bad(msg): problems.append(msg); print("  PROBLEM  " + msg)
def read(folder, name):
    p = os.path.join(folder, name)
    return open(p, encoding="utf-8").read() if os.path.isfile(p) else None
def stamp_of(js_text, name):
    m = re.match(r"window\.SRP2_BUILDS = window\.SRP2_BUILDS \|\| \{\}; window\.SRP2_BUILDS\['([^']+)'\] = '([^']*)';", js_text or "")
    return (m.group(1), m.group(2)) if m else (None, None)
def fetch(url):
    req = urllib.request.Request(url + ("&" if "?" in url else "?") + "t=" + str(int(time.time() * 1000)), headers={"Cache-Control": "no-cache", "Pragma": "no-cache"})
    with urllib.request.urlopen(req, timeout=15) as r: return r.read().decode("utf-8", "replace")
def check_folder(folder):
    print(f"Checking the folder {os.path.abspath(folder)}")
    vj = read(folder, "version.json"); build = None
    if vj is None: bad("version.json is missing. Pages can't tell when a newer build is deployed without it.")
    else:
        try: build = json.loads(vj)["build"]; ok(f"version.json says build {build}")
        except Exception: bad("version.json is not valid JSON of the form {\"build\": \"...\"}")
    blocks = {}
    for page in PAGES:
        t = read(folder, page)
        if t is None: bad(f"{page} is missing"); continue
        m = re.search(r'<meta name="srp2-build" content="([^"]*)"', t)
        if not m: bad(f"{page} has no build marker (meta srp2-build)")
        elif build and m.group(1) != build: bad(f"{page} is build {m.group(1)} but version.json says {build}")
        else: ok(f"{page} is build {m.group(1)}")
        c = CHECK.search(t); blocks[page] = c.group(0) if c else None
        if not c: bad(f"{page} has no self-check block, so it cannot notice a stale file")
        for src, v in re.findall(r'<script src="([^"?]+\.js)\?v=([^"]*)"', t):
            if read(folder, src) is None: bad(f"{page} loads {src}, which is not in the folder")
            elif build and v != build: bad(f"{page} asks for {src}?v={v} but the build is {build}")
            else: ok(f"{page} asks for {src}?v={v}")
    if len({b for b in blocks.values() if b}) > 1: bad("the self-check block differs between the pages")
    for js in SCRIPTS:
        t = read(folder, js)
        if t is None: bad(f"{js} is missing"); continue
        name, b = stamp_of(t, js)
        if b is None: bad(f"{js} has no build stamp on its first line")
        elif name != js: bad(f"{js} is stamped as '{name}'")
        elif build and b != build: bad(f"{js} is stamped build {b} but version.json says {build}")
        else: ok(f"{js} is stamped build {b}")
    return build
def check_site(site, build):
    site = site.rstrip("/") + "/"; print(f"\nChecking the live site {site}  (every request bypasses caches)")
    try: live = json.loads(fetch(site + "version.json"))["build"]
    except Exception as e: bad(f"could not read {site}version.json ({e}). Not deployed yet, wrong address, or the file was not uploaded."); return
    if build and live != build: bad(f"the site is serving build {live} but this folder is build {build}. The deployment has not finished or published these files (check which branch is published).")
    else: ok(f"the site is serving build {live}")
    for js in SCRIPTS:
        try:
            name, b = stamp_of(fetch(site + f"{js}"), js)
            if build and b != build: bad(f"{js} on the site is build {b or 'unknown'}, not {build}")
            else: ok(f"{js} on the site is build {b}")
        except Exception as e: bad(f"could not fetch {js} from the site ({e})")
    if not problems: print("  The live files are the right ones. If the page still looks old, it is the browser's cache: press Ctrl+F5, or add ?r=1 to the address.")
if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]; site = sys.argv[sys.argv.index("--site") + 1] if "--site" in sys.argv else None
    if site and site in args: args.remove(site)
    folder = args[0] if args else os.path.dirname(os.path.abspath(__file__))
    build = check_folder(folder)
    if site: check_site(site, build)
    print("\nAll good: this is one consistent release." if not problems else f"\n{len(problems)} problem(s) found. Fix these before uploading.")
    sys.exit(1 if problems else 0)
