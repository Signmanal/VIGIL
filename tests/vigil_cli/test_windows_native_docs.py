from pathlib import Path


def test_windows_native_install_path_docs_match_installer() -> None:
    doc = Path("website/docs/user-guide/windows-native.md").read_text()
    install = Path("scripts/install.ps1").read_text()

    assert "%LOCALAPPDATA%\\vigil\\vigil-agent\\venv\\Scripts" in doc
    assert "Get-Command vigil        # should print C:\\Users\\<you>\\AppData\\Local\\vigil\\vigil-agent\\venv\\Scripts\\vigil.exe" in doc
    assert '$hermesBin = "$InstallDir\\venv\\Scripts"' in install
