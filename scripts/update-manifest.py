import json
import hashlib
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parents[1]
zip_path = root / "Jellyfin.Plugin.SST.zip"
manifest_path = root / "manifest.json"
props_path = root / "Directory.Build.props"

version = re.search(r"<Version>([^<]+)</Version>", props_path.read_text()).group(1)
checksum = hashlib.md5(zip_path.read_bytes()).hexdigest()
timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
updated = False
for entry in manifest[0]["versions"]:
    if entry["version"] == version:
        entry["checksum"] = checksum
        entry["timestamp"] = timestamp
        updated = True
        break

if not updated:
    print(f"Version {version} not found in manifest.json", file=sys.stderr)
    sys.exit(1)

manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print(f"Updated manifest.json: version={version} checksum={checksum}")
