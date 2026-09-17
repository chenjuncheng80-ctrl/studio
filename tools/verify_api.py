"""Live check of the publish path against the real GitHub API.

Mirrors js/github.js exactly: blob -> tree -> commit -> ref, then verifies the
file landed and rolls main back to the original commit.
Run: python tools/verify_api.py
"""
import base64
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

OWNER, REPO, BRANCH = "chenjuncheng80-ctrl", "studio", "main"
API = "https://api.github.com"


def token() -> str:
    out = subprocess.run(
        ["git", "credential", "fill"],
        input="protocol=https\nhost=github.com\n\n",
        capture_output=True, text=True, check=True,
    ).stdout
    for line in out.splitlines():
        if line.startswith("password="):
            return line[len("password="):]
    sys.exit("no token")


TOKEN = token()


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Authorization", "Bearer " + TOKEN)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        sys.exit("FAIL %s %s → %s %s" % (method, path, e.code, e.read().decode()[:300]))


parent = call("GET", "/repos/%s/%s/git/ref/heads/%s" % (OWNER, REPO, BRANCH))["object"]["sha"]
base_tree = call("GET", "/repos/%s/%s/git/commits/%s" % (OWNER, REPO, parent))["tree"]["sha"]
print("parent", parent[:8], "base tree", base_tree[:8])

content = base64.b64encode(b"api smoke test\n").decode()
blob = call("POST", "/repos/%s/%s/git/blobs" % (OWNER, REPO),
            {"content": content, "encoding": "base64"})
print("blob", blob["sha"][:8])

tree = call("POST", "/repos/%s/%s/git/trees" % (OWNER, REPO),
            {"base_tree": base_tree,
             "tree": [{"path": "tools/.api-smoke", "mode": "100644", "type": "blob", "sha": blob["sha"]}]})
print("tree", tree["sha"][:8])

commit = call("POST", "/repos/%s/%s/git/commits" % (OWNER, REPO),
              {"message": "api smoke test", "tree": tree["sha"], "parents": [parent]})
print("commit", commit["sha"][:8])

call("PATCH", "/repos/%s/%s/git/refs/heads/%s" % (OWNER, REPO, BRANCH), {"sha": commit["sha"]})
print("ref updated")

got = call("GET", "/repos/%s/%s/contents/tools/.api-smoke?ref=%s" % (OWNER, REPO, BRANCH))
assert base64.b64decode(got["content"]).decode() == "api smoke test\n", "content mismatch"
print("file present on", BRANCH, "✓")

# roll back so the smoke test leaves no trace
call("PATCH", "/repos/%s/%s/git/refs/heads/%s" % (OWNER, REPO, BRANCH),
     {"sha": parent, "force": True})
check = call("GET", "/repos/%s/%s/git/ref/heads/%s" % (OWNER, REPO, BRANCH))
assert check["object"]["sha"] == parent, "rollback failed"
print("rolled back to", parent[:8], "✓")
