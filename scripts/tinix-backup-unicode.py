"""[TINIX] Windows Unicode backup and restore using Python's UTF-8/PAX tar reader."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import re
import shutil
import stat
import sys
import tarfile
import tempfile
import unicodedata


def require(condition, code):
    if not condition:
        raise ValueError(code)


def path_key(name, directory=False):
    if name.startswith("./"):
        name = name[2:]
    if directory and name in ("", "."):
        return ""
    name = name.removesuffix("/") if directory else name
    for part in name.split("/"):
        require(part not in ("", ".", "..") and part == part.rstrip(" .")
                and not re.search(r'[:<>"\\|?*\x00-\x1f\ud800-\udfff]', part)
                and not re.match(r"(?i)^(CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)", part),
                "TAR_UNSAFE_WINDOWS_PATH")
    return name


def folded(name):
    return unicodedata.normalize("NFC", name).casefold()


def register(known, name, kind):
    parts = name.split("/")
    for i in range(1, len(parts)):
        parent = "/".join(parts[:i])
        entry = known.setdefault(folded(parent), (parent, "dir", False))
        require(entry[:2] == (parent, "dir"), "TAR_WINDOWS_PATH_COLLISION")
    old = known.get(folded(name))
    require(old is None or old == (name, kind, False), "TAR_WINDOWS_PATH_COLLISION")
    known[folded(name)] = (name, kind, True)


def ordinary(file, kind):
    info = file.lstat()
    require(not (getattr(info, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT)
            and (stat.S_ISDIR(info.st_mode) if kind == "dir" else stat.S_ISREG(info.st_mode)),
            "TAR_NON_REGULAR_ENTRY")


def member_type(member):
    if member.isdir():
        return "dir"
    require(member.type in (tarfile.REGTYPE, tarfile.AREGTYPE) and member.sparse is None,
            "TAR_NON_REGULAR_MEMBER")
    return "file"


def scan_or_extract(archive, destination=None, expected=None):
    entries = {}
    known = {}
    with gzip.open(archive, "rb") as compressed:
        with tarfile.open(fileobj=compressed, mode="r|", encoding="utf-8", errors="strict") as stream:
            for member in stream:
                kind = member_type(member)
                name = path_key(member.name, kind == "dir")
                register(known, name, kind)
                require(name not in entries, "TAR_DUPLICATE_MEMBER")
                require(member.size >= 0 and (kind == "file" or member.size == 0), "TAR_INVALID_MEMBER_SIZE")
                info = (kind, member.size)
                if destination is None:
                    if kind == "file":
                        with stream.extractfile(member) as data:
                            checksum = hashlib.file_digest(data, "sha256").hexdigest()
                    else:
                        checksum = None
                    entries[name] = (*info, checksum)
                    continue
                require(name in expected and expected[name][:2] == info, "TAR_MEMBER_CHANGED")
                entries[name] = expected[name]
                if not name:
                    continue
                target = destination / name
                parent = destination
                for part in name.split("/")[:-1]:
                    parent /= part
                    parent.mkdir(exist_ok=True)
                    ordinary(parent, "dir")
                if kind == "dir":
                    target.mkdir(exist_ok=True)
                    ordinary(target, "dir")
                else:
                    with stream.extractfile(member) as data, target.open("xb") as out:
                        shutil.copyfileobj(data, out, 256 * 1024)
        # Read through the gzip checksum even when tar ended before the final compressed bytes.
        while compressed.read(256 * 1024):
            pass
    if destination is not None:
        require(entries == expected, "TAR_MEMBER_SET_CHANGED")
        actual_files = {}
        actual_dirs = set()
        for item in destination.rglob("*"):
            rel = item.relative_to(destination).as_posix()
            if item.is_dir():
                ordinary(item, "dir")
                actual_dirs.add(rel)
            else:
                ordinary(item, "file")
                with item.open("rb") as source:
                    actual_files[rel] = (item.stat().st_size, hashlib.file_digest(source, "sha256").hexdigest())
        expected_dirs = {entry[0] for entry in known.values() if entry[1] == "dir" and entry[0]}
        expected_files = {name: (size, checksum) for name, (kind, size, checksum) in expected.items() if kind == "file"}
        require(actual_dirs == expected_dirs and actual_files == expected_files, "TAR_RESTORED_PATH_SIZE_OR_HASH_MISMATCH")
    return entries


def restore(archive, destination, target_layout=None, expected_dirs=None):
    # No restore destination is created until every member and collision is inspected.
    source = archive.stat()
    expected = scan_or_extract(archive)
    if expected_dirs is not None:
        require({name for name, (kind, _, _) in expected.items() if kind == "dir" and name} == set(expected_dirs)
                and {name: checksum for name, (kind, _, checksum) in expected.items() if kind == "file"} == target_layout,
                "TAR_UNEXPECTED_OR_MISSING_MEMBER")
    size = sum(size for kind, size, _ in expected.values() if kind == "file")
    require(size <= shutil.disk_usage(destination.parent).free, "TAR_RESTORE_INSUFFICIENT_SPACE")
    require(archive.stat().st_mtime_ns == source.st_mtime_ns and archive.stat().st_size == source.st_size,
            "TAR_ARCHIVE_CHANGED")
    destination.mkdir()
    scan_or_extract(archive, destination, expected)
    require(archive.stat().st_mtime_ns == source.st_mtime_ns and archive.stat().st_size == source.st_size,
            "TAR_ARCHIVE_CHANGED")
    return len(expected)


def create(root, archive, inventory):
    check = {}
    ordinary(root, "dir")
    files, directories = inventory["files"], inventory["directories"]
    for kind, names in (("dir", directories), ("file", files)):
        for raw in names:
            name = path_key(raw, kind == "dir")
            require(name and name == raw, "TAR_UNSAFE_WINDOWS_PATH")
            register(check, name, kind)
            ordinary(root / name, kind)
    with archive.open("xb") as file:
        with tarfile.open(fileobj=file, mode="w|gz", format=tarfile.PAX_FORMAT,
                          encoding="utf-8", errors="strict", dereference=True) as target:
            target.add(root, arcname=".", recursive=False)
            for name in directories:
                item = root / name
                ordinary(item, "dir")
                target.add(item, arcname=name, recursive=False)
            for name in files:
                item = root / name
                ordinary(item, "file")
                target.add(item, arcname=name, recursive=False)
    with tempfile.TemporaryDirectory(prefix=".verify-static-", dir=archive.parent) as scratch:
        return restore(archive, Path(scratch) / "tree", files, directories)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("create", "restore"))
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    try:
        if args.action == "create":
            inventory = json.loads(sys.stdin.buffer.read())
            members = create(args.source, args.destination, inventory)
        else:
            members = restore(args.source, args.destination)
        print(json.dumps({"members": members}))
    except (OSError, ValueError, tarfile.TarError, EOFError) as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
