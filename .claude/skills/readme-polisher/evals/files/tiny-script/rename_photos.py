"""Rename photos in a folder to YYYY-MM-DD_NNN.jpg using their modification date."""
import argparse
import datetime
import pathlib


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("folder", type=pathlib.Path)
    parser.add_argument("--dry-run", action="store_true", help="print the renames without doing them")
    args = parser.parse_args()

    files = sorted(p for p in args.folder.iterdir() if p.suffix.lower() in {".jpg", ".jpeg"})
    for index, path in enumerate(files, start=1):
        day = datetime.date.fromtimestamp(path.stat().st_mtime).isoformat()
        target = path.with_name(f"{day}_{index:03d}.jpg")
        print(f"{path.name} -> {target.name}")
        if not args.dry_run:
            path.rename(target)


if __name__ == "__main__":
    main()
