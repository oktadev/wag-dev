"""Fail if auth-server/pnpm-lock.yaml resolves any package differently from the root lockfile.
The nested lock exists only so Vercel can build auth-server/ from its own directory."""
import re
import sys


def packages(path):
    text = open(path).read()
    return set(re.findall(r"^  '?((?:@[^@/\s']+/)?[^@/\s']+)@(\d[^:(\s']*)", text, re.M))


root, nested = packages("pnpm-lock.yaml"), packages("auth-server/pnpm-lock.yaml")
drift = sorted(nested - root)
if drift:
    print("auth-server/pnpm-lock.yaml has packages the root lockfile does not:")
    for name, version in drift:
        print(f"  {name}@{version}")
    print("Regenerate it: (cd auth-server && pnpm install --lockfile-only --ignore-workspace)")
    sys.exit(1)
print(f"lockfiles agree ({len(nested)} packages)")
