"""Run portable checks without npm/pip dependencies."""
import subprocess
import sys
from public_data import ROOT


def main():
    commands = [
        [sys.executable, '-X', 'utf8', 'scripts/build.py'],
        [sys.executable, '-X', 'utf8', '-m', 'unittest', 'discover', '-s', 'tests', '-v'],
        ['node', '--test', '--test-isolation=none', 'chrome_extension/tests/core.test.js', 'chrome_extension/tests/background.test.js'],
        [sys.executable, '-X', 'utf8', 'scripts/check_release.py'],
    ]
    for command in commands:
        subprocess.run(command, cwd=ROOT, check=True)


if __name__ == '__main__':
    main()
