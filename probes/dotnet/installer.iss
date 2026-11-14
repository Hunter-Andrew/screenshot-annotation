; Per-user Inno Setup installer for the throwaway probe.
[Setup]
AppName=DotnetProbe
AppVersion=0.0.1
DefaultDirName={localappdata}\Programs\DotnetProbe
PrivilegesRequired=lowest
DisableProgramGroupPage=yes
OutputDir=out
OutputBaseFilename=DotnetProbe-Setup
Compression=lzma2
ArchitecturesInstallIn64BitMode=x64compatible

[Files]
Source: "publish\*"; DestDir: "{app}"; Flags: recursesubdirs

[Icons]
Name: "{userprograms}\DotnetProbe"; Filename: "{app}\DotnetProbe.exe"

[Run]
Filename: "{app}\DotnetProbe.exe"; Flags: nowait postinstall
