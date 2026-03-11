Option Explicit

Dim shell, fso, projectRoot, apiPath, localAppData, nodeDir, nodeExe, logPath, builtApiEntry
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

projectRoot = fso.GetParentFolderName(WScript.ScriptFullName)
projectRoot = fso.GetParentFolderName(projectRoot)
apiPath = fso.BuildPath(projectRoot, "services\api")
logPath = fso.BuildPath(projectRoot, "api-runtime.log")
localAppData = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%")
nodeDir = fso.BuildPath(fso.BuildPath(localAppData, "nvm"), "v22.15.0")
nodeExe = fso.BuildPath(nodeDir, "node.exe")
builtApiEntry = fso.BuildPath(apiPath, "dist\index.js")

If IsPortListening(4000) Then
  WScript.Quit 0
End If

If Not fso.FileExists(nodeExe) Then
  WScript.Echo "Node 22.15.0 was not found at " & nodeExe
  WScript.Quit 1
End If

If Not fso.FileExists(builtApiEntry) Then
  WScript.Echo "Built API server was not found at " & builtApiEntry
  WScript.Quit 1
End If

RunHidden BuildCmdCommand( _
  "set ""PATH=" & nodeDir & ";%PATH%"" && cd /d """ & apiPath & """ && """ & nodeExe & """ "".\dist\index.js"" >> """ & logPath & """ 2>&1" _
)

WScript.Quit 0

Function BuildCmdCommand(innerCommand)
  BuildCmdCommand = "cmd.exe /c """ & innerCommand & """"
End Function

Sub RunHidden(command)
  shell.Run command, 0, False
End Sub

Function IsPortListening(port)
  Dim exec, output
  Set exec = shell.Exec("cmd.exe /c netstat -ano -p tcp | findstr LISTENING | findstr :" & port)
  output = LCase(exec.StdOut.ReadAll())
  IsPortListening = (InStr(output, ":" & port) > 0)
End Function
